#!/usr/bin/env python3
import os
import re
import random
import time
import json
import logging
import sqlite3
import requests
from datetime import datetime
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import Select
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from fake_useragent import UserAgent
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("clearpeptides_scraper")

# Load environment variables (if needed)
load_dotenv()

# Database file location
DB_FILE = "DB/pepsources.db"
# Folder to store downloaded images
IMAGE_FOLDER = "downloaded_images"
os.makedirs(IMAGE_FOLDER, exist_ok=True)

# Base URL for ClearPeptides All Products page
BASE_COLLECTION_URL = "https://clearpeptides.net/collections/all"

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

def download_image(image_url: str, product_title: str) -> str:
    """
    Downloads the image from image_url and saves it in IMAGE_FOLDER.
    Returns the local file path.
    """
    # Ensure the URL has a proper scheme.
    if image_url.startswith("//"):
        image_url = "https:" + image_url
    try:
        response = requests.get(image_url, stream=True)
        if response.status_code == 200:
            # Create a sanitized filename based on the product title and current timestamp.
            filename = re.sub(r"[^\w\-]", "_", product_title) + "_" + datetime.now().strftime("%Y%m%d%H%M%S") + ".jpg"
            filepath = os.path.join(IMAGE_FOLDER, filename)
            with open(filepath, "wb") as f:
                for chunk in response.iter_content(1024):
                    f.write(chunk)
            logger.info(f"Downloaded image for '{product_title}' to {filepath}")
            return filepath
        else:
            logger.warning(f"Failed to download image from {image_url}: HTTP {response.status_code}")
            return ""
    except Exception as e:
        logger.error(f"Error downloading image from {image_url}: {e}")
        return ""

def scrape_vendor_page(vendor_url: str):
    """
    Scrapes a single product (vendor) page from ClearPeptides.
    Returns a list of dicts, one for each variant (size option).
    Each dict will contain:
      - name: vendor name (fixed as "ClearPeptides" here)
      - product_name: product title
      - product_link: URL of the product page
      - product_image: local path of downloaded image
      - price: price string
      - size: size value from the selector
      - in_supabase: 0 (not yet updated)
    """
    driver = configure_selenium()
    logger.info(f"Loading vendor page: {vendor_url}")
    driver.get(vendor_url)
    time.sleep(random.uniform(3, 5))
    soup = BeautifulSoup(driver.page_source, "html.parser")
    
    # Extract product title.
    title_elem = soup.select_one("div.product__title h1") or soup.select_one("h1.card__heading")
    product_title = title_elem.get_text(strip=True) if title_elem else "Unknown Product"
    
    # Use a fixed vendor name for ClearPeptides.
    vendor_name = "ClearPeptides"
    
    # Extract the product image from the product media element.
    image_elem = soup.select_one("div.product__media img")
    if image_elem:
        image_src = image_elem.get("src", "")
    else:
        image_src = ""
    # Download the image.
    product_image_path = download_image(image_src, product_title) if image_src else ""
    
    # Extract price (prefer sale price if exists).
    sale_price_elem = soup.select_one("div.price__sale span.price-item--sale")
    if sale_price_elem:
        price = sale_price_elem.get_text(strip=True)
    else:
        reg_price_elem = soup.select_one("div.price__regular span.price-item--regular")
        price = reg_price_elem.get_text(strip=True) if reg_price_elem else "Unknown Price"
    
    # Prepare to extract size options.
    variants = []
    try:
        select_elem = driver.find_element(By.CSS_SELECTOR, "div.select select")
        select_obj = Select(select_elem)
        options = select_obj.options
        logger.info(f"Found {len(options)} size options for product '{product_title}'.")
        
        for option in options:
            size_value = option.get_attribute("value").strip()
            # Select this size option.
            select_obj.select_by_value(size_value)
            time.sleep(random.uniform(1, 2))
            updated_soup = BeautifulSoup(driver.page_source, "html.parser")
            # Get the price for this variant.
            sale_price_elem = updated_soup.select_one("div.price__sale span.price-item--sale")
            if sale_price_elem:
                variant_price = sale_price_elem.get_text(strip=True)
            else:
                reg_price_elem = updated_soup.select_one("div.price__regular span.price-item--regular")
                variant_price = reg_price_elem.get_text(strip=True) if reg_price_elem else price
            logger.info(f"Scraped variant: '{product_title}' | Size: '{size_value}' | Price: '{variant_price}'")
            variants.append({
                "name": vendor_name,  # Vendor name field
                "product_name": product_title,
                "product_link": vendor_url,
                "product_image": product_image_path,
                "price": variant_price,
                "size": size_value,
                "in_supabase": 0  # New rows are marked as not in Supabase.
            })
    except Exception as e:
        logger.error(f"Error extracting size options from {vendor_url}: {e}")
    
    driver.quit()
    return variants

def store_vendor_variants(variants):
    """
    Inserts vendor variant data into the Vendors table.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        for variant in variants:
            insert_query = """
                INSERT INTO Vendors 
                (name, product_name, product_link, product_image, price, size, in_supabase)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """
            cursor.execute(insert_query, (
                variant["name"],
                variant["product_name"],
                variant["product_link"],
                variant["product_image"],
                variant["price"],
                variant["size"],
                variant["in_supabase"]
            ))
            logger.info(f"Inserted vendor variant: '{variant['name']}' | Product: '{variant['product_name']}' | Size: '{variant['size']}' | Price: '{variant['price']}'")
        conn.commit()
    except Exception as e:
        logger.error(f"Error storing vendor variants: {e}")
    finally:
        conn.close()

def main():
    # For testing, scrape ClearPeptides All Products page.
    base_url = "https://clearpeptides.net/collections/all"
    driver = configure_selenium()
    driver.get(base_url)
    time.sleep(random.uniform(3, 5))
    soup = BeautifulSoup(driver.page_source, "html.parser")
    
    # Extract product links (assuming they begin with "/products/")
    product_links = set()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith("/products/"):
            full_link = "https://clearpeptides.net" + href
            product_links.add(full_link)
    logger.info(f"Found {len(product_links)} product links on ClearPeptides.")
    driver.quit()
    
    # Process each product link.
    for link in product_links:
        logger.info(f"Scraping product page: {link}")
        variants = scrape_vendor_page(link)
        if variants:
            store_vendor_variants(variants)
        else:
            logger.warning(f"No variants scraped for {link}")

if __name__ == "__main__":
    main()