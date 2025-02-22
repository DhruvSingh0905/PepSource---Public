#!/usr/bin/env python3
import os
import re
import random
import time
import json
import logging
import sqlite3
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from openai import OpenAI
from dotenv import load_dotenv
import cloudinary
import cloudinary.uploader

###############################################################################
#                            CONFIG & GLOBALS
###############################################################################
MODEL = "gpt-4o"
extraction_results = []  # Fallback extraction storage
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
BASE_URL_TEMPLATE = "https://pubmed.ncbi.nlm.nih.gov/?term={term}"

###############################################################################
# LOAD ENVIRONMENT VARIABLES & SETUP CLIENTS
###############################################################################
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Configure Cloudinary using keys from environment variables.
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET
)

###############################################################################
# DATABASE INITIALIZATION
###############################################################################
def init_db():
    conn = sqlite3.connect(DB_FILE)
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
    Extract the drug name exactly as it appears in the product title using OpenAI,
    then normalize it (all lowercase, no spaces).
    Do not modify or expand the name.
    Returns (normalized_name, request_id) or (None, None) on failure.
    """
    if not product_name:
        return None, None
    prompt = f"""
Extract the drug name exactly as it appears in the following product title.
Do not modify, alter, or expand the name in any way.
Return only the drug name with no additional text.

Product Title: {product_name}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You extract drug names from product titles exactly as provided."},
                {"role": "user", "content": prompt}
            ],
            model="gpt-4o-mini"
        )
        extracted_text = response.choices[0].message.content.strip()
        normalized_name = clean_drug_name(extracted_text)
        request_id = getattr(response, "request_id", None)
        logger.info(f"Extracted drug name '{normalized_name}' from product title: '{product_name}'")
        return normalized_name, request_id
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
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
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
    s = s.lower()
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
            conclusions, sponsor, publication_type, publication_date, drug_id, in_supabase
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        article_data.get("article_url"),
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
        drug_id,
        0  # New rows are not in Supabase by default.
    ))
    article_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return article_id

def scrape_drug_term(drug_name, drug_id, progress, test_only=False):
    logger.info(f"Starting scraping for '{drug_name}' (Drug ID: {drug_id})")
    driver = configure_selenium()
    start_page = progress.get(drug_name, 1)
    logger.info(f"Resuming '{drug_name}' at page {start_page}")
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
            logger.debug(f"Found max_pages={max_pages_found} for '{drug_name}'")
        if max_pages_found and page_num >= max_pages_found:
            logger.info(f"Reached last page ({page_num} of {max_pages_found}) for '{drug_name}'")
            progress[drug_name] = page_num
            break
        if not has_next:
            logger.info(f"No more pages for '{drug_name}' after page {page_num}")
            progress[drug_name] = page_num
            break
        progress[drug_name] = page_num
        page_num += 1
        logger.info(f"Moving to page {page_num} for '{drug_name}'")
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
    logger.info(f"Collected {len(all_links)} unique links for '{drug_name}'")
    
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
    logger.info(f"Finished scraping '{drug_name}' (Drug ID: {drug_id}).")

###############################################################################
# UPDATE SUPABASE: NEW ROWS ONLY
###############################################################################
def update_supabase_db():
    """
    Reads the local SQLite tables (Drugs, Vendors, and articles) for rows where in_supabase is false (0),
    sets in_supabase to True in the outgoing data, upserts their data into the corresponding Supabase tables,
    and then updates the local rows to mark them as in_supabase.
    """
    from supabase import create_client
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase credentials are not set.")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    def prepare_rows(rows):
        updated_rows = []
        for row in rows:
            row_dict = dict(row)
            row_dict["in_supabase"] = 1  # Mark as in Supabase
            updated_rows.append(row_dict)
        return updated_rows

    # Upsert new rows from Drugs table.
    cursor.execute("SELECT * FROM Drugs WHERE in_supabase = 0")
    drugs = prepare_rows(cursor.fetchall())
    try:
        if drugs:
            drug_response = supabase.table("drugs").upsert(drugs, on_conflict="id").execute()
            logger.info(f"Upserted {len(drugs)} drugs to Supabase. Response: {drug_response}")
            cursor.execute("UPDATE Drugs SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new drugs to upsert.")
    except Exception as e:
        logger.error(f"Error upserting drugs: {e}")
    
    # Upsert new rows from Vendors table.
    cursor.execute("SELECT * FROM Vendors WHERE in_supabase = 0")
    vendors = prepare_rows(cursor.fetchall())
    try:
        if vendors:
            vendor_response = supabase.table("vendors").upsert(vendors, on_conflict="id").execute()
            logger.info(f"Upserted {len(vendors)} vendors to Supabase. Response: {vendor_response}")
            cursor.execute("UPDATE Vendors SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new vendors to upsert.")
    except Exception as e:
        logger.error(f"Error upserting vendors: {e}")
    
    # Upsert new rows from articles table.
    cursor.execute("SELECT * FROM articles WHERE in_supabase = 0")
    articles = prepare_rows(cursor.fetchall())
    try:
        if articles:
            article_response = supabase.table("articles").upsert(articles, on_conflict="id").execute()
            logger.info(f"Upserted {len(articles)} articles to Supabase. Response: {article_response}")
            cursor.execute("UPDATE articles SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new articles to upsert.")
    except Exception as e:
        logger.error(f"Error upserting articles: {e}")
    
    conn.close()

###############################################################################
# PROCESS NEW VENDOR ROWS (ALL NEW VENDORS)
###############################################################################
def process_new_vendors():
    """
    Processes all vendor rows that have no drug_id set.
    For each vendor, it:
      1. Uploads the vendor image.
      2. Extracts the drug name from the product title (normalized).
      3. Checks if the drug already exists.
         - If it exists, updates the vendor row with the existing drug_id and skips article scraping.
         - If not, inserts a new drug row (in_supabase defaults to 0), updates proper capitalization and descriptions,
           then scrapes articles for that new drug.
      4. Updates the vendor row with the linked drug_id.
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, product_name, product_image, drug_id FROM Vendors WHERE drug_id IS NULL OR drug_id = ''")
    vendors = cursor.fetchall()
    logger.info(f"Found {len(vendors)} new vendor rows (no drug_id set).")
    
    for vendor in vendors:
        vendor_id = vendor["id"]
        product_name = vendor["product_name"]
        product_image = vendor["product_image"]
        logger.info(f"Processing vendor ID {vendor_id} with product '{product_name}'.")
        
        # Upload image to Cloudinary.
        upload_image_to_cloudinary(vendor_id, product_image)
        
        # Extract drug name from product title.
        if not product_name:
            logger.warning(f"Vendor {vendor_id}: No product name provided.")
            continue
        extracted_name, req_id = get_drug_name_from_title(product_name)
        extraction_record = {
            "vendor_id": vendor_id,
            "product_name": product_name,
            "extracted_name": extracted_name,
            "request_id": req_id
        }
        extraction_results.append(extraction_record)
        if not extracted_name:
            logger.warning(f"Vendor {vendor_id}: Could not extract drug name from product title '{product_name}'.")
            continue
        
        # Check if the drug already exists (using normalized name).
        normalized_extracted = clean_drug_name(extracted_name)
        cursor.execute("SELECT id, proper_name FROM Drugs WHERE LOWER(REPLACE(name, ' ', '')) = ?", (normalized_extracted,))
        result = cursor.fetchone()
        if result:
            drug_id_found = result["id"]
            logger.info(f"Vendor {vendor_id}: Found existing drug '{extracted_name}' with id {drug_id_found}.")
            logger.info(f"Drug '{extracted_name}' (ID: {drug_id_found}) has already been processed for articles. Skipping article extraction.")
        else:
            # Insert new drug row.
            logger.info(f"Vendor {vendor_id}: No matching drug for '{extracted_name}' found. Inserting new drug.")
            try:
                cursor.execute("INSERT INTO Drugs (name, in_supabase) VALUES (?, ?)", (extracted_name, 0))
                conn.commit()
            except sqlite3.IntegrityError as ie:
                logger.error(f"Integrity error inserting drug '{extracted_name}': {ie}")
                continue
            cursor.execute("SELECT id FROM Drugs WHERE name = ?", (extracted_name,))
            new_row = cursor.fetchone()
            if new_row:
                drug_id_found = new_row["id"]
                logger.info(f"Vendor {vendor_id}: Inserted new drug '{extracted_name}' with id {drug_id_found}.")
                # Update proper capitalization.
                proper_name = get_proper_capitalization(extracted_name)
                if proper_name:
                    cursor.execute("UPDATE Drugs SET proper_name = ? WHERE id = ?", (proper_name, drug_id_found))
                    conn.commit()
                    logger.info(f"Vendor {vendor_id}: Updated drug id {drug_id_found} with proper_name '{proper_name}'.")
                else:
                    logger.warning(f"Vendor {vendor_id}: Could not generate proper capitalization for '{extracted_name}'.")
                # Generate descriptions.
                what_it_does, how_it_works = generate_descriptions_for_drug(extracted_name)
                if what_it_does and how_it_works:
                    cursor.execute("UPDATE Drugs SET what_it_does = ?, how_it_works = ? WHERE id = ?", 
                                   (what_it_does, how_it_works, drug_id_found))
                    conn.commit()
                    logger.info(f"Vendor {vendor_id}: Updated new drug '{extracted_name}' with descriptions.")
                else:
                    logger.warning(f"Vendor {vendor_id}: Could not generate descriptions for drug '{extracted_name}'.")
                # Since this is a newly inserted drug, scrape articles for it.
                logger.info(f"Starting article extraction for new drug '{extracted_name}' (ID: {drug_id_found}).")
                scrape_drug_term(extracted_name, drug_id_found, {}, test_only=False)
            else:
                logger.error(f"Vendor {vendor_id}: Failed to retrieve new drug id for '{extracted_name}'.")
                continue
        
        # Update vendor row with the linked drug_id.
        cursor.execute("UPDATE Vendors SET drug_id = ? WHERE id = ?", (drug_id_found, vendor_id))
        conn.commit()
        logger.info(f"Vendor {vendor_id}: Updated with drug_id {drug_id_found}.")
    
    conn.commit()
    conn.close()
    logger.info(f"Finished processing all new vendor rows. Fallback extraction records saved: {len(extraction_results)}.")
    with open(FALLBACK_FILE, "w", encoding="utf-8") as f:
        json.dump(extraction_results, f, indent=2)

###############################################################################
# UPDATE SUPABASE: NEW ROWS ONLY
###############################################################################
def update_supabase_db():
    """
    Reads the local SQLite tables (Drugs, Vendors, and articles) for rows where in_supabase is false (0),
    sets in_supabase to True in the outgoing data, upserts their data into the corresponding Supabase tables,
    and then updates the local rows to mark them as in_supabase.
    """
    from supabase import create_client
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase credentials are not set.")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    def prepare_rows(rows):
        updated_rows = []
        for row in rows:
            row_dict = dict(row)
            row_dict["in_supabase"] = 1  # Mark as in Supabase
            updated_rows.append(row_dict)
        return updated_rows

    # Upsert new rows from Drugs table.
    cursor.execute("SELECT * FROM Drugs WHERE in_supabase = 0")
    drugs = prepare_rows(cursor.fetchall())
    try:
        if drugs:
            drug_response = supabase.table("drugs").upsert(drugs, on_conflict="id").execute()
            logger.info(f"Upserted {len(drugs)} drugs to Supabase. Response: {drug_response}")
            cursor.execute("UPDATE Drugs SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new drugs to upsert.")
    except Exception as e:
        logger.error(f"Error upserting drugs: {e}")
    
    # Upsert new rows from Vendors table.
    cursor.execute("SELECT * FROM Vendors WHERE in_supabase = 0")
    vendors = prepare_rows(cursor.fetchall())
    try:
        if vendors:
            vendor_response = supabase.table("vendors").upsert(vendors, on_conflict="id").execute()
            logger.info(f"Upserted {len(vendors)} vendors to Supabase. Response: {vendor_response}")
            cursor.execute("UPDATE Vendors SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new vendors to upsert.")
    except Exception as e:
        logger.error(f"Error upserting vendors: {e}")
    
    # Upsert new rows from articles table.
    cursor.execute("SELECT * FROM articles WHERE in_supabase = 0")
    articles = prepare_rows(cursor.fetchall())
    try:
        if articles:
            article_response = supabase.table("articles").upsert(articles, on_conflict="id").execute()
            logger.info(f"Upserted {len(articles)} articles to Supabase. Response: {article_response}")
            cursor.execute("UPDATE articles SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new articles to upsert.")
    except Exception as e:
        logger.error(f"Error upserting articles: {e}")
    
    conn.close()

###############################################################################
# MAIN PROCESS
###############################################################################
def load_progress():
    progress = {}
    progress_file = "progress_checkpoint.json"
    if os.path.exists(progress_file):
        with open(progress_file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if content:
                progress = json.loads(content)
    return progress

def main():
    # Segment 1: Initialize Database and Ensure Schema.
    try:
        init_db()
        ensure_drugs_table_has_last_checked()
        logger.info("Database initialization completed.")
    except Exception as e:
        logger.error("Error during database initialization: %s", e)
    
    # Segment 2: Process All New Vendor Rows.
    try:
        process_new_vendors()
        logger.info("Processed all new vendor rows successfully.")
    except Exception as e:
        logger.error("Error processing new vendor rows: %s", e)
    
    # Segment 3: Update Supabase with New Rows.
    try:
        update_supabase_db()
        logger.info("Updated Supabase with new rows successfully.")
    except Exception as e:
        logger.error("Error updating Supabase: %s", e)
    
    logger.info("Drug vendor pipeline (processing all new vendors) completed.")

if __name__ == "__main__":
    main()