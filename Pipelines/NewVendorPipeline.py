import os
import re
import sys
import random
import time
import json
import logging
import threading
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
import sqlite3
import cloudinary
# Selenium & WebDriver
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains

# BeautifulSoup for HTML parsing
from bs4 import BeautifulSoup

# Fake user agent for anti-scraping
from fake_useragent import UserAgent

# OpenAI client
from openai import OpenAI
from dotenv import load_dotenv

###############################################################################
#                            CONFIG & GLOBALS
###############################################################################
MODEL = "gpt-4o"
extraction_results = []
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("drug_vendor_pipeline")

# Global constants
FAILURES_LOG = "failures.log"
DB_FILE = "DB/pepsources.db"
FALLBACK_FILE = "fallback_extractions.json"
PROGRESS_JSON = "progress_checkpoint.json"  # For page-level checkpointing
BASE_URL_TEMPLATE = "https://pubmed.ncbi.nlm.nih.gov/?term={term}"

###############################################################################
# LOAD ENVIRONMENT VARIABLES & SETUP CLIENTS
###############################################################################
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

###############################################################################
# DATABASE INITIALIZATION
###############################################################################
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS Drugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            proper_name TEXT,
            what_it_does TEXT,
            how_it_works TEXT,
            last_checked TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS Vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            product_name TEXT,
            product_link TEXT,
            product_image TEXT,
            price TEXT,
            size TEXT,
            drug_id TEXT,  -- Will be set when linked to a drug
            cloudinary_product_image TEXT
        )
    """)
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
            publication_type TEXT,
            publication_date TEXT,
            drug_id TEXT
        )
    """)
    conn.commit()
    conn.close()
    logger.info("Database schema verified.")

def ensure_drugs_table_has_last_checked():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(Drugs)")
    columns = [row[1].lower() for row in cursor.fetchall()]
    if "last_checked" not in columns:
        cursor.execute("ALTER TABLE Drugs ADD COLUMN last_checked TEXT")
        conn.commit()
        logger.info("Added 'last_checked' column to Drugs table.")
    conn.close()

###############################################################################
# HELPER FUNCTIONS: OPENAI & TEXT PROCESSING
###############################################################################
def clean_drug_name(drug_name: str) -> str:
    if not drug_name:
        return ""
    return re.sub(r"\s+", "", drug_name.strip().lower())

def get_drug_name_from_title(product_name: str):
    """
    Extract a normalized drug name from a product title using OpenAI.
    Returns (cleaned_drug_name, request_id) or (None, None) on failure.
    """
    if not product_name:
        return None, None
    prompt = f"""
Extract ONLY the drug name from the following product title.
Return only the drug name, with no extra text.
If abbreviated, return the full name if known (e.g., "reta" should become "retatrutide").

Product Title: {product_name}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You extract drug names from product titles."},
                {"role": "user", "content": prompt}
            ],
            model="gpt-4o-mini"
        )
        extracted_text = response.choices[0].message.content.strip()
        cleaned_name = clean_drug_name(extracted_text)
        request_id = getattr(response, "request_id", None)
        logger.info(f"Extracted drug name '{cleaned_name}' from product title: '{product_name}'")
        return cleaned_name, request_id
    except Exception as e:
        logger.error(f"OpenAI API failed for '{product_name}': {e}")
        return None, None

def get_proper_capitalization(drug_name: str) -> str:
    """
    Requests OpenAI to return a properly capitalized version of the drug name.
    Returns the capitalized name or None on failure.
    """
    if not drug_name:
        return None
    prompt = f"""
Return the properly capitalized version of the following drug name.
Output only the capitalized drug name with no extra text.

Drug Name: {drug_name}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You capitalize drug names properly."},
                {"role": "user", "content": prompt}
            ],
            model="gpt-4o-mini"
        )
        proper_name = response.choices[0].message.content.strip()
        logger.info(f"Proper capitalization for '{drug_name}' is '{proper_name}'")
        return proper_name
    except Exception as e:
        logger.error(f"OpenAI API failed for capitalization of '{drug_name}': {e}")
        return None

def generate_descriptions_for_drug(drug_name: str):
    """
    Uses OpenAI to generate short, fact-based explanations for the drug:
      - what_it_does
      - how_it_works
    Returns (what_it_does, how_it_works) or (None, None) on error.
    """
    if not drug_name:
        return None, None
    prompt = f"""
You are an assistant that provides plain-language summaries for research chemicals.
The chemical's name is '{drug_name}'.

Return a JSON object with exactly two keys:
  "what_it_does": A brief summary of the compound's effects and off-label uses (if any).
  "how_it_works": A brief explanation of its mechanism of action.

Output must be valid JSON with no extra text.
Example:
{{
  "what_it_does": "Explanation text.",
  "how_it_works": "Mechanism text."
}}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You generate plain, factual summaries about research chemicals."},
                {"role": "user", "content": prompt}
            ],
            model="gpt-4o"
        )
        raw_text = response.choices[0].message.content.strip()
        try:
            parsed = json.loads(raw_text)
            what_it_does = parsed.get("what_it_does", "").strip()
            how_it_works = parsed.get("how_it_works", "").strip()
            logger.info(f"Generated descriptions for '{drug_name}'.")
            return what_it_does, how_it_works
        except json.JSONDecodeError:
            logger.error(f"JSON decode error for '{drug_name}': {raw_text}")
            with open("decode_errors.txt", "a", encoding="utf-8") as f:
                f.write(f"Drug Name: {drug_name}\nRaw Text:\n{raw_text}\n\n")
            return None, None
    except Exception as e:
        logger.error(f"OpenAI API request failed for '{drug_name}': {e}")
        return None, None

###############################################################################
# HELPER FUNCTIONS: CLOUDINARY UPLOAD
###############################################################################
def upload_image_to_cloudinary(vendor_id: int, local_image_path: str):
    if not local_image_path or not os.path.isfile(local_image_path):
        logger.warning(f"Vendor {vendor_id}: No valid image at '{local_image_path}'.")
        return None
    try:
        logger.info(f"Vendor {vendor_id}: Uploading image '{local_image_path}' to Cloudinary...")
        result = cloudinary.uploader.upload(
            local_image_path,
            unique_filename=False,
            overwrite=True,
            resource_type="auto"
        )
        new_url = result.get("secure_url", "")
        if new_url:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("UPDATE Vendors SET cloudinary_product_image = ? WHERE id = ?", (new_url, vendor_id))
            conn.commit()
            conn.close()
            logger.info(f"Vendor {vendor_id}: Image uploaded. URL: {new_url}")
            return new_url
        else:
            logger.warning(f"Vendor {vendor_id}: Cloudinary upload returned no URL.")
            return None
    except Exception as e:
        logger.error(f"Error uploading image for Vendor {vendor_id}: {e}")
        return None

###############################################################################
# ARTICLE EXTRACTION FUNCTIONS (Selenium & BS4)
###############################################################################
def configure_selenium():
    from fake_useragent import UserAgent  # Ensure local import
    from selenium.webdriver.chrome.options import Options
    from selenium import webdriver
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
            logger.warning(f"No title found for {article_url}; skipping.")
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
        pub_type_elem = soup.find("div", class_="publication-type")
        publication_type = pub_type_elem.get_text(strip=True) if pub_type_elem else ""
        abstract_div = soup.find("div", id="abstract")
        abstract_parts = abstract_div.find_all("p") if abstract_div else []
        background_text = abstract_parts[0].get_text(strip=True) if len(abstract_parts) > 0 else ""
        methods_text = abstract_parts[1].get_text(strip=True) if len(abstract_parts) > 1 else ""
        if methods_text.strip().lower().startswith("keywords"):
            methods_text = ""
        sections = {"Results": "", "Conclusions": ""}
        for part in abstract_parts[2:]:
            sub_title = part.find("strong", class_="sub-title")
            if sub_title:
                section_name = sub_title.get_text(strip=True).rstrip(":")
                text_content = part.get_text(strip=True).replace(sub_title.get_text(strip=True), "").strip()
                if section_name in sections:
                    sections[section_name] = text_content
        results_text = sections["Results"]
        if results_text.strip().lower().startswith("keywords"):
            results_text = ""
        sponsor_match = re.search(r"(Funded by|Sponsored by)\s(.+?)(\.|;|$)", sections["Conclusions"])
        sponsor = sponsor_match.group(2).strip() if sponsor_match else ""
        publication_date = None
        heading_div = soup.find("div", class_="full-view", id="full-view-heading")
        if heading_div:
            heading_text = heading_div.get_text(" ", strip=True)
            match = re.search(r"(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})", heading_text)
            if match:
                year_str, month_str, day_str = match.groups()
                try:
                    dt = datetime.strptime(f"{year_str} {month_str} {day_str}", "%Y %b %d")
                    publication_date = dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass
            else:
                match2 = re.search(r"(\d{4})\s+([A-Za-z]{3})(?!\s+\d)", heading_text)
                if match2:
                    year_str, month_str = match2.groups()
                    try:
                        dt = datetime.strptime(f"{year_str} {month_str} 1", "%Y %b %d")
                        publication_date = dt.strftime("%Y-%m-%d")
                    except ValueError:
                        pass
        return {
            "article_url": article_url,
            "pmid": pmid,
            "doi": doi,
            "title": title_text,
            "background": background_text,
            "methods": methods_text,
            "results": results_text,
            "conclusions": sections["Conclusions"],
            "sponsor": sponsor,
            "publication_type": publication_type,
            "publication_date": publication_date
        }
    except Exception as e:
        logger.error(f"Error extracting data from {article_url}: {e}", exc_info=True)
        return None
def normalize_text(s: str) -> str:
    """
    Normalize a string by converting to lowercase, removing spaces, hyphens, and other non-alphanumeric characters.
    This allows very loose matching (e.g., "MK-677" should match "MK 677", "mk677", etc.).
    """
    s = s.lower()
    # Remove spaces, hyphens, and any non-alphanumeric characters (except for letters and numbers).
    s = re.sub(r'[\s\-\_]+', '', s)
    return s

def scrape_page(driver, base_url, page_num, drug_term):
    driver.get(base_url)
    time.sleep(random.uniform(1, 3))
    soup = BeautifulSoup(driver.page_source, "html.parser")
    max_pages = 10  # Fallback maximum
    article_links = []
    for a in soup.select("a.docsum-title"):
        text = a.get_text(separator=" ", strip=True)
        if normalize_text(drug_term) in normalize_text(text):
            article_links.append("https://pubmed.ncbi.nlm.nih.gov" + a['href'])
        else:
            logger.debug(f"Skipping link due to drug mismatch: '{text}'")
    next_button = soup.select_one("button.next-page-btn")
    has_next = bool(next_button and "disabled-icon" not in next_button.get("class", ""))
    logger.info(f"Page {page_num} -> found {len(article_links)} matching links (max_pages={max_pages})")
    return article_links, has_next, max_pages
def article_already_in_db(article_url):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM articles WHERE article_url=? LIMIT 1", (article_url,))
    row = cursor.fetchone()
    conn.close()
    return bool(row)

def log_failure(article_url, reason):
    with open(FAILURES_LOG, "a", encoding="utf-8") as f:
        f.write(f"{article_url} - {reason}\n")
    logger.warning(f"SKIPPED: {reason} | {article_url}")
def article_mentions_drug(article_data, drug_term):
    """
    Check if the article's title (normalized) contains the normalized drug term.
    """
    title = article_data.get("title", "")
    return normalize_text(drug_term) in normalize_text(title)

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
            conclusions, sponsor, publication_type, publication_date, drug_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        article_data.get("publication_type"),
        article_data.get("publication_date"),
        drug_id
    ))
    article_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return article_id
def scrape_drug_term(drug_name, drug_id, progress, test_only=False):
    thread_name = threading.current_thread().name
    logger.info(f"[{thread_name}] Starting scraping for '{drug_name}' (Drug ID: {drug_id})")
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
            new_links, has_next, maybe_max_pages = scrape_page(driver, base_url, page_num, drug_name)
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
            break
        if not has_next:
            logger.info(f"[{thread_name}] No more pages for '{drug_name}' after page {page_num}")
            progress[drug_name] = page_num
            break
        progress[drug_name] = page_num
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
    
    consecutive_failures = 0
    for link in all_links:
        if article_already_in_db(link):
            continue
        article_data = extract_article_data(driver, link)
        if not article_data:
            log_failure(link, f"Skipped article for '{drug_name}' (no article data)")
            consecutive_failures += 1
            if consecutive_failures >= 3:
                logger.info(f"Stopping processing for '{drug_name}' due to 3 consecutive failures.")
                break
            continue
        if not article_mentions_drug(article_data, drug_name):
            log_failure(link, f"Skipped article for '{drug_name}' (drug term not found in title)")
            consecutive_failures += 1
            if consecutive_failures >= 3:
                logger.info(f"Stopping processing for '{drug_name}' due to 3 consecutive non-matches.")
                break
            continue
        consecutive_failures = 0
        article_id = get_or_create_article_id(article_data, drug_id)
        logger.info(f"Processed article {article_id} for '{drug_name}'.")
    driver.quit()
    logger.info(f"[{thread_name}] Finished scraping '{drug_name}' (Drug ID: {drug_id}).")
###############################################################################
#                           AI SUMMARIZATION FOR ARTICLES
###############################################################################
def fetch_articles_without_ai(drug_id):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, background, methods, conclusions 
        FROM articles
        WHERE (
            ai_heading IS NULL OR ai_heading = '' OR
            ai_background IS NULL OR ai_background = '' OR
            ai_conclusion IS NULL OR ai_conclusion = '' OR
            key_terms IS NULL OR key_terms = ''
        )
        AND drug_id = ?
    """, (drug_id,))
    articles = cursor.fetchall()
    conn.close()
    logger.info(f"Fetched {len(articles)} articles for drug id {drug_id} missing AI summaries.")
    return articles

def update_article_ai_summary(article_id, ai_heading, ai_background, ai_conclusion, key_terms):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE articles
        SET ai_heading = ?,
            ai_background = ?,
            ai_conclusion = ?,
            key_terms = ?
        WHERE id = ?
    """, (ai_heading, ai_background, ai_conclusion, key_terms, article_id))
    conn.commit()
    conn.close()
    logger.info(f"Updated article {article_id} with AI summaries and key terms.")

def generate_ai_summary(article):
    article_id, title, background, methods, conclusions = article
    title = title or ""
    background = background or ""
    methods = methods or ""
    conclusions = conclusions or ""
    methods_text = methods.strip() if methods.strip() else "Not provided."
    conclusions_text = conclusions.strip() if conclusions.strip() else "Not provided."
    prompt = f"""
Rewrite this study summary in a detailed and comprehensive manner that is **extremely easy to understand**.
Include relevant figures and numerical data where available, using a "~" to indicate approximate values.
Also, list 2–3 key terms that are important to the study and provide very simple, one-sentence definitions for each.

Follow the exact format below:

**ai_heading:** A one-to-two sentence summary of the study's primary goal, including any relevant numerical data.
**ai_background:** A detailed explanation of the study's purpose, defining key terms and providing context with figures.
**ai_conclusion:** A simplified one-sentence summary of the key findings.
**key_terms:** List 2–3 key terms along with very simple, one-sentence definitions.

Title: {title}
Background: {background}
Methods: {methods_text}
Conclusions: {conclusions_text}
""".strip()
    messages = [
        {"role": "developer", "content": "You simplify complex research articles into detailed, easy-to-understand summaries with contextualized figures and clear, simple definitions of key terms."},
        {"role": "user", "content": prompt}
    ]
    logger.info(f"Sending AI summarization prompt for article ID {article_id}:\n{prompt}")
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            store=True
        )
        content = response.choices[0].message.content
        logger.info(f"Received AI summary for article ID {article_id}:\n{content}")
        return content
    except Exception as e:
        logger.error(f"OpenAI API error for article ID {article_id}: {e}")
        return ""

def process_ai_summaries(drug_id):
    articles = fetch_articles_without_ai(drug_id)
    for article in articles:
        summary = generate_ai_summary(article)
        if summary:
            lines = summary.split("\n")
            ai_heading = ""
            ai_background = ""
            ai_conclusion = ""
            key_terms_lines = []
            recording_key_terms = False
            for line in lines:
                line = line.strip()
                if line.lower().startswith("**ai_heading:**"):
                    ai_heading = line.split("**ai_heading:**", 1)[1].strip()
                elif line.lower().startswith("**ai_background:**"):
                    ai_background = line.split("**ai_background:**", 1)[1].strip()
                elif line.lower().startswith("**ai_conclusion:**"):
                    ai_conclusion = line.split("**ai_conclusion:**", 1)[1].strip()
                elif line.lower().startswith("**key_terms:**"):
                    recording_key_terms = True
                    key_terms_lines.append(line.split("**key_terms:**", 1)[1].strip())
                elif recording_key_terms:
                    if line.startswith("**") or line == "":
                        recording_key_terms = False
                    else:
                        key_terms_lines.append(line)
            key_terms = "\n".join(key_terms_lines)
            if not ai_heading and not ai_background and not ai_conclusion and not key_terms:
                logger.error(f"No valid AI summary parts extracted for article ID {article[0]}.")
            else:
                update_article_ai_summary(article[0], ai_heading, ai_background, ai_conclusion, key_terms)
        else:
            logger.error(f"No AI summary generated for article ID {article[0]}.")
        time.sleep(1)
    logger.info("AI summarization process for articles completed.")

###############################################################################
#                           MAIN PROCESS FOR NEW VENDOR ROWS
###############################################################################
def process_new_vendors():
    """
    Process only vendor rows that have no drug_id set (new vendor rows).
    For each such vendor, upload the image, extract a drug name from product title,
    and link or insert a drug accordingly.
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Only select vendor rows with drug_id empty (NULL or empty string)
    cursor.execute("SELECT id, product_name, product_image, drug_id FROM Vendors WHERE drug_id IS NULL OR drug_id = ''")
    vendors = cursor.fetchall()
    logger.info(f"Found {len(vendors)} new vendor rows (no drug_id set).")
    
    for row in vendors:
        vendor_id = row["id"]
        product_name = row["product_name"]
        product_image = row["product_image"]
        # Step 1: Upload image to Cloudinary
        upload_image_to_cloudinary(vendor_id, product_image)
        
        # Step 2: Extract normalized drug name from product title
        if product_name:
            extracted_name, req_id = get_drug_name_from_title(product_name)
            extraction_record = {
                "vendor_id": vendor_id,
                "product_name": product_name,
                "extracted_name": extracted_name,
                "request_id": req_id
            }
            extraction_results.append(extraction_record)
            if extracted_name:
                # Step 3: Check if the drug already exists in the Drugs table
                cursor.execute("SELECT id, proper_name FROM Drugs WHERE LOWER(REPLACE(name, ' ', '')) = ?", (extracted_name,))
                result = cursor.fetchone()
                if result:
                    drug_id_found = result["id"]
                    logger.info(f"Vendor {vendor_id}: Found existing drug '{extracted_name}' with id {drug_id_found}.")
                else:
                    # Insert new drug row with the extracted name.
                    logger.info(f"Vendor {vendor_id}: No matching drug for '{extracted_name}' found. Inserting new drug.")
                    try:
                        cursor.execute("INSERT INTO Drugs (name) VALUES (?)", (extracted_name,))
                        conn.commit()
                    except sqlite3.IntegrityError as ie:
                        logger.error(f"Integrity error inserting drug '{extracted_name}': {ie}")
                        continue
                    cursor.execute("SELECT id FROM Drugs WHERE name = ?", (extracted_name,))
                    new_row = cursor.fetchone()
                    if new_row:
                        drug_id_found = new_row["id"]
                        logger.info(f"Vendor {vendor_id}: Inserted new drug '{extracted_name}' with id {drug_id_found}.")
                        # Step 4: Get proper capitalization and update the drug row.
                        proper_name = get_proper_capitalization(extracted_name)
                        if proper_name:
                            cursor.execute("UPDATE Drugs SET proper_name = ? WHERE id = ?", (proper_name, drug_id_found))
                            conn.commit()
                            logger.info(f"Vendor {vendor_id}: Updated drug id {drug_id_found} with proper_name '{proper_name}'.")
                        else:
                            logger.warning(f"Vendor {vendor_id}: Could not generate proper capitalization for '{extracted_name}'.")
                        # Step 5: Generate descriptions for the new drug.
                        what_it_does, how_it_works = generate_descriptions_for_drug(extracted_name)
                        if what_it_does and how_it_works:
                            cursor.execute("UPDATE Drugs SET what_it_does = ?, how_it_works = ? WHERE id = ?", 
                                           (what_it_does, how_it_works, drug_id_found))
                            conn.commit()
                            logger.info(f"Vendor {vendor_id}: Updated new drug '{extracted_name}' with descriptions.")
                        else:
                            logger.warning(f"Vendor {vendor_id}: Could not generate descriptions for drug '{extracted_name}'.")
                    else:
                        logger.error(f"Vendor {vendor_id}: Failed to retrieve new drug id for '{extracted_name}'.")
                        continue
                # Update vendor row with the linked drug_id.
                cursor.execute("UPDATE Vendors SET drug_id = ? WHERE id = ?", (drug_id_found, vendor_id))
                conn.commit()
                logger.info(f"Vendor {vendor_id}: Updated with drug_id {drug_id_found}.")
            else:
                logger.warning(f"Vendor {vendor_id}: Could not extract drug name from product title '{product_name}'.")
        else:
            logger.warning(f"Vendor {vendor_id}: No product name provided.")
    
    conn.commit()
    conn.close()
    # Write fallback extraction results.
    logger.info(f"Writing fallback extraction results to '{FALLBACK_FILE}'...")
    with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
        json.dump(extraction_results, f, indent=2)
    logger.info(f"Saved {len(extraction_results)} extraction records to '{FALLBACK_FILE}'.")

###############################################################################
#                           MAIN PROCESS
###############################################################################
def load_progress():
    if not os.path.exists(PROGRESS_JSON):
        return {}
    with open(PROGRESS_JSON, "r", encoding="utf-8") as f:
        content = f.read().strip()
        if not content:
            return {}
        return json.loads(content)
def main():
    init_db()
    ensure_drugs_table_has_last_checked()
    
    # Step 1: Process new vendor rows (those with empty drug_id)
    process_new_vendors()
    
    # Step 2: For each new drug (that was inserted or updated via vendors),
    # run article extraction and then AI summarization.
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Get drugs that have not been checked recently or that were just inserted.
    cursor.execute("SELECT id, name FROM Drugs WHERE last_checked IS NULL OR last_checked = ''")
    new_drugs = cursor.fetchall()
    conn.close()
    
    logger.info(f"Found {len(new_drugs)} new drugs to scrape articles for.")
    progress = load_progress()
    for drug in new_drugs:
        drug_id = drug["id"]
        drug_name = drug["name"]
        logger.info(f"Starting article extraction for new drug '{drug_name}' (ID: {drug_id}).")
        scrape_drug_term(drug_name, drug_id, progress, test_only=False)
    
    # Step 3: Process AI summaries for articles that are missing them
    # (Here, you can loop through drugs or process globally.)
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT drug_id FROM articles WHERE ai_heading IS NULL OR ai_heading = ''")
    rows = cursor.fetchall()
    conn.close()
    unique_drug_ids = {row[0] for row in rows if row[0]}
    for d_id in unique_drug_ids:
        logger.info(f"Processing AI summaries for articles of drug_id {d_id}.")
        process_ai_summaries(d_id)
    
    logger.info("Drug vendor pipeline processing completed.")

if __name__ == "__main__":
    main()