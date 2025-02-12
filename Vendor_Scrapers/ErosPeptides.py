import time
import random
import re
import sqlite3
import torch

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from fake_useragent import UserAgent
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

# --------------------------------------------------------------------
# 1) BERT MODEL SETUP
# --------------------------------------------------------------------
MODEL_NAME = "jsylee/scibert_scivocab_uncased-finetuned-ner"

ID2LABEL = {
    0: "O",
    1: "B-DRUG",
    2: "I-DRUG",
    3: "B-EFFECT",
    4: "I-EFFECT"
}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"[INFO] Using device: {device}")

try:
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForTokenClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(ID2LABEL),
        id2label=ID2LABEL
    ).to(device)
    model.eval()

    nlp_pipeline = pipeline(
        task="ner",
        model=model,
        tokenizer=tokenizer,
        device=0 if torch.cuda.is_available() else -1,
        aggregation_strategy="simple"
    )

    # Warm up the pipeline
    print("[INFO] Warming up the NER pipeline with a dummy inference...")
    _ = nlp_pipeline("This is a dummy warm-up pass for Eros.")
    print("[INFO] Model pipeline loaded and warmed up successfully.")
except Exception as e:
    print(f"[ERROR] Failed setting up BERT model: {e}")
    nlp_pipeline = None


# --------------------------------------------------------------------
# 2) HELPER FUNCTIONS
# --------------------------------------------------------------------
def truncate_text_for_model(text, max_length=512):
    """
    Truncate text for BERT input to avoid exceeding max token length.
    """
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=max_length,
        padding="max_length"
    )
    return tokenizer.decode(inputs["input_ids"][0], skip_special_tokens=True)

def extract_drugs(text):
    """
    Use the BERT pipeline to extract drug names from text (e.g., 'BPC-157').
    """
    if not nlp_pipeline:
        return []
    truncated = truncate_text_for_model(text)
    entities = nlp_pipeline(truncated)

    drugs = []
    for ent in entities:
        if ent["entity_group"] == "DRUG":
            drug_name = ent["word"]
            # Remove size qualifiers like '10mg' or '100 iu'
            drug_name = re.sub(
                r"\b\d+\s*(mg|iu)\b",
                "",
                drug_name,
                flags=re.IGNORECASE
            ).strip()
            if drug_name:
                drugs.append(drug_name)
    return drugs[:2]  # Return at most two extracted names

def extract_size(text):
    """
    Extract size from text, e.g., '10MG' or '100 IU'.
    Returns None if not found.
    """
    match = re.search(r"\b(\d+)\s*(mg|iu)\b", text, re.IGNORECASE)
    return match.group(0) if match else None

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


# --------------------------------------------------------------------
# 3) DATABASE SETUP (ADD test_certificate COLUMN IF NEEDED)
# --------------------------------------------------------------------
conn = sqlite3.connect("pepsources.db")
cursor = conn.cursor()

# Create the Drugs table if not existing
cursor.execute("""
CREATE TABLE IF NOT EXISTS Drugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    alt_name TEXT
)
""")

# Create Vendors table if not existing, with test_certificate field
cursor.execute("""
CREATE TABLE IF NOT EXISTS Vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    product_name TEXT,
    product_link TEXT,
    product_image TEXT,
    price TEXT,
    size TEXT,
    drug_id INTEGER,
    test_certificate TEXT,
    FOREIGN KEY (drug_id) REFERENCES Drugs (id)
)
""")

# Attempt to add 'test_certificate' if it doesn't exist
try:
    cursor.execute("ALTER TABLE Vendors ADD COLUMN test_certificate TEXT")
    print("[INFO] Added 'test_certificate' column to Vendors table.")
except:
    # We only reach here if the column already existed
    pass

conn.commit()


# --------------------------------------------------------------------
# 4) SCRAPE LAB RESULTS PAGE FOR CERTIFICATE LINKS
# --------------------------------------------------------------------
def fetch_lab_results(driver, lab_url="https://erospeptides.com/lab-results/"):
    """
    Returns a dict mapping product_name (UPPERCASED) -> list of certificate image URLs.
    Example:
      {
        "BPC-157 10MG": ["https://erospeptides.com/...png", ...],
        "TB-500 5MG":   ["https://erospeptides.com/...png", ...],
        ...
      }
    We'll match by the full name for simplicity, e.g. "BPC-157 10MG".
    """
    print(f"[INFO] Fetching lab results from {lab_url}")
    driver.get(lab_url)
    time.sleep(random.uniform(2, 5))

    lab_data = {}
    # Each product-lab block is in <details class="e-n-accordion-item">
    details_elements = driver.find_elements(By.CSS_SELECTOR, "details.e-n-accordion-item")

    for details_elem in details_elements:
        try:
            summary_text = details_elem.find_element(By.TAG_NAME, "summary").text.strip()
            # e.g. "BPC-157 10MG"
            a_links = details_elem.find_elements(By.CSS_SELECTOR, "a[href*='.png'], a[href*='.jpg'], a[href*='.jpeg']")
            cert_urls = [a.get_attribute("href") for a in a_links]
            if summary_text and cert_urls:
                lab_data[summary_text.upper()] = cert_urls
        except Exception as e:
            print(f"[WARN] Error parsing lab details element: {e}")

    print(f"[INFO] Found", len(lab_data), "certificate entries on Lab Results page.")
    return lab_data


# --------------------------------------------------------------------
# 5) LAZY LOADING & PRODUCT EXTRACTION
# --------------------------------------------------------------------
def load_all_products(driver):
    """
    Scroll down repeatedly until no new products appear
    or we've tried multiple times.

    This helps ensure any lazy-loaded items become visible in the DOM.
    """
    last_height = driver.execute_script("return document.body.scrollHeight")
    attempts = 0
    max_attempts = 5  # adjust as needed

    while attempts < max_attempts:
        # Scroll to bottom
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(random.uniform(2, 4))

        new_height = driver.execute_script("return document.body.scrollHeight")
        if new_height == last_height:
            # No more content loaded
            break
        else:
            last_height = new_height
        attempts += 1

def wait_for_products(driver, minimum_count=12, timeout=15):
    """
    Explicitly wait until at least 'minimum_count' products
    are found or 'timeout' seconds pass.
    """
    WebDriverWait(driver, timeout).until(
        lambda d: len(d.find_elements(By.CSS_SELECTOR, "li.product.type-product")) >= minimum_count
    )

def scrape_eros_shop(driver, lab_data, base_url="https://erospeptides.com/product-category/peptides/"):
    """
    Scrape all product pages from Eros Peptides. Match product name+size
    to lab_data for the certificate image URLs, if found.
    Keep products that don't have a certificate (test_certificate = "N/A").
    Only skip if the product name or price is truly empty.
    """
    page_url = base_url
    page_num = 1

    while page_url:
        print(f"[INFO] Scraping page {page_num}: {page_url}")
        driver.get(page_url)
        # Allow page to load
        time.sleep(random.uniform(5, 5))

        # Attempt to load all lazy products by scrolling
        load_all_products(driver)

        # Optionally, wait for at least N products (like 6 or 9 or 12)s
        try:
            wait_for_products(driver, minimum_count=6, timeout=10)
        except Exception:
            # If we can't find 6 products in 10s, proceed anyway
            pass

        # Now find all product <li> elements
        product_elements = driver.find_elements(By.CSS_SELECTOR, "li.product.type-product")
        print(f"[DEBUG] Found {len(product_elements)} products on page {page_num} after scrolling.")

        for product in product_elements:
            try:
                # Product link
                link_elem = product.find_element(By.CSS_SELECTOR, ".astra-shop-thumbnail-wrap a")
                product_link = link_elem.get_attribute("href")

                # Product image
                img_elem = product.find_element(By.TAG_NAME, "img")
                product_image = img_elem.get_attribute("src")

                # Product name with robust handling
                title_elem = product.find_element(By.CSS_SELECTOR, ".woocommerce-loop-product__title")
                driver.execute_script("arguments[0].scrollIntoView(true);", title_elem)
                product_name = driver.execute_script("return arguments[0].innerText;", title_elem).strip()

                # Debugging output
                print("[DEBUG] Product Title Element HTML:", title_elem.get_attribute("outerHTML"))
                print("[DEBUG] Extracted Product Name:", product_name)

                # Product price
                price_elem = product.find_element(By.CLASS_NAME, "price")
                price_text = price_elem.text.strip() if price_elem.text.strip() else "N/A"

                print(f"[DEBUG] Product Name: '{product_name}' | Price: '{price_text}'")

                # Skip if no name or price
                if product_name == "Unknown" or price_text == "N/A":
                    print("[INFO] Skipping empty or invalid product.")
                    continue

                # Additional processing logic...

                # Extract size from product name
                product_size = extract_size(product_name)

                # Extract drug name(s) from BERT
                extracted_drugs = extract_drugs(product_name)
                primary_drug = extracted_drugs[0] if extracted_drugs else "Unknown"
                alt_drug = extracted_drugs[1] if len(extracted_drugs) > 1 else None

                # Insert or ignore drug
                cursor.execute(
                    "INSERT OR IGNORE INTO Drugs (name, alt_name) VALUES (?, ?)",
                    (primary_drug, alt_drug)
                )
                conn.commit()

                # Get the drug_id
                cursor.execute("SELECT id FROM Drugs WHERE name = ?", (primary_drug,))
                drug_row = cursor.fetchone()
                drug_id = drug_row[0] if drug_row else None

                # Attempt to retrieve test cert from lab_data
                key_for_cert = product_name.upper()
                test_certificate = "; ".join(lab_data[key_for_cert]) if key_for_cert in lab_data else "N/A"

                # Insert into Vendors
                cursor.execute("""
                    INSERT INTO Vendors (
                        name,
                        product_name,
                        product_link,
                        product_image,
                        price,
                        size,
                        drug_id,
                        test_certificate
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    "Eros Peptides",
                    product_name,
                    product_link,
                    product_image,
                    price_text,
                    product_size,
                    drug_id,
                    test_certificate
                ))
                conn.commit()

                print(f"[INFO] Added: {product_name} | Price: {price_text} | Certs: {test_certificate}")

            except Exception as e:
                print(f"[WARN] Error extracting product: {e}")

        # Look for next-page link
        try:
            next_button = driver.find_element(By.CSS_SELECTOR, "a.next.page-numbers")
            page_url = next_button.get_attribute("href")
            page_num += 1
        except Exception:
            page_url = None

        # Short random pause before next page
        time.sleep(random.uniform(2, 5))


# --------------------------------------------------------------------
# MAIN SCRAPER LOGIC
# --------------------------------------------------------------------
if __name__ == "__main__":
    print("[INFO] Starting Eros Peptides scraper...")
    service = Service('/path/to/chromedriver')  # Update with your chromedriver path

    driver = configure_selenium()
    try:
        # Fetch lab results so we can match them to product names
        lab_results_data = fetch_lab_results(driver)

        # Now scrape the Eros shop pages, matching lab data
        scrape_eros_shop(driver, lab_results_data)
    except Exception as e:
        print(f"[ERROR] Failed to complete Eros scraping: {e}")
    finally:
        driver.quit()
        conn.close()
        print("[INFO] Scraping complete. Database connection closed.")
