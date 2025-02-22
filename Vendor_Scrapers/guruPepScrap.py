#!/usr/bin/env python3
import os
import re
import sys
import time
import json
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
BASE_URL = "https://gurupeptides.com/shop/"
NUM_PAGES = 5  # scrape pages 1 to 5
IMAGES_FOLDER = "downloaded_images"  # folder to store downloaded images
DB_FILE = "DB/pepsources.db"

# Ensure the images folder exists
if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)
    logging.info(f"Created images folder at '{IMAGES_FOLDER}'")

# --- SETUP LOGGING ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("gurupeptides_scraper")

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

# --- DOWNLOAD IMAGE ---
def download_image(image_url: str, product_slug: str) -> str:
    """
    Downloads the image from image_url and saves it in the IMAGES_FOLDER.
    Returns the local file path, or an empty string on failure.
    """
    try:
        response = requests.get(image_url, timeout=10)
        if response.status_code != 200:
            logger.error(f"Failed to download image {image_url} (status code {response.status_code})")
            return ""
        # Create a filename based on the product slug and current timestamp.
        filename = f"{product_slug}_{int(time.time())}.webp"
        local_path = os.path.join(IMAGES_FOLDER, filename)
        with open(local_path, "wb") as f:
            f.write(response.content)
        logger.info(f"Downloaded image from {image_url} to {local_path}")
        return local_path
    except Exception as e:
        logger.error(f"Error downloading image {image_url}: {e}")
        return ""

# --- PARSE A SINGLE PRODUCT ITEM ---
def parse_product_item(item) -> dict:
    """
    Given a BeautifulSoup element for a product, extract product data.
    Returns a dict with keys:
      - name: vendor name (constant for GuruPeptides)
      - product_name: product title from the h3 element
      - product_link: full URL to the product page
      - product_image: local path of the downloaded image
      - price: sale price if available, else the regular price
      - size: selected size from the <select> element (if available)
      - in_supabase: 0 (new row)
    """
    # Extract product title and link from the h3 element.
    title_elem = item.select_one("h3.wd-entities-title a")
    if not title_elem:
        return {}
    product_name = title_elem.get_text(strip=True)
    product_link = title_elem.get("href", "")
    if product_link.startswith("/"):
        product_link = "https://gurupeptides.com" + product_link

    # Extract price: check for sale price (<ins>) first; if not, use regular price.
    price_elem = item.select_one("span.price")
    price_text = ""
    if price_elem:
        ins_elem = price_elem.select_one("ins span.woocommerce-Price-amount")
        if ins_elem:
            price_text = ins_elem.get_text(strip=True)
        else:
            regular_elem = price_elem.select_one("span.woocommerce-Price-amount")
            if regular_elem:
                price_text = regular_elem.get_text(strip=True)
    price_text = price_text.strip()

    # Extract size if a <select> element is present.
    size = ""
    select_elem = item.select_one("select.select__select")
    if select_elem:
        option_elem = select_elem.find("option", selected=True)
        if option_elem:
            size = option_elem.get_text(strip=True)

    # Extract the product image URL from the <img> within the product-image-link.
    image_elem = item.select_one("a.product-image-link img")
    product_image_url = ""
    if image_elem:
        product_image_url = image_elem.get("src", "")
        if product_image_url.startswith("//"):
            product_image_url = "https:" + product_image_url

    # Download the image locally.
    product_slug = re.sub(r"\W+", "_", product_name.lower())
    local_image_path = download_image(product_image_url, product_slug) if product_image_url else ""

    return {
        "name": "GuruPeptides",  # vendor name is constant for this site
        "product_name": product_name,
        "product_link": product_link,
        "product_image": local_image_path,
        "price": price_text,
        "size": size,
        "in_supabase": 0  # new row, not yet in Supabase
    }

# --- SCRAPE A SINGLE PAGE ---
def scrape_page(page_url: str) -> list:
    """
    Opens the page_url with Selenium, parses the HTML with BeautifulSoup,
    and extracts product data for each product item.
    Returns a list of product dictionaries.
    """
    driver = configure_selenium()
    logger.info(f"Scraping page: {page_url}")
    driver.get(page_url)
    time.sleep(3)  # allow page to load fully
    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()
    
    # Updated selector: use "div.wd-product" to match product containers.
    product_items = soup.select("div.wd-product")
    logger.info(f"Found {len(product_items)} products on page.")
    products = []
    for item in product_items:
        product_data = parse_product_item(item)
        if product_data:
            products.append(product_data)
            logger.info(f"Parsed product: '{product_data.get('product_name')}', Price: '{product_data.get('price')}', Size: '{product_data.get('size')}'")
    return products

# --- INSERT PRODUCTS INTO DATABASE ---
def insert_vendor(vendor: dict):
    """
    Inserts a vendor record into the Vendors table.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Vendors (
                name, product_name, product_link, product_image, price, size, in_supabase
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            vendor.get("name"),
            vendor.get("product_name"),
            vendor.get("product_link"),
            vendor.get("product_image"),
            vendor.get("price"),
            vendor.get("size"),
            vendor.get("in_supabase")
        ))
        conn.commit()
        vendor_id = cursor.lastrowid
        conn.close()
        logger.info(f"Inserted vendor {vendor_id}: '{vendor.get('product_name')}', Size: '{vendor.get('size')}', Price: '{vendor.get('price')}'")
    except Exception as e:
        logger.error(f"Error inserting vendor: {e}")

# --- MAIN PROCESS ---
def main():
    all_products = []
    # Iterate through pages 1 to NUM_PAGES.
    for page_num in range(1, NUM_PAGES + 1):
        if page_num == 1:
            url = BASE_URL
        else:
            url = f"{BASE_URL}page/{page_num}/"
        products = scrape_page(url)
        all_products.extend(products)
    logger.info(f"Total products scraped from GuruPeptides: {len(all_products)}")
    
    # Insert each product as a vendor row.
    for vendor in all_products:
        insert_vendor(vendor)
    
    logger.info("Completed scraping and insertion for GuruPeptides.")

if __name__ == "__main__":
    main()