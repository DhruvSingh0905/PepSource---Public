#!/usr/bin/env python3
import os
import re
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
from fake_useragent import UserAgent
from dotenv import load_dotenv

# --- CONFIGURATION ---
BASE_URL = "https://www.peptidesciences.com/buy-peptides"
IMAGES_FOLDER = "downloaded_images"  # local folder to store downloaded images
DB_FILE = "DB/pepsources.db"         # path to your SQLite database

# Create images folder if it does not exist
if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("peptidesciences_scraper")

# Load environment variables
load_dotenv()

# --- SELENIUM CONFIGURATION ---
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")  # Use headless mode
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

# --- DOWNLOAD IMAGE FUNCTION ---
def download_image(image_url: str, product_slug: str) -> str:
    """
    Downloads the image from image_url and saves it in the IMAGES_FOLDER.
    Returns the local file path (or an empty string on failure).
    """
    try:
        response = requests.get(image_url, timeout=10)
        if response.status_code != 200:
            logger.error(f"Failed to download image {image_url} (status code {response.status_code})")
            return ""
        filename = f"{product_slug}_{int(time.time())}.webp"
        local_path = os.path.join(IMAGES_FOLDER, filename)
        with open(local_path, "wb") as f:
            f.write(response.content)
        logger.info(f"Downloaded image from {image_url} to {local_path}")
        return local_path
    except Exception as e:
        logger.error(f"Error downloading image {image_url}: {e}")
        return ""

# --- HELPER FUNCTION TO EXTRACT SIZE ---
def extract_size(title: str) -> str:
    """
    Extracts size information from the product title.
    For example, if the title contains '50mg' and/or '(60 Capsules)', it combines them.
    Returns a string like "50mg (60 Capsules)" or just "50mg" if only one is found.
    """
    mg_match = re.search(r"(\d+\s*mg)", title, re.IGNORECASE)
    cap_match = re.search(r"\((\d+\s*Capsules)\)", title, re.IGNORECASE)
    size_parts = []
    if mg_match:
        size_parts.append(mg_match.group(1).strip())
    if cap_match:
        size_parts.append(cap_match.group(1).strip())
    return " ".join(size_parts)

# --- FUNCTION TO SCRAPE A SINGLE PRODUCT DETAIL PAGE ---
def scrape_product_page(product_url: str) -> dict:
    """
    Given a product URL (detail page), scrape the product title, price, size, and image.
    Downloads the image and returns a dictionary with the extracted data.
    """
    driver = configure_selenium()
    logger.info(f"Processing product page: {product_url}")
    driver.get(product_url)
    time.sleep(3)  # wait for page load
    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    # Extract title from <h1 class="s-pdp__title title title_h2">
    title_elem = soup.find("h1", class_="s-pdp__title")
    if not title_elem:
        logger.error(f"Could not find product title on {product_url}")
        return {}
    title = title_elem.get_text(strip=True)

    # Extract price from <strong ...><span class="price">...</span></strong>
    price_elem = soup.find("strong", attrs={"data-price-amount": True})
    price = ""
    if price_elem:
        span_price = price_elem.find("span", class_="price")
        if span_price:
            price = span_price.get_text(strip=True)
    else:
        # Fallback: try to find a <p class="price">
        p_price = soup.find("p", class_="price")
        if p_price:
            price = p_price.get_text(strip=True)
    
    # Extract size by parsing the title (e.g., look for '50mg' and '(60 Capsules)')
    size = extract_size(title)

    # Extract image from <img class="gallery-placeholder__image s-pdp__img">
    image_elem = soup.find("img", class_="gallery-placeholder__image")
    image_url = ""
    if image_elem:
        image_url = image_elem.get("src", "")
        if image_url.startswith("//"):
            image_url = "https:" + image_url
    else:
        logger.error(f"Could not find product image on {product_url}")
    
    # Download the image locally
    product_slug = re.sub(r"\W+", "_", title.lower())
    local_image_path = download_image(image_url, product_slug) if image_url else ""

    return {
        "product_name": title,
        "product_link": product_url,
        "price": price,
        "size": size,
        "product_image": local_image_path
    }

# --- MAIN PROCESS: SCRAPE THE MAIN PAGE, THEN SCRAPE EACH PRODUCT DETAIL ---
def main():
    driver = configure_selenium()
    logger.info(f"Loading main listing page: {BASE_URL}")
    driver.get(BASE_URL)
    time.sleep(3)  # allow page to load
    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()

    # Extract all product items on the main page
    product_items = soup.select("li.c-product-card.s-plp__list-item")
    logger.info(f"Found {len(product_items)} products on the main page.")

    product_links = []
    for item in product_items:
        # Get product link from the <a> with class "c-product-card__image-wrapper"
        link_elem = item.find("a", class_="c-product-card__image-wrapper")
        if link_elem and link_elem.get("href"):
            link = link_elem.get("href")
            # Ensure full URL
            if link.startswith("/"):
                link = "https://www.peptidesciences.com" + link
            product_links.append(link)
        else:
            logger.warning("Product item missing product link; skipping.")

    logger.info(f"Extracted {len(product_links)} product links.")

    # Set up SQLite connection
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # For each product link, scrape its details and insert a new vendor record
    for url in product_links:
        product_data = scrape_product_page(url)
        if not product_data:
            logger.warning(f"Skipping product at {url} due to missing data.")
            continue

        # Insert into Vendors table. (For Peptide Sciences, vendor name is constant.)
        try:
            cursor.execute("""
                INSERT INTO Vendors (name, product_name, product_link, product_image, price, size, in_supabase)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                "PeptideSciences", 
                product_data.get("product_name", ""),
                product_data.get("product_link", ""),
                product_data.get("product_image", ""),
                product_data.get("price", ""),
                product_data.get("size", ""),
                0  # in_supabase flag set to 0
            ))
            conn.commit()
            vendor_id = cursor.lastrowid
            logger.info(f"Inserted vendor {vendor_id}: '{product_data.get('product_name')}', Size: '{product_data.get('size')}', Price: '{product_data.get('price')}'")
        except Exception as e:
            logger.error(f"Error inserting vendor for product {product_data.get('product_name')}: {e}")

    conn.close()
    logger.info("Scraping complete. Data saved to SQLite database.")

if __name__ == "__main__":
    main()