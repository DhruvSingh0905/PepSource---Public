import time
import sqlite3
import torch
import random
import re
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By
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
# 2) SELENIUM CONFIGURATION (ANTI-DETECTION & BYPASS SSL)
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
# 3) DATABASE SETUP (ENSURE test_certificate COLUMN EXISTS)
# ---------------------------------------

DB_PATH = "pepsources.db"
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

def ensure_test_certificate_column():
    """
    Adds a 'test_certificate' column to the Vendors table if it doesn't exist.
    """
    try:
        cursor.execute("ALTER TABLE Vendors ADD COLUMN test_certificate TEXT")
        conn.commit()
        print("[INFO] Added 'test_certificate' column to Vendors table.")
    except sqlite3.OperationalError:
        print("[INFO] 'test_certificate' column already exists. Skipping addition.")

ensure_test_certificate_column()

# ---------------------------------------
# 4) SCRAPE LAB RESULTS PAGE
# ---------------------------------------

def scrape_lab_results(driver, lab_url="https://primeaminos.com/lab-results/"):
    """
    Scrapes lab results page and extracts drug-test certificate associations.
    Returns a dictionary mapping drug names to lab document image URLs.
    """
    print(f"[INFO] Scraping lab results from {lab_url}")
    driver.get(lab_url)
    time.sleep(random.uniform(3, 6))  # Random delay for anti-detection

    lab_data = {}

    lab_items = driver.find_elements(By.CSS_SELECTOR, "figure.gallery-item")

    for item in lab_items:
        try:
            caption_element = item.find_element(By.CSS_SELECTOR, "figcaption.gallery-caption")
            drug_name = caption_element.text.strip().replace(" COA", "")  

            img_element = item.find_element(By.CSS_SELECTOR, "a")
            lab_image_url = img_element.get_attribute("href")

            if drug_name and lab_image_url:
                if drug_name in lab_data:
                    lab_data[drug_name].append(lab_image_url)
                else:
                    lab_data[drug_name] = [lab_image_url]

            print(f"[INFO] Found lab document for {drug_name}: {lab_image_url}")

        except Exception as e:
            print(f"[WARN] Error extracting lab results: {e}")

    return lab_data

# ---------------------------------------
# 5) EXTRACT PRODUCTS & ITERATE OVER SIZES
# ---------------------------------------

def extract_drugs(text):
    """
    Extracts drug names using BERT model.
    """
    entities = nlp_pipeline(text)
    drugs = []
    for ent in entities:
        if ent["entity_group"] == "DRUG":
            drug_name = ent["word"]
            drug_name = re.sub(r"\b\d+\s*(mg|IU|ml|grams)\b", "", drug_name, flags=re.IGNORECASE).strip()
            drugs.append(drug_name)
    return drugs[:2]

def scrape_product_listings(driver, base_url, lab_data):
    print(f"[INFO] Scraping product listings from {base_url}")
    driver.get(base_url)
    time.sleep(random.uniform(3, 7))

    product_elements = driver.find_elements(By.CSS_SELECTOR, "li.product.type-product")[:3]

    products = []
    for product in product_elements:
        try:
            img_element = product.find_element(By.CSS_SELECTOR, "figure a img")
            product_image = img_element.get_attribute("src")

            title_element = product.find_element(By.CSS_SELECTOR, "h2.woocommerce-loop-product__title a")
            product_link = title_element.get_attribute("href")
            product_name = title_element.text.strip()

            extracted_drugs = extract_drugs(product_name)
            primary_drug = extracted_drugs[0] if extracted_drugs else "Unknown"
            alt_drug = extracted_drugs[1] if len(extracted_drugs) > 1 else None

            test_certificate = "; ".join(lab_data.get(primary_drug, []))

            products.append((product_name, product_link, product_image, test_certificate, primary_drug, alt_drug))

        except Exception as e:
            print(f"[WARN] Skipping product due to error: {e}")

    return products

def scrape_product_sizes(driver, product_name, product_link, product_image,
                         test_certificate, primary_drug, alt_drug):
    """
    Select each size from the dropdown, wait for the price text to update,
    then save the updated price to the database.
    """
    driver.get(product_link)
    time.sleep(random.uniform(2, 6))

    try:
        # Wait for the <select> to exist
        select_element = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, "weight-selection"))
        )
        select = Select(select_element)

        # Gather all the non-empty option values, skipping "Choose an option"
        size_options = [
            option.get_attribute("value")
            for option in select.options
            if option.get_attribute("value")
        ]

        for size in size_options:
            # Try to read the "old" price; might not exist on first load
            try:
                old_price_element = driver.find_element(
                    By.CSS_SELECTOR,
                    ".woocommerce-variation-price .woocommerce-Price-amount.amount"
                )
                old_price = old_price_element.text.strip() if old_price_element else ""
            except:
                old_price = ""

            # Select the new size
            select.select_by_value(size)
            # Wait for the price <span> text to differ from old_price
            WebDriverWait(driver, 10).until(
                lambda d: d.find_element(
                    By.CSS_SELECTOR,
                    ".woocommerce-variation-price .woocommerce-Price-amount.amount"
                ).text.strip() != old_price
            )

            # Now the price text has updated
            new_price_element = driver.find_element(
                By.CSS_SELECTOR,
                ".woocommerce-variation-price .woocommerce-Price-amount.amount"
            )
            current_price = new_price_element.text.strip() if new_price_element else "N/A"

            # Save to DB
            cursor.execute(
                "INSERT OR IGNORE INTO Drugs (name, alt_name) VALUES (?, ?)",
                (primary_drug, alt_drug)
            )
            conn.commit()

            cursor.execute(
                "SELECT id FROM Drugs WHERE name = ?",
                (primary_drug,)
            )
            drug_id_row = cursor.fetchone()
            drug_id = drug_id_row[0] if drug_id_row else None

            cursor.execute("""
                INSERT INTO Vendors (
                    name, product_name, product_link,
                    product_image, price, size, drug_id, test_certificate
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                "Prime Aminos",
                product_name,
                product_link,
                product_image,
                current_price,
                size,
                drug_id,
                test_certificate
            ))
            conn.commit()

            print(f"[INFO] Stored: {product_name} | {size} | {current_price}")

    except Exception as e:
        print(f"[ERROR] Could not extract sizes for {product_name}: {e}")

def scrape_primeaminos():
    driver = configure_selenium()
    # Example usage:
    lab_data = scrape_lab_results(driver)
    products = scrape_product_listings(driver, "https://primeaminos.com/home/shop/", lab_data)

    for product in products:
        scrape_product_sizes(driver, *product)

    driver.quit()
    conn.close()

if __name__ == "__main__":
    scrape_primeaminos()