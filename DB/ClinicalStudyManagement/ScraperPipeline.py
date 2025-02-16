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
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

# Selenium & WebDriver
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Transformers & NER
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

# BeautifulSoup for HTML parsing
from bs4 import BeautifulSoup

# Fake user agent for anti-scraping
from fake_useragent import UserAgent

###############################################################################
#                            CONFIG & GLOBALS
###############################################################################
logger = logging.getLogger("pubmed_scraper")
logger.setLevel(logging.DEBUG)

# File handler for logging to file
file_handler = logging.FileHandler("scraper.log", mode="a", encoding="utf-8")
file_handler.setLevel(logging.INFO)
file_formatter = logging.Formatter(fmt="%(asctime)s - %(levelname)s - %(message)s",
                                   datefmt="%Y-%m-%d %H:%M:%S")
file_handler.setFormatter(file_formatter)
logger.addHandler(file_handler)

# Console handler for logging to stdout
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.DEBUG)
console_formatter = logging.Formatter(fmt="%(asctime)s [%(levelname)s] %(message)s",
                                      datefmt="%H:%M:%S")
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

FAILURES_LOG = "failures.log"
# Database file for pepsource (adjust the path as needed)
DB_FILE = "DB/pepsources.db"

CHECKPOINT_FILE = "scraped_links.txt"  # For link-level checkpointing
PROGRESS_JSON = "progress_checkpoint.json"  # For page-level checkpointing

# Base URL for PubMed search using the drug term
BASE_URL_TEMPLATE = "https://pubmed.ncbi.nlm.nih.gov/?term={term}"

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
    if not os.path.exists(PROGRESS_JSON):
        return {}
    with open(PROGRESS_JSON, "r", encoding="utf-8") as f:
        content = f.read().strip()
        if not content:
            return {}
        return json.loads(content)

def save_progress(progress_dict):
    with open(PROGRESS_JSON, "w", encoding="utf-8") as f:
        json.dump(progress_dict, f, indent=2)

###############################################################################
#                SQLITE INITIALIZATION (Drugs and Articles Tables)
###############################################################################
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Create the Drugs table if it doesn't exist.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS Drugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            last_checked TEXT
        )
    """)
    # Create the articles table with a drug_id column to link the article directly.
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
            publication_date TEXT,
            drug_id TEXT
        )
    """)
    conn.commit()
    conn.close()
    logger.debug("Database schema verified (Drugs and articles tables).")

def ensure_drugs_table_has_last_checked():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(Drugs)")
    columns = [row[1] for row in cursor.fetchall()]
    if "last_checked" not in columns:
        cursor.execute("ALTER TABLE Drugs ADD COLUMN last_checked TEXT")
        conn.commit()
        logger.info("Added 'last_checked' column to Drugs table.")
    conn.close()

###############################################################################
#                      UPDATE DRUG LAST CHECKED
###############################################################################
def update_drug_last_checked(drug_id):
    now_str = datetime.now().strftime("%Y-%m-%d")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("UPDATE Drugs SET last_checked = ? WHERE id = ?", (now_str, drug_id))
    conn.commit()
    conn.close()
    logger.info(f"Updated drug_id {drug_id} with last_checked = {now_str}")

###############################################################################
#                      GET OR CREATE ARTICLE ID
###############################################################################
def get_or_create_article_id(article_data, drug_id):
    article_url = article_data.get("article_url")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM articles WHERE article_url=? LIMIT 1", (article_url,))
    row = cursor.fetchone()
    if row:
        article_id = row[0]
        cursor.execute("UPDATE articles SET drug_id = ? WHERE id = ?", (drug_id, article_id))
        conn.commit()
        conn.close()
        return article_id
    cursor.execute("""
        INSERT INTO articles (
            article_url, pmid, doi, title, background, methods, results,
            conclusions, sponsor, publication_date, drug_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        article_data.get("publication_date"),
        drug_id
    ))
    article_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return article_id

###############################################################################
#                      LOGGING FAILURES
###############################################################################
def log_failure(article_url, reason):
    with open(FAILURES_LOG, "a", encoding="utf-8") as f:
        f.write(f"{article_url} - {reason}\n")
    logger.warning(f"SKIPPED: {reason} | {article_url}")

###############################################################################
#                           DATE PARSING
###############################################################################
def parse_publication_date(soup):
    heading_div = soup.find("div", class_="full-view", id="full-view-heading")
    if not heading_div:
        return None
    heading_text = heading_div.get_text(" ", strip=True)
    match = re.search(r"(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})", heading_text)
    if match:
        year_str, month_str, day_str = match.groups()
        try:
            dt = datetime.strptime(f"{year_str} {month_str} {day_str}", "%Y %b %d")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass
    match2 = re.search(r"(\d{4})\s+([A-Za-z]{3})(?!\s+\d)", heading_text)
    if match2:
        year_str, month_str = match2.groups()
        try:
            dt = datetime.strptime(f"{year_str} {month_str} 1", "%Y %b %d")
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
    try:
        driver.get(article_url)
        time.sleep(random.uniform(1, 3))
        soup = BeautifulSoup(driver.page_source, "html.parser")
        title_div = soup.find("h1", class_="heading-title")
        if not title_div:
            logger.warning(f"No title for {article_url}; skipping.")
            return None
        title_text = title_div.get_text(strip=True) or ""
        pmid, doi = None, None
        identifiers_ul = soup.find("ul", {"id": "full-view-identifiers", "class": "identifiers"})
        if identifiers_ul:
            pmid_strong = identifiers_ul.select_one("span.identifier.pubmed strong.current-id")
            if pmid_strong:
                pmid = pmid_strong.get_text(strip=True)
            doi_link = identifiers_ul.select_one("span.identifier.doi a.id-link")
            if doi_link:
                doi = doi_link.get_text(strip=True)
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
        publication_date = parse_publication_date(soup)
        return {
            "article_url": article_url,
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
#                           PAGE CHECK FUNCTIONS
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

###############################################################################
#  Ensure article title contains the drug term before processing.
###############################################################################
def normalize_string(s: str) -> str:
    """
    Normalize the string by:
      - Converting to lowercase
      - Removing hyphens and whitespace
      - Converting digit sequences to integers (removing leading zeros)
    """
    s = s.lower()
    # Remove hyphens and spaces.
    s = re.sub(r"[-\s]", "", s)
    # Replace digit sequences with their integer representation.
    s = re.sub(r"\d+", lambda m: str(int(m.group(0))), s)
    return s

def article_mentions_drug(article_data, drug_term):
    """
    Check if the normalized drug term is present in the normalized article title.
    """
    title = article_data.get("title", "")
    return normalize_string(drug_term) in normalize_string(title)
###############################################################################
#                           MAIN SCRAPING LOGIC
###############################################################################
def scrape_drug_term(drug_name, progress, test_only=False):
    """
    Scrape clinical trial articles for the given drug.
    If test_only is True, only scrape one page for testing.
    """
    thread_name = threading.current_thread().name
    logger.info(f"[{thread_name}] Starting scraping for '{drug_name}'")
    driver = configure_selenium()
    start_page = progress.get(drug_name, 1)
    logger.info(f"[{thread_name}] Resuming '{drug_name}' at page {start_page}")
    page_num = start_page
    base_url = BASE_URL_TEMPLATE.format(term=drug_name)
    if page_num > 1:
        base_url += f"&page={page_num}"
    all_links = []
    all_links_set = set()
    max_pages_found = None
    while True:
        try:
            new_links, has_next, maybe_max_pages = scrape_page(driver, base_url, page_num)
        except Exception as e:
            logger.error(f"Error scraping page {page_num} for '{drug_name}': {e}", exc_info=True)
            break
        for link in new_links:
            if link not in all_links_set:
                all_links.append(link)
                all_links_set.add(link)
        if maybe_max_pages and not max_pages_found:
            max_pages_found = maybe_max_pages
            logger.debug(f"[{thread_name}] Found max_pages={max_pages_found} for '{drug_name}'")
        if max_pages_found and page_num >= max_pages_found:
            logger.info(f"[{thread_name}] Reached last page ({page_num} of {max_pages_found}) for '{drug_name}'")
            progress[drug_name] = page_num
            save_progress(progress)
            break
        if not has_next:
            logger.info(f"[{thread_name}] No more pages for '{drug_name}' after page {page_num}")
            progress[drug_name] = page_num
            save_progress(progress)
            break
        progress[drug_name] = page_num
        save_progress(progress)
        page_num += 1
        logger.info(f"[{thread_name}] Moving to page {page_num} for '{drug_name}'")
        time.sleep(random.uniform(2, 5))
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR, "button.next-page-btn")
            ActionChains(driver).move_to_element(next_btn).click().perform()
            time.sleep(random.uniform(1, 3))
            base_url = driver.current_url
        except Exception as e:
            logger.error(f"Error on next page for '{drug_name}': {e}", exc_info=True)
            break
        if test_only:
            break
    logger.info(f"[{thread_name}] Collected {len(all_links)} unique links for '{drug_name}'")
    for link in all_links:
        if article_already_in_db(link):
            continue
        article_data = extract_article_data(driver, link)
        if not article_data:
            log_failure(link, f"Skipped article for '{drug_name}' (no article data)")
            continue
        # Check that the article title contains the drug term.
        if not article_mentions_drug(article_data, drug_name):
            log_failure(link, f"Skipped article for '{drug_name}' (drug term not found in title)")
            continue
        # Link this article directly to the drug by setting drug_id to the drug term.
        article_id = get_or_create_article_id(article_data, drug_id=drug_name)
    driver.quit()
    logger.info(f"[{thread_name}] Finished scraping '{drug_name}'")

###############################################################################
#                    GET ALL DRUGS FROM THE DB
###############################################################################
def get_all_drugs():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, last_checked FROM Drugs")
    drugs = cursor.fetchall()
    conn.close()
    return drugs

###############################################################################
#                           UPDATE DRUG LAST CHECKED
###############################################################################
def update_drug_last_checked(drug_id):
    now_str = datetime.now().strftime("%Y-%m-%d")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("UPDATE Drugs SET last_checked = ? WHERE id = ?", (now_str, drug_id))
    conn.commit()
    conn.close()
    logger.info(f"Updated drug_id {drug_id} with last_checked = {now_str}")

###############################################################################
#                                   MAIN (Run All Drugs)
###############################################################################
def mainAll():
    init_db()
    ensure_drugs_table_has_last_checked()  # Ensure the Drugs table has the last_checked column.
    progress = load_progress()
    drugs = get_all_drugs()
    now = datetime.now()
    one_month_ago = now - timedelta(days=30)
    logger.info(f"Found {len(drugs)} drugs in the database.")
    for drug in drugs:
        drug_id = drug["id"]
        drug_name = drug["name"].lower()  # assuming stored in lowercase
        last_checked = drug["last_checked"]
        if last_checked:
            try:
                last_date = datetime.strptime(last_checked, "%Y-%m-%d")
            except Exception as e:
                logger.error(f"Error parsing last_checked date for drug {drug_name}: {e}")
                last_date = None
        else:
            last_date = None
        if last_date and last_date > one_month_ago:
            logger.info(f"Skipping '{drug_name}' since it was checked on {last_checked}")
            continue
        logger.info(f"Scraping studies for '{drug_name}' (drug_id={drug_id})")
        scrape_drug_term(drug_name, progress)
        update_drug_last_checked(drug_id)
    logger.info("Completed scraping for all drugs.")

###############################################################################
#                                   MAIN (Test Mode)
###############################################################################
def mainTest():
    init_db()
    ensure_drugs_table_has_last_checked()
    progress = load_progress()
    # Specify the drug you want to test (ensure it's stored in the DB and in lowercase)
    test_drug = "bpc-157"
    logger.info(f"Running scraper for single drug: {test_drug}")
    scrape_drug_term(test_drug, progress, test_only=True)
    logger.info("Scraping for single drug completed.")

if __name__ == "__main__":
    # Uncomment one of the following:
    # mainAll()  # Run for all drugs (skipping those checked in the last month)
    mainAll()  # For testing a single drug