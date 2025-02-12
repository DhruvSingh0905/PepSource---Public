import time
import sqlite3
import torch
import random
import re
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from fake_useragent import UserAgent
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

# ---------------------------------------
# 1) BERT MODEL SETUP (DRUG NAME EXTRACTION)
# ---------------------------------------

MODEL_NAME = "jsylee/scibert_scivocab_uncased-finetuned-ner"
ID2LABEL = {0: 'O', 1: 'B-DRUG', 2: 'I-DRUG', 3: 'B-EFFECT', 4: 'I-EFFECT'}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

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
        aggregation_strategy="simple",
    )
    print("Model pipeline loaded successfully.")
except Exception as e:
    print(f"Error setting up BERT model: {e}")

# ---------------------------------------
# 2) HELPER FUNCTIONS (ANTI-DETECTION & EXTRACTIONS)
# ---------------------------------------

def truncate_text_for_model(text, max_length=512):
    inputs = tokenizer(
        text, return_tensors="pt", truncation=True, max_length=max_length, padding="max_length"
    )
    return tokenizer.decode(inputs["input_ids"][0], skip_special_tokens=True)

def extract_drugs(text):
    truncated = truncate_text_for_model(text)
    entities = nlp_pipeline(truncated)
    drugs = []
    for ent in entities:
        if ent["entity_group"] == "DRUG":
            drug_name = ent["word"]
            drug_name = re.sub(r"\b\d+\s*(mg|IU|ml|grams)\b", "", drug_name, flags=re.IGNORECASE).strip()
            drugs.append(drug_name)
    return drugs[:2]

def extract_size(text):
    match = re.search(r"\b(\d+\s*(mg|ml|grams|iu))\b", text, re.IGNORECASE)
    return match.group(0).strip() if match else None

def random_delay(min_time=2, max_time=5):
    """ Introduce random delays to mimic human browsing behavior """
    time.sleep(random.uniform(min_time, max_time))

# ---------------------------------------
# 3) SELENIUM CONFIGURATION (ANTI-DETECTION & BYPASS SSL)
# ---------------------------------------

def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")  # Remove for debugging
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--ignore-certificate-errors")  # Bypass SSL warnings
    options.add_argument(f"--user-agent={ua.random}")

    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(5)

    # Bypass Chrome security warnings
    driver.execute_cdp_cmd("Page.enable", {})
    driver.execute_cdp_cmd("Page.setBypassCSP", {"enabled": True})

    return driver

# ---------------------------------------
# 4) DATABASE SETUP (STORING DRUG & VENDOR DATA)
# ---------------------------------------

DB_PATH = "pepsources.db"
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS Drugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    alt_name TEXT
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
    drug_id INTEGER,
    FOREIGN KEY (drug_id) REFERENCES Drugs (id)
)
""")

conn.commit()

# ---------------------------------------
# 5) SCRAPING FUNCTIONS
# ---------------------------------------

def scrape_product_listings(driver, base_url):
    print(f"[INFO] Scraping product listings from {base_url}")
    driver.get(base_url)
    random_delay(3, 7)

    product_elements = driver.find_elements(By.CSS_SELECTOR, "div.product-grid-item")
    products = []

    for product in product_elements:
        try:
            img_element = product.find_element(By.CSS_SELECTOR, ".product-image-link img")
            product_image = img_element.get_attribute("src")

            title_element = product.find_element(By.CSS_SELECTOR, ".wd-entities-title a")
            product_link = title_element.get_attribute("href")
            product_name = title_element.text.strip()

            products.append((product_name, product_link, product_image))
        except Exception as e:
            print(f"[WARN] Skipping product due to error: {e}")

    return products

def scrape_product_details(driver, product_name, product_link, product_image):
    print(f"[INFO] Scraping product: {product_name}")
    driver.get(product_link)
    random_delay(2, 6)

    try:
        extracted_drugs = extract_drugs(product_name)
        primary_drug = extracted_drugs[0] if extracted_drugs else "Unknown"
        alt_drug = extracted_drugs[1] if len(extracted_drugs) > 1 else None

        cursor.execute("INSERT OR IGNORE INTO Drugs (name, alt_name) VALUES (?, ?)", (primary_drug, alt_drug))
        conn.commit()

        cursor.execute("SELECT id FROM Drugs WHERE name = ?", (primary_drug,))
        drug_id = cursor.fetchone()[0]

        select_element = WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.ID, "pa_size")))
        select = Select(select_element)
        size_options = [option.get_attribute("value") for option in select.options if option.get_attribute("value")]

        for size in size_options:
            try:
                select.select_by_value(size)
                random_delay(2, 5)

                price_element = WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.CSS_SELECTOR, ".woocommerce-variation-price .price")))
                price_html = price_element.get_attribute("innerHTML")
                price_match = re.search(r"\$([\d,.]+)", price_html)
                current_price = price_match.group(0) if price_match else "Unknown"

                cursor.execute("""
                    INSERT INTO Vendors (name, product_name, product_link, product_image, price, size, drug_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, ("Alimo Peptides", product_name, product_link, product_image, current_price, size, drug_id))

                conn.commit()

            except Exception as e:
                print(f"[WARN] Failed to extract price for size {size}: {e}")

    except Exception as e:
        print(f"[ERROR] Failed to extract sizes for {product_name}: {e}")

# ---------------------------------------
# 6) MAIN SCRAPING FUNCTION
# ---------------------------------------

def scrape_alimopeptides():
    driver = configure_selenium()
    try:
        BASE_URL = "https://alimopeptide.com/product-category/research-peptide/"
        products = scrape_product_listings(driver, BASE_URL)

        for product_name, product_link, product_image in products:
            scrape_product_details(driver, product_name, product_link, product_image)

    finally:
        driver.quit()
        conn.close()

if __name__ == "__main__":
    scrape_alimopeptides()