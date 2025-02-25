#!/usr/bin/env python3
import os
import re
import time
import logging
import sqlite3
import requests
from datetime import datetime
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from fake_useragent import UserAgent

# --- CONFIGURATION ---
BASE_URL_PREFIX = "https://gurupeptides.com/shop/"
DB_FILE = "DB/pepsources.db"
LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"

# --- SETUP LOGGING ---
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("gurupeptides_price_update")

# --- SELENIUM CONFIGURATION ---
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")  # remove for debugging
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument(f"--user-agent={ua.random}")
    
    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(5)
    
    # Bypass Chrome security warnings
    driver.execute_cdp_cmd("Page.enable", {})
    driver.execute_cdp_cmd("Page.setBypassCSP", {"enabled": True})
    
    return driver

# --- FUNCTION TO EXTRACT PRICE FROM PRODUCT PAGE ---
def extract_price_from_page(product_link: str) -> str:
    driver = configure_selenium()
    logger.info(f"Loading product page: {product_link}")
    driver.get(product_link)
    time.sleep(3)  # allow time for page to load

    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    # Try to extract the price from the page.
    # Check if there's an <ins> element (sale price) first.
    price_elem = soup.select_one("span.price")
    price_text = ""
    if price_elem:
        ins_elem = price_elem.select_one("ins span.woocommerce-Price-amount")
        if ins_elem:
            price_text = ins_elem.get_text(strip=True)
        else:
            # Fall back to any element with class "woocommerce-Price-amount"
            regular_elem = price_elem.select_one("span.woocommerce-Price-amount")
            if regular_elem:
                price_text = regular_elem.get_text(strip=True)
    else:
        logger.warning("Price element not found on page.")

    logger.info(f"Extracted price: {price_text}")
    return price_text

# --- FUNCTION TO UPDATE PRICE IN DATABASE ---
def update_vendor_price(vendor_id: int, new_price: str):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE Vendors SET price = ? WHERE id = ?", (new_price, vendor_id))
        conn.commit()
        conn.close()
        logger.info(f"Updated vendor ID {vendor_id} with new price: {new_price}")
    except Exception as e:
        logger.error(f"Error updating vendor ID {vendor_id} in DB: {e}")

# --- MAIN PROCESS ---
def main():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # Select vendors whose product_link starts with GuruPeptides base URL.
        cursor.execute("SELECT id, product_link FROM Vendors WHERE product_link LIKE ?", (f"{BASE_URL_PREFIX}%",))
        vendors = cursor.fetchall()
        conn.close()
        logger.info(f"Found {len(vendors)} vendor rows from GuruPeptides to update price.")
    except Exception as e:
        logger.error(f"Error querying database: {e}")
        return

    for row in vendors:
        vendor_id = row["id"]
        product_link = row["product_link"]
        if not product_link:
            logger.warning(f"Vendor ID {vendor_id} has no product link; skipping.")
            continue

        try:
            new_price = extract_price_from_page(product_link)
            if new_price:
                update_vendor_price(vendor_id, new_price)
            else:
                logger.warning(f"No price found for vendor ID {vendor_id} at {product_link}.")
        except Exception as e:
            logger.error(f"Error processing vendor ID {vendor_id}: {e}")

    logger.info("Completed updating prices for all GuruPeptides vendors.")

if __name__ == "__main__":
    main()