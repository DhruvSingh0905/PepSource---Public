#!/usr/bin/env python3
import os
import re
import time
import sqlite3
import requests
import logging
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from fake_useragent import UserAgent

# --- CONFIGURATION ---
DB_FILE = "DB/pepsources.db"
IMAGES_FOLDER = "downloaded_images"  # Local folder to store downloaded images
BASE_SLEEP = 3  # Seconds to wait for a page to load

# Ensure the images folder exists
if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)

# --- SETUP LOGGING (minimal) ---
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("update_vendor_images")

# --- SELENIUM CONFIGURATION ---
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument(f"--user-agent={ua.random}")
    
    driver = webdriver.Chrome(options=options)  # Ensure your chromedriver is in PATH or provide the executable_path argument.
    driver.implicitly_wait(5)
    # Bypass Chrome security warnings
    driver.execute_cdp_cmd("Page.enable", {})
    driver.execute_cdp_cmd("Page.setBypassCSP", {"enabled": True})
    return driver

# --- DOWNLOAD IMAGE FUNCTION ---
def download_image(image_url: str, product_slug: str) -> str:
    """
    Downloads the image from image_url and saves it in IMAGES_FOLDER.
    Returns the local file path, or an empty string on failure.
    """
    try:
        headers = {"User-Agent": UserAgent().random, "Referer": "https://swisschems.is/"}
        time.sleep(1)  # brief delay
        response = requests.get(image_url, headers=headers, timeout=10)
        if response.status_code != 200:
            logger.info(f"Failed to download image {image_url} (status code {response.status_code})")
            return ""
        filename = f"{product_slug}_{int(time.time())}.webp"
        local_path = os.path.join(IMAGES_FOLDER, filename)
        with open(local_path, "wb") as f:
            f.write(response.content)
        logger.info(f"Downloaded image from {image_url} to {local_path}")
        return local_path
    except Exception as e:
        logger.info(f"Error downloading image {image_url}: {e}")
        return ""

# --- DATABASE HELPER: Check if vendor already exists (by product_link) ---
def vendor_exists(product_link: str) -> bool:
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM Vendors WHERE product_link = ?", (product_link,))
        exists = cursor.fetchone() is not None
        conn.close()
        return exists
    except Exception as e:
        logger.info(f"Error checking vendor existence for {product_link}: {e}")
        return False

# --- PROCESS A SINGLE VENDOR ROW ---
def process_vendor(vendor):
    """
    For a vendor row (from SwissChems) with a missing product_image,
    go to its product_link, extract the image URL from the <div class="wcgs-slider-image"> element,
    download the image, and update the vendor record.
    """
    vendor_id = vendor[0]
    product_link = vendor[3]  # Assuming the vendor row columns: id, name, product_name, product_link, product_image, ...
    
    logger.info(f"Processing vendor {vendor_id} with product link: {product_link}")
    
    driver = configure_selenium()
    try:
        driver.get(product_link)
        time.sleep(BASE_SLEEP)
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # Look for the element containing the image
        image_container = soup.find("div", class_="wcgs-slider-image")
        if not image_container:
            logger.info(f"Vendor {vendor_id}: No 'wcgs-slider-image' element found. Skipping.")
            driver.quit()
            return
        
        # Try to get image URL from <a> tag first; if not, use <img> tag.
        a_elem = image_container.find("a", class_="wcgs-slider-lightbox")
        if a_elem and a_elem.get("href"):
            image_url = a_elem.get("href")
        else:
            img_elem = image_container.find("img", class_="skip-lazy wcgs-slider-image-tag")
            if img_elem and img_elem.get("src"):
                image_url = img_elem.get("src")
            else:
                logger.info(f"Vendor {vendor_id}: No image URL found in the element. Skipping.")
                driver.quit()
                return
        
        # Normalize URL if needed
        if image_url.startswith("//"):
            image_url = "https:" + image_url
        
        # Create a slug based on product name (assumed to be vendor[2])
        product_slug = re.sub(r"\W+", "_", vendor[2].lower())
        local_image_path = download_image(image_url, product_slug)
        
        if local_image_path:
            # Update the vendor row in the database
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("UPDATE Vendors SET product_image = ? WHERE id = ?", (local_image_path, vendor_id))
            conn.commit()
            conn.close()
            logger.info(f"Vendor {vendor_id}: Updated product image to {local_image_path}")
        else:
            logger.info(f"Vendor {vendor_id}: Failed to download image.")
    except Exception as e:
        logger.info(f"Vendor {vendor_id}: Error processing product link: {e}")
    finally:
        driver.quit()

# --- MAIN PROCESS ---
def main():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Query vendor rows for SwissChems where product_image is missing (NULL or empty)
    cursor.execute("SELECT id, name, product_name, product_link, product_image FROM Vendors WHERE (product_image IS NULL OR product_image = '') AND name = 'SwissChems'")
    vendors = cursor.fetchall()
    conn.close()
    
    logger.info(f"Found {len(vendors)} vendors with missing product images.")
    for vendor in vendors:
        process_vendor(vendor)
    logger.info("Completed updating product images for vendors.")

if __name__ == "__main__":
    main()