#!/usr/bin/env python3
import os
import re
import time
import random
import sqlite3
import logging
from datetime import datetime
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from fake_useragent import UserAgent
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# --------------------------------------------------
# CONFIGURATION & LOGGING
# --------------------------------------------------
DB_PATH = "DB/pepsources.db"
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("peptidesciences_price_update")

# --------------------------------------------------
# SELENIUM CONFIGURATION
# --------------------------------------------------
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")  # run headless
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument(f"--user-agent={ua.random}")
    
    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(5)
    return driver

def random_delay(min_time=1, max_time=3):
    time.sleep(random.uniform(min_time, max_time))

# --------------------------------------------------
# DATABASE SETUP
# --------------------------------------------------
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# --------------------------------------------------
# PRICE UPDATE SCRIPT FOR PEPTIDE SCIENCES
# --------------------------------------------------
def update_vendor_prices_for_peptidesciences():
    # Fetch all vendor rows with vendor name "PeptideSciences"
    cursor.execute("SELECT id, product_link FROM Vendors WHERE name = ?", ("PeptideSciences",))
    vendor_rows = cursor.fetchall()
    logger.info(f"Found {len(vendor_rows)} vendor rows for PeptideSciences.")
    
    driver = configure_selenium()
    
    for vendor in vendor_rows:
        vendor_id, product_link = vendor
        logger.info(f"Processing vendor id {vendor_id} with link: {product_link}")
        try:
            driver.get(product_link)
            # Allow page to load
            time.sleep(random.uniform(3, 6))
            # Parse the page with BeautifulSoup
            soup = BeautifulSoup(driver.page_source, "html.parser")
            price = ""
            # First try: look for a <strong> element with a data-price-amount attribute
            price_elem = soup.find("strong", attrs={"data-price-amount": True})
            if price_elem:
                span_price = price_elem.find("span", class_="price")
                if span_price:
                    price = span_price.get_text(strip=True)
            # Fallback: try to find a <p> element with class "price"
            if not price:
                p_price = soup.find("p", class_="price")
                if p_price:
                    price = p_price.get_text(strip=True)
            if not price:
                price = "N/A"
            # Update the Vendors table with the new price
            cursor.execute("UPDATE Vendors SET price = ? WHERE id = ?", (price, vendor_id))
            conn.commit()
            logger.info(f"Updated vendor id {vendor_id} with new price: {price}")
        except Exception as e:
            logger.error(f"Error updating vendor id {vendor_id}: {e}")
        random_delay(1, 3)
    
    driver.quit()
    conn.close()
    logger.info("Price update for Peptide Sciences complete.")

if __name__ == "__main__":
    update_vendor_prices_for_peptidesciences()