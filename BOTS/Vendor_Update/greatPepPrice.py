#!/usr/bin/env python3
import os
import time
import logging
import sqlite3
import re
from datetime import datetime
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from fake_useragent import UserAgent
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# --- CONFIGURATION ---
DB_FILE = "DB/pepsources.db"
SLEEP_TIME = 3  # seconds to wait for pages to load
TARGET_VENDOR_NAME = "GreatPeptides"  # Change this if needed

# --- SETUP LOGGING ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("update_greatpeptides_prices")

# --- SELENIUM CONFIGURATION ---
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")  # Remove for debugging
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

# --- FUNCTION TO EXTRACT UPDATED PRICE ---
def extract_updated_price(product_link: str) -> str:
    driver = configure_selenium()
    try:
        logger.info(f"Opening product page: {product_link}")
        driver.get(product_link)
        time.sleep(SLEEP_TIME)
        soup = BeautifulSoup(driver.page_source, "html.parser")
        price_text = ""
        # Try to find the price container (adjust selector as needed)
        price_container = soup.find("div", class_="price price--large price--show-badge")
        if price_container:
            container = price_container.find("div", class_="price__container")
            if container:
                sale_elem = container.find(lambda tag: tag.name=="span" and tag.has_attr("class") and "price-item--sale" in tag["class"])
                if sale_elem and sale_elem.get_text(strip=True):
                    price_text = sale_elem.get_text(strip=True)
                else:
                    regular_elem = container.find(lambda tag: tag.name=="span" and tag.has_attr("class") and "price-item--regular" in tag["class"])
                    if regular_elem:
                        price_text = regular_elem.get_text(strip=True)
        else:
            # Fallback: try a <p> with class "price"
            p_price = soup.find("p", class_="price")
            if p_price:
                price_text = p_price.get_text(strip=True)
        driver.quit()
        logger.info(f"Extracted price: '{price_text}' from {product_link}")
        return price_text
    except Exception as e:
        logger.error(f"Error extracting price from {product_link}: {e}")
        driver.quit()
        return ""

# --- FUNCTION TO UPDATE VENDOR PRICE IN DB ---
def update_vendor_price(vendor_id: int, new_price: str):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE Vendors SET price = ? WHERE id = ?", (new_price, vendor_id))
        conn.commit()
        conn.close()
        logger.info(f"Updated vendor {vendor_id} with new price '{new_price}'")
    except Exception as e:
        logger.error(f"Error updating vendor {vendor_id} in DB: {e}")

# --- MAIN PROCESS ---
def main():
    # Connect to the SQLite DB and select vendor rows for TARGET_VENDOR_NAME
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT id, product_link, price FROM Vendors WHERE name = ?", (TARGET_VENDOR_NAME,))
        vendors = cursor.fetchall()
        conn.close()
        logger.info(f"Found {len(vendors)} vendor entries for '{TARGET_VENDOR_NAME}'")
    except Exception as e:
        logger.error(f"Error retrieving vendor entries from DB: {e}")
        return

    # Process each vendor row
    for vendor in vendors:
        vendor_id = vendor["id"]
        product_link = vendor["product_link"]
        if not product_link:
            logger.warning(f"Vendor {vendor_id} has no product link. Skipping.")
            continue
        new_price = extract_updated_price(product_link)
        if new_price:
            update_vendor_price(vendor_id, new_price)
        else:
            logger.warning(f"Vendor {vendor_id}: No updated price extracted; skipping update.")
        time.sleep(2)  # Delay between processing each vendor

    logger.info("Completed updating vendor prices for GreatPeptides.")

if __name__ == "__main__":
    main()