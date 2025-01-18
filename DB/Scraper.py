import sqlite3
import re
import torch
import os
import sys
import random
import time
import json
import logging
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

# Selenium & WebDriver
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains

# Transformers & NER
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

# BeautifulSoup
from bs4 import BeautifulSoup

# Fake user agent for anti-scraping
from fake_useragent import UserAgent

###############################################################################
#                            CONFIG & GLOBALS
###############################################################################

logger = logging.getLogger("pubmed_scraper")
logger.setLevel(logging.DEBUG)

# File handler: write messages >= INFO into "scraper.log"
file_handler = logging.FileHandler("scraper.log", mode="a", encoding="utf-8")
file_handler.setLevel(logging.INFO)
file_formatter = logging.Formatter(
    fmt="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

# Console handler: messages >= DEBUG go to stdout
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
console_formatter = logging.Formatter(
    fmt="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

FAILURES_LOG = "failures.log"
DB_FILE = "scraped_data.db"

CHECKPOINT_FILE = "scraped_links.txt"  # This is for link-level checkpointing (unchanged)
PROGRESS_JSON = "progress_checkpoint.json"  # This will store the last page scraped for each drug

DRUG_TERMS = [
    "ozempic", "semaglutide", "liraglutide", "tesamorelin", "bpc-157",
    "ipamorelin", "ghrp-6", "cjc-1295", "mk-677", "sarms",
    "nootropics", "glp-1", "peptides", "tirzepatide", "melanotan",
    "pt-141", "tb-500", "ghk-cu", "hexarelin", "selank", "retatutride",
    "tirzeptide", "zepbound", "wegovy"
]

BASE_URL_TEMPLATE = "https://pubmed.ncbi.nlm.nih.gov/?term={term}&filter=pubt.clinicaltrial"

MODEL_NAME = "jsylee/scibert_scivocab_uncased-finetuned-ner"
ID2LABEL = {0: 'O', 1: 'B-DRUG', 2: 'I-DRUG', 3: 'B-EFFECT', 4: 'I-EFFECT'}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"Using device: {device}")

try:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME,
        num_labels=5,
        id2label=ID2LABEL
    ).to(device)
    model.eval()

    nlp_pipeline = pipeline(
        task="ner",
        model=model,
        tokenizer=tokenizer,
        device=0 if torch.cuda.is_available() else -1,
        aggregation_strategy="simple",
    )
    # Warm-up inference
    logger.debug("Warming up the NER pipeline with a dummy inference...")
    _ = nlp_pipeline("WARMUP PASS")
    logger.info("Model pipeline loaded and warmed up successfully.")
except Exception as e:
    logger.error(f"Error initializing the model pipeline: {e}", exc_info=True)
    raise e

###############################################################################
#                     CHECKPOINT SYSTEM (PAGE-LEVEL PROGRESS)
###############################################################################
def load_progress():
    """
    Load a JSON file storing last_page info:
    {
      "ozempic": 3,
      "semaglutide": 5,
      ...
    }
    """
    if not os.path.exists(PROGRESS_JSON):
        return {}
    with open(PROGRESS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)

def save_progress(progress_dict):
    """
    Overwrite the JSON file with updated last_page info.
    """
    with open(PROGRESS_JSON, "w", encoding="utf-8") as f:
        json.dump(progress_dict, f, indent=2)

###############################################################################
#                     OPTIONAL CHECKPOINT LOAD & STORE
###############################################################################
def load_scraped_links():
    """
    Old link-level checkpoint, if you want to skip certain links altogether.
    """
    if not os.path.exists(CHECKPOINT_FILE):
        return set()
    found = set()
    with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                found.add(line)
    return found

def store_page_links(drug_name, page_num, links):
    """
    Write each found link for this page to 'scraped_links.txt'
    in the format: drug_name|page=PAGE_NUM|article_link
    """
    with open(CHECKPOINT_FILE, "a", encoding="utf-8") as f:
        for link in links:
            line = f"{drug_name}|page={page_num}|{link}"
            f.write(line + "\n")

###############################################################################
#                       SQLITE INITIALIZATION
###############################################################################
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Create the articles table (with publication_date column for storing normalized date)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_url TEXT UNIQUE,
            pmid TEXT,
            doi TEXT,
            title TEXT,
            background TEXT,
            methods TEXT,
            results TEXT,
            conclusions TEXT,
            sponsor TEXT,
            publication_date TEXT  -- store date as string 'YYYY-MM-DD'
        )
    """)

    # Create the article_drugs link table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS article_drugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER,
            drug_name TEXT,
            UNIQUE(article_id, drug_name),
            FOREIGN KEY(article_id) REFERENCES articles(id)
        )
    """)
    conn.commit()
    conn.close()
    logger.debug("Database schema verified (articles + article_drugs).")

def get_or_create_article_id(article_data):
    """
    Insert (or find existing) row in articles table based on article_url
    Return the article_id.
    """
    article_url = article_data.get("article_url")  # we'll treat 'url' as unique

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Check if article_url already exists
    cursor.execute("SELECT id FROM articles WHERE article_url=? LIMIT 1", (article_url,))
    row = cursor.fetchone()
    if row:
        article_id = row[0]
        conn.close()
        return article_id

    # Otherwise, insert new
    cursor.execute("""
        INSERT INTO articles (
            article_url, pmid, doi, title, background, methods, results,
            conclusions, sponsor, publication_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        article_url,
        article_data.get("pmid"),
        article_data.get("doi"),
        article_data.get("title"),
        article_data.get("background"),
        article_data.get("methods"),
        article_data.get("results"),
        article_data.get("conclusions"),
        article_data.get("sponsor"),
        article_data.get("publication_date")
    ))
    article_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return article_id

def save_article_drugs(article_id, identified_drugs):
    """
    For each drug in identified_drugs, insert a row in article_drugs (article_id, drug_name).
    Use INSERT OR IGNORE to avoid duplicates.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    for drug in identified_drugs:
        cursor.execute("""
            INSERT OR IGNORE INTO article_drugs (article_id, drug_name)
            VALUES (?, ?)
        """, (article_id, drug))
    conn.commit()
    conn.close()
    if identified_drugs:
        logger.info(f"Article {article_id} => DRUGS={identified_drugs}")

###############################################################################
#                      LOGGING FAILURES
###############################################################################
def log_failure(article_url, reason):
    with open(FAILURES_LOG, "a", encoding="utf-8") as f:
        f.write(f"{article_url} - {reason}\n")
    logger.warning(f"SKIPPED: {reason} | {article_url}")

###############################################################################
#                      NER FALLBACK FOR DRUG EXTRACTION
###############################################################################
def fallback_extract_drugs(*text_fields):
    from transformers import pipeline
    all_drugs = set()
    for txt in text_fields:
        # Because the model can handle up to 512 tokens
        truncated = txt[:4000]  # or use a more robust approach
        entities = nlp_pipeline(truncated)
        for ent in entities:
            if ent["entity_group"] == "DRUG":
                all_drugs.add(ent["word"])
    return sorted(all_drugs)

###############################################################################
#                           DATE PARSING
###############################################################################
def parse_publication_date(soup):
    """
    Instead of just <span class='cit'>, scan entire heading section:
    <div class="full-view" id="full-view-heading"> ... for a pattern like
      2021 Mar 18
      2021 Aug   or
      2020 Jun
    Return 'YYYY-MM-DD' or None
    """
    heading_div = soup.find("div", class_="full-view", id="full-view-heading")
    if not heading_div:
        return None

    heading_text = heading_div.get_text(" ", strip=True)
    # Look for 'YYYY MMM DD' or 'YYYY MMM'
    match = re.search(r"(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})", heading_text)
    if match:
        year_str, month_str, day_str = match.groups()
        try:
            dt = datetime.strptime(f"{year_str} {month_str} {day_str}", "%Y %b %d")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    # If we only find 'YYYY MMM' (like '2020 Jun')
    match2 = re.search(r"(\d{4})\s+([A-Za-z]{3})(?!\s+\d)", heading_text)
    if match2:
        year_str, month_str = match2.groups()
        try:
            dt = datetime.strptime(f"{year_str} {month_str} 1", "%Y %b %d")
            # We'll store it as the 1st of that month
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return None
###############################################################################
#                  SELENIUM & BEAUTIFULSOUP EXTRACTION
###############################################################################
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument(f"--user-agent={ua.random}")

    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(5)
    return driver

def extract_article_data(driver, article_url):
    """
    Return a dict with article data or None if skipping.
    """
    try:
        driver.get(article_url)
        time.sleep(random.uniform(1, 3))
        soup = BeautifulSoup(driver.page_source, "html.parser")

        # Title
        title_div = soup.find("h1", class_="heading-title")
        if not title_div:
            logger.warning(f"No title => SKIPPING {article_url}")
            return None

        title_text = title_div.get_text(strip=True) or ""

        # PMID & DOI
        pmid, doi = None, None
        identifiers_ul = soup.find("ul", {"id": "full-view-identifiers", "class": "identifiers"})
        if identifiers_ul:
            pmid_strong = identifiers_ul.select_one("span.identifier.pubmed strong.current-id")
            if pmid_strong:
                pmid = pmid_strong.get_text(strip=True)
            doi_link = identifiers_ul.select_one("span.identifier.doi a.id-link")
            if doi_link:
                doi = doi_link.get_text(strip=True)

        # Abstract
        abstract_div = soup.find("div", id="abstract")
        abstract_parts = abstract_div.find_all("p") if abstract_div else []
        background_text = abstract_parts[0].get_text(strip=True) if len(abstract_parts) > 0 else ""
        methods_text = abstract_parts[1].get_text(strip=True) if len(abstract_parts) > 1 else ""

        sections = {"Results": "", "Conclusions": ""}
        for part in abstract_parts[2:]:
            sub_title = part.find("strong", class_="sub-title")
            if sub_title:
                section_name = sub_title.get_text(strip=True).rstrip(":")
                text_content = part.get_text(strip=True).replace(sub_title.get_text(strip=True), "").strip()
                if section_name in sections:
                    sections[section_name] = text_content

        sponsor_match = re.search(r"(Funded by|Sponsored by)\s(.+?)(\.|;|$)", sections["Conclusions"])
        sponsor = sponsor_match.group(2).strip() if sponsor_match else ""

        # Extract & parse publication date from <span class="cit">2021 Mar 18; ...</span>
        publication_date = parse_publication_date(soup)

        return {
            "article_url": article_url,  # we treat this as unique
            "pmid": pmid,
            "doi": doi,
            "title": title_text,
            "background": background_text,
            "methods": methods_text,
            "results": sections["Results"],
            "conclusions": sections["Conclusions"],
            "sponsor": sponsor,
            "publication_date": publication_date
        }
    except Exception as e:
        logger.error(f"Error extracting {article_url}: {e}", exc_info=True)
        return None

###############################################################################
#                            PAGE CHECK
###############################################################################
def get_max_pages(soup):
    page_number_input = soup.select_one("form.page-number-form input.page-number")
    if page_number_input:
        max_val = page_number_input.get("max")
        if max_val and max_val.isdigit():
            return int(max_val)
    return None

def article_already_in_db(article_url):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM articles WHERE article_url=? LIMIT 1", (article_url,))
    row = cursor.fetchone()
    conn.close()
    return bool(row)

###############################################################################
#                           MAIN PAGINATION LOGIC
###############################################################################
def scrape_page(driver, base_url, page_num):
    driver.get(base_url)
    time.sleep(random.uniform(1, 3))
    soup = BeautifulSoup(driver.page_source, "html.parser")

    max_pages = get_max_pages(soup)
    article_links = [
        f"https://pubmed.ncbi.nlm.nih.gov{a['href']}"
        for a in soup.select("a.docsum-title")
        if a.get("href")
    ]
    next_button = soup.select_one("button.next-page-btn")
    has_next = bool(next_button and "disabled-icon" not in next_button.get("class", ""))

    logger.info(f"Page {page_num} -> found {len(article_links)} links (max_pages={max_pages})")
    return article_links, has_next, max_pages

def scrape_drug_term(drug_name, progress):
    """
    Scrape the given drug, starting from progress.get(drug_name, 1) if present.
    After each page, update the checkpoint.
    """
    thread_name = threading.current_thread().name
    logger.info(f"[{thread_name}] Starting {drug_name}")

    driver = configure_selenium()
    # Figure out last_page from progress
    start_page = progress.get(drug_name, 1)
    logger.info(f"[{thread_name}] Resuming {drug_name} at page {start_page}")

    # Build URL with &page=N if we want to jump directly, e.g. pubmed doesn't always support it well,
    # but let's do it carefully:
    page_num = start_page
    base_url = BASE_URL_TEMPLATE.format(term=drug_name)
    if page_num > 1:
        base_url += f"&page={page_num}"

    all_links = []
    all_links_set = set()
    max_pages_found = None

    while True:
        # 1) Scrape the current page
        try:
            new_links, has_next, maybe_max_pages = scrape_page(driver, base_url, page_num)
        except Exception as e:
            logger.error(f"Error scraping page {page_num} for {drug_name}: {e}", exc_info=True)
            break

        # 2) Deduplicate
        for link in new_links:
            if link not in all_links_set:
                all_links.append(link)
                all_links_set.add(link)

        # 3) If we discovered max_pages, store it
        if maybe_max_pages and not max_pages_found:
            max_pages_found = maybe_max_pages
            logger.debug(f"[{thread_name}] Found a max_pages={max_pages_found} for '{drug_name}'")

        # 4) If page_num >= max_pages_found, we break
        if max_pages_found and page_num >= max_pages_found:
            logger.info(f"[{thread_name}] Reached last page ({page_num} of {max_pages_found}) for '{drug_name}'")
            progress[drug_name] = page_num  # store the final page
            save_progress(progress)
            break

        if not has_next:
            logger.info(f"[{thread_name}] No more pages for '{drug_name}' after page {page_num}")
            progress[drug_name] = page_num
            save_progress(progress)
            break

        # 5) Update checkpoint for this page
        progress[drug_name] = page_num
        save_progress(progress)

        # 6) Next page
        page_num += 1
        logger.info(f"[{thread_name}] Moving to page {page_num} for '{drug_name}'")
        time.sleep(random.uniform(2, 5))

        # Attempt to click next
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR, "button.next-page-btn")
            ActionChains(driver).move_to_element(next_btn).click().perform()
            time.sleep(random.uniform(1, 3))
            # Update base_url
            base_url = driver.current_url
        except Exception as e:
            logger.error(f"Error on next page for {drug_name}: {e}", exc_info=True)
            break

    logger.info(f"[{thread_name}] Done collecting links for '{drug_name}'. Total {len(all_links)} unique links.")

    # Now scrape each link
    for link in all_links:
        if article_already_in_db(link):
            continue
        article_data = extract_article_data(driver, link)
        if not article_data:
            log_failure(link, f"Skipped article for {drug_name}")
            continue

        # Identify recognized drugs from the text (title, background, methods, results, conclusions)
        identified_drugs = fallback_extract_drugs(
            article_data.get("title") or "",
            article_data.get("background") or "",
            article_data.get("methods") or "",
            article_data.get("results") or "",
            article_data.get("conclusions") or ""
        )
        if not identified_drugs:
            logger.warning(f"No recognized drug => SKIPPING {link}")
            continue

        # Insert article, get article_id
        article_id = get_or_create_article_id(article_data)
        # Insert drug references
        save_article_drugs(article_id, identified_drugs)

    driver.quit()
    logger.info(f"[{thread_name}] Finished scraping '{drug_name}'")

###############################################################################
#                                   MAIN
###############################################################################
def main():
    init_db()

    # Load the JSON progress (which pages we left off on)
    progress = load_progress()

    with ThreadPoolExecutor(max_workers=3) as executor:
        for drug in DRUG_TERMS:
            executor.submit(scrape_drug_term, drug, progress)

    logger.info("All scraping tasks completed.")

if __name__ == "__main__":
    main()
