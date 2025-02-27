#!/usr/bin/env python3
import os
import time
import sqlite3
import random
import re
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from fake_useragent import UserAgent
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# ---------------------------------------
# SELENIUM CONFIGURATION (ANTI-DETECTION)
# ---------------------------------------
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")  # Run headless
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

def random_delay(min_time=1, max_time=3):
    time.sleep(random.uniform(min_time, max_time))

# ---------------------------------------
# DATABASE SETUP
# ---------------------------------------
DB_PATH = "DB/pepsources.db"
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# ---------------------------------------
# HELPER FUNCTION: Extract updated price from page
# ---------------------------------------
def extract_price(driver):
    try:
        # Wait until the price element is present
        price_element = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".woocommerce-variation-price .price"))
        )
        price_html = price_element.get_attribute("innerHTML")
        # Use regex to extract price string (e.g., "$123.45")
        price_match = re.search(r"\$([\d,\.]+)", price_html)
        if price_match:
            return price_match.group(0)
    except Exception as e:
        print(f"[ERROR] Extracting price failed: {e}")
    return None

# ---------------------------------------
# MAIN SCRIPT: Update vendor prices for a given vendor name
# ---------------------------------------
def update_vendor_prices(vendor_name):
    # Fetch all vendor rows for the given vendor name
    cursor.execute("SELECT id, product_link, price, size FROM Vendors WHERE name = ?", (vendor_name,))
    vendor_rows = cursor.fetchall()
    print(f"[INFO] Found {len(vendor_rows)} vendor rows for vendor '{vendor_name}'.")

    driver = configure_selenium()

    for vendor in vendor_rows:
        vendor_id, product_link, current_price, current_size = vendor
        print(f"[INFO] Processing vendor id {vendor_id} with link: {product_link}")
        try:
            driver.get(product_link)
            random_delay(3, 7)
            new_price = extract_price(driver)
            if new_price:
                cursor.execute("UPDATE Vendors SET price = ? WHERE id = ?", (new_price, vendor_id))
                conn.commit()
                print(f"[INFO] Updated vendor id {vendor_id} with new price: {new_price}")
            else:
                print(f"[WARN] Could not extract price for vendor id {vendor_id}.")
        except Exception as e:
            print(f"[ERROR] Processing vendor id {vendor_id} failed: {e}")
        random_delay(1, 2)

    driver.quit()
    conn.close()
    print("[INFO] Price update complete.")

if __name__ == "__main__":
    # Set the vendor name (adjust as needed)
    vendor_name = "Prime Aminos"
    update_vendor_prices(vendor_name)