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
from selenium.webdriver.common.action_chains import ActionChains
from fake_useragent import UserAgent

# --- CONFIGURATION ---
BASE_URL = "https://primepeptides.co/collections/all"
IMAGES_FOLDER = "downloaded_images"  # Local folder to store downloaded images
DB_FILE = "DB/pepsources.db"
SLEEP_TIME = 3  # seconds delay for page loading
VENDOR_NAME = "PrimePeptides"  # Constant vendor name for these products

# Ensure the images folder exists
if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)

# --- SETUP LOGGING (minimal) ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("primepeptides_scraper")

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

# --- DOWNLOAD IMAGE ---
def download_image(image_url: str, product_slug: str) -> str:
    """
    Downloads the image from image_url and saves it in the IMAGES_FOLDER.
    Returns the local file path, or an empty string on failure.
    """
    try:
        headers = {"User-Agent": UserAgent().random, "Referer": BASE_URL}
        time.sleep(1)
        response = requests.get(image_url, headers=headers, timeout=10)
        if response.status_code != 200:
            logger.error(f"Failed to download image {image_url} (status code {response.status_code})")
            return ""
        filename = f"{product_slug}_{int(time.time())}.webp"
        local_path = os.path.join(IMAGES_FOLDER, filename)
        with open(local_path, "wb") as f:
            f.write(response.content)
        logger.info(f"Downloaded image to {local_path}")
        return local_path
    except Exception as e:
        logger.error(f"Error downloading image {image_url}: {e}")
        return ""

# --- DATABASE HELPER ---
def insert_vendor(vendor: dict):
    """
    Inserts a vendor record into the Vendors table.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Vendors (name, product_name, product_link, product_image, price, size, in_supabase)
            VALUES (?, ?, ?, ?, ?, ?, ?)
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

# --- SCRAPE LISTING PAGE ---
def scrape_listing_page(url: str) -> list:
    """
    Opens the listing page and extracts product page URLs.
    Returns a list of absolute product URLs.
    """
    driver = configure_selenium()
    logger.info(f"Scraping listing page: {url}")
    driver.get(url)
    time.sleep(SLEEP_TIME)
    soup = BeautifulSoup(driver.page_source, "html.parser")
    driver.quit()
    
    product_links = []
    # Each product link is contained in an <a> with class "full-unstyled-link" inside the product card.
    for li in soup.select("li.grid__item"):
        a_tag = li.find("a", class_="full-unstyled-link")
        if a_tag:
            link = a_tag.get("href", "").strip()
            if link:
                if link.startswith("/"):
                    link = "https://primepeptides.co" + link
                product_links.append(link)
    logger.info(f"Found {len(product_links)} product links on listing page.")
    return product_links

# --- PROCESS PRODUCT PAGE ---
def process_product_page(product_link: str) -> list:
    """
    Visits a product page, extracts the product name, price, image, and size options.
    Iterates through all available size options (if any) and, for each variant,
    extracts the updated price (by clicking the corresponding radio button).
    Returns a list of vendor entry dictionaries.
    """
    driver = configure_selenium()
    logger.info(f"Processing product page: {product_link}")
    vendor_entries = []
    try:
        driver.get(product_link)
        time.sleep(SLEEP_TIME)
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # Extract product name from <div class="product__title">
        title_elem = soup.select_one("div.product__title h1")
        if not title_elem:
            logger.error("Product title element not found on product page; skipping product.")
            driver.quit()
            return []
        product_name = title_elem.get_text(strip=True)
        
        # Extract price from the dedicated price container.
        price_container = soup.find("div", class_="price price--large price--show-badge")
        price_text = ""
        if price_container:
            container = price_container.find("div", class_="price__container")
            if container:
                sale_elem = container.find(lambda tag: tag.name=="span" and tag.get("class") and "price-item--sale" in tag.get("class"))
                if sale_elem and sale_elem.get_text(strip=True):
                    price_text = sale_elem.get_text(strip=True)
                else:
                    regular_elem = container.find(lambda tag: tag.name=="span" and tag.get("class") and "price-item--regular" in tag.get("class"))
                    if regular_elem:
                        price_text = regular_elem.get_text(strip=True)
        price_text = price_text.strip()
        if not price_text:
            logger.error("Price not found on product page; skipping product.")
            driver.quit()
            return []

        # Extract main product image URL from <div class="product__media">
        image_elem = soup.select_one("div.product__media img")
        product_image_url = ""
        if image_elem:
            product_image_url = image_elem.get("src", "")
            if product_image_url.startswith("//"):
                product_image_url = "https:" + product_image_url
        product_slug = re.sub(r"\W+", "_", product_name.lower())
        local_image_path = download_image(product_image_url, product_slug) if product_image_url else ""
        
        # Determine available size options by finding all radio inputs with name starting with "Size"
        sizes = []
        radio_inputs = soup.find_all("input", {"type": "radio", "name": re.compile("^Size", re.IGNORECASE)})
        for radio in radio_inputs:
            size_val = radio.get("value", "").strip()
            if size_val and size_val not in sizes:
                sizes.append(size_val)
        if not sizes:
            sizes = [""]  # Use a single blank option if no sizes available
        
        # For each size option, if applicable, click the radio button to update price and record vendor data.
        for size_option in sizes:
            if size_option:
                try:
                    xpath = f"//input[@type='radio' and contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '{size_option.lower()}')]"
                    radio_elem = driver.find_element(By.XPATH, xpath)
                    driver.execute_script("arguments[0].click();", radio_elem)
                    time.sleep(2)  # Allow updated price to load
                except Exception as e:
                    logger.error(f"Size option '{size_option}' not clickable: {e}")
            try:
                updated_price_container = driver.find_element(By.CSS_SELECTOR, "div.price.price--large.price--show-badge")
                updated_container = updated_price_container.find_element(By.CSS_SELECTOR, "div.price__container")
                sale_elements = updated_container.find_elements(By.CSS_SELECTOR, "span.price-item--sale")
                if sale_elements and sale_elements[0].text.strip():
                    updated_price = sale_elements[0].text.strip()
                else:
                    regular_elem = updated_container.find_element(By.CSS_SELECTOR, "span.price-item--regular")
                    updated_price = regular_elem.text.strip()
            except Exception as e:
                logger.error(f"Error re-reading price for size '{size_option}': {e}")
                updated_price = price_text

            entry = {
                "name": VENDOR_NAME,
                "product_name": product_name,
                "product_link": product_link,
                "product_image": local_image_path,
                "price": updated_price,
                "size": size_option,
                "in_supabase": 0
            }
            vendor_entries.append(entry)
            logger.info(f"Prepared vendor entry for size '{size_option}' with price '{updated_price}'.")
        
        driver.quit()
        return vendor_entries

    except Exception as e:
        logger.error(f"Error processing product page {product_link}: {e}")
        driver.quit()
        return []

# --- MAIN PROCESS ---
def main():
    # For Prime Peptides, all products are on a single page.
    product_links = scrape_listing_page(BASE_URL)
    logger.info(f"Total product links found: {len(product_links)}")
    
    all_vendor_entries = []
    for link in product_links:
        entries = process_product_page(link)
        if entries:
            all_vendor_entries.extend(entries)
        else:
            logger.info(f"No vendor entries extracted from {link}.")
        time.sleep(2)  # Delay between processing product pages

    logger.info(f"Total new vendor entries prepared: {len(all_vendor_entries)}")
    
    # Insert each vendor entry into the database.
    for vendor in all_vendor_entries:
        insert_vendor(vendor)
    
    logger.info("Completed scraping and insertion for Prime Peptides.")

if __name__ == "__main__":
    main()