#!/usr/bin/env python3
import os
import re
import time
import logging
import sqlite3
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from fake_useragent import UserAgent
from dotenv import load_dotenv
import hashlib
import random

# --- CONFIGURATION ---
BASE_URL = "https://researchem.is/shop/"
IMAGES_FOLDER = "downloaded_images"  # local folder to store downloaded images
DB_FILE = "DB/pepsources.db"         # path to your SQLite database

# Create images folder if it does not exist
if not os.path.exists(IMAGES_FOLDER):
    os.makedirs(IMAGES_FOLDER)

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("researchem_scraper")

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
def download_image(image_url: str) -> str:
    """
    Downloads the image from image_url and saves it in the IMAGES_FOLDER.
    Returns the local file path (or an empty string on failure).
    """
    try:
        # Create a unique filename using MD5 hash of the URL
        url_hash = hashlib.md5(image_url.encode()).hexdigest()
        extension = os.path.splitext(image_url)[1]
        if not extension:
            extension = ".png"  # Default extension
        
        filename = f"researchem_{url_hash}{extension}"
        local_path = os.path.join(IMAGES_FOLDER, filename)
        
        # Skip if already downloaded
        if os.path.exists(local_path):
            logger.info(f"Image already exists at {local_path}")
            return local_path
            
        response = requests.get(image_url, timeout=10)
        if response.status_code != 200:
            logger.error(f"Failed to download image {image_url} (status code {response.status_code})")
            return ""
        
        with open(local_path, "wb") as f:
            f.write(response.content)
        logger.info(f"Downloaded image from {image_url} to {local_path}")
        return local_path
    except Exception as e:
        logger.error(f"Error downloading image {image_url}: {e}")
        return ""

# --- EXTRACT SIZE FROM PRODUCT TITLE OR SIZE OPTION ---
def extract_size(title: str, size_option: str = None) -> str:
    """
    Extracts size information from the product title or size option.
    If size_option is provided, it takes precedence.
    """
    if size_option and size_option.strip():
        return size_option.strip()
        
    # Try to extract size with format like "10mg/mL (50mL)"
    size_match = re.search(r'(\d+(?:\.\d+)?(?:m|k|µ)?g\/mL.*?\([^)]*\))', title)
    if size_match:
        return size_match.group(0)
        
    # Try alternative format like "25mg - 5 Vials"
    alt_match = re.search(r'(\d+(?:\.\d+)?(?:m|k|µ)?g(?:\/mL)?(?:\s*[-–]\s*\d+\s*(?:Vials?|Caps?|Capsules?|Tablets?|Pills?))?)', title)
    if alt_match:
        return alt_match.group(0)
        
    return ""

# --- EXTRACT PRICE FROM PRICE ELEMENT ---
def extract_price(price_elem) -> str:
    """
    Extracts the price from a price element, choosing the second price (sale price) if available.
    """
    if not price_elem:
        return "N/A"
        
    # Check for sale price (second price element)
    price_amounts = price_elem.select(".woocommerce-Price-amount")
    if len(price_amounts) > 1:
        # Take the second price (usually the sale price)
        return price_amounts[1].text.strip()
    elif len(price_amounts) == 1:
        # Only one price available
        return price_amounts[0].text.strip()
    else:
        # Fallback to raw text
        return price_elem.text.strip()

# --- FUNCTION TO SCRAPE A SINGLE PRODUCT DETAIL PAGE ---
def scrape_product_page(product_url: str) -> list:
    """
    Given a product URL, scrape the product title, price, size, and image.
    Handles multiple size options if available.
    Returns a list of dictionaries with the extracted data for each size option.
    """
    driver = configure_selenium()
    products = []
    
    try:
        logger.info(f"Processing product page: {product_url}")
        driver.get(product_url)
        time.sleep(random.uniform(2, 4))  # Add randomness to appear more human-like
        
        # Extract title
        try:
            title_elem = WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "h1.product_title.entry-title"))
            )
            title = title_elem.text.strip()
        except Exception as e:
            logger.error(f"Could not find product title on {product_url}: {e}")
            return []
        
        # Find image URL - first try zoomImg
        image_url = ""
        try:
            zoom_img = driver.find_element(By.CSS_SELECTOR, ".zoomImg")
            image_url = zoom_img.get_attribute("src")
        except:
            pass
            
        # Fallback to other image sources if zoomImg not found
        if not image_url:
            try:
                image_elem = driver.find_element(By.CSS_SELECTOR, ".woocommerce-product-gallery__image img")
                image_url = image_elem.get_attribute("src")
            except:
                pass
                
        # Another fallback for other possible image locations
        if not image_url:
            try:
                all_images = driver.find_elements(By.CSS_SELECTOR, ".woocommerce-product-gallery img")
                if all_images:
                    image_url = all_images[0].get_attribute("src")
            except:
                pass
                
        if not image_url:
            logger.error(f"Could not find product image on {product_url}")
        else:
            logger.info(f"Found image URL: {image_url}")
            
        # Download the image
        local_image_path = download_image(image_url) if image_url else ""
        
        # Check for size variations
        try:
            size_swatches = driver.find_elements(By.CSS_SELECTOR, "ul.cgkit-attribute-swatches li button")
            
            if size_swatches:
                logger.info(f"Found {len(size_swatches)} size options for {title}")
                
                # Process each size option
                for i, swatch in enumerate(size_swatches):
                    try:
                        size_text = swatch.get_attribute("data-attribute-text") or swatch.text.strip()
                        logger.info(f"Processing size option: {size_text}")
                        
                        # Click on the size option
                        driver.execute_script("arguments[0].click();", swatch)
                        time.sleep(1.5)  # Wait for price to update
                        
                        # Extract the updated price
                        price_elem = driver.find_element(By.CSS_SELECTOR, ".woocommerce-variation-price")
                        price = extract_price(BeautifulSoup(price_elem.get_attribute("innerHTML"), "html.parser"))
                        
                        products.append({
                            "product_name": title,
                            "product_link": product_url,
                            "price": price,
                            "size": size_text,
                            "product_image": local_image_path
                        })
                        logger.info(f"Added product variant: {title} - Size: {size_text} - Price: {price}")
                    except Exception as e:
                        logger.error(f"Error processing size option {i}: {e}")
            else:
                # No size options found, get default price
                try:
                    price_elem = driver.find_element(By.CSS_SELECTOR, ".price")
                    price = extract_price(BeautifulSoup(price_elem.get_attribute("innerHTML"), "html.parser"))
                except:
                    price = "N/A"
                    logger.error(f"Could not find price for {title}")
                
                # Extract size from title
                size = extract_size(title)
                
                products.append({
                    "product_name": title,
                    "product_link": product_url,
                    "price": price,
                    "size": size,
                    "product_image": local_image_path
                })
                logger.info(f"Added product: {title} - Size: {size} - Price: {price}")
        except Exception as e:
            logger.error(f"Error checking for size variations: {e}")
            
            # Fallback to simple extraction
            try:
                price_elem = driver.find_element(By.CSS_SELECTOR, ".price")
                price = extract_price(BeautifulSoup(price_elem.get_attribute("innerHTML"), "html.parser"))
            except:
                price = "N/A"
                logger.error(f"Could not find price for {title}")
            
            # Extract size from title
            size = extract_size(title)
            
            products.append({
                "product_name": title,
                "product_link": product_url,
                "price": price,
                "size": size,
                "product_image": local_image_path
            })
            logger.info(f"Added product (fallback method): {title} - Size: {size} - Price: {price}")
    
    except Exception as e:
        logger.error(f"Error scraping product page {product_url}: {e}")
    finally:
        driver.quit()
        
    return products

# --- FUNCTION TO GET ALL PRODUCT URLS FROM PAGINATION ---
def get_all_product_urls():
    """
    Navigate through all pagination pages and collect product URLs
    """
    driver = configure_selenium()
    product_urls = []
    current_page = 1
    max_pages = 7  # Start with assumption of 7 pages
    
    while current_page <= max_pages:
        page_url = BASE_URL if current_page == 1 else f"{BASE_URL}page/{current_page}/"
        logger.info(f"Fetching product listings from page {current_page}: {page_url}")
        
        driver.get(page_url)
        time.sleep(random.uniform(3, 5))  # Wait for page to load
        
        soup = BeautifulSoup(driver.page_source, "html.parser")
        
        # Extract product URLs from this page - use exact selector from example
        for product_elem in soup.select("li.product.type-product"):
            # First try to get the link from the title
            link_elem = product_elem.select_one(".woocommerce-card__header a, .woocommerce-cardheader a")
            
            # If that fails, try the product image link
            if not link_elem or not link_elem.get('href'):
                link_elem = product_elem.select_one(".woocommerce-image__wrapper a, .woocommerce-imagewrapper a")
                
            if link_elem and link_elem.get('href'):
                product_urls.append(link_elem['href'])
                logger.info(f"Found product URL: {link_elem['href']}")
        
        # Update max_pages from pagination data
        pagination = soup.select_one(".woo-pagination-wrapper")
        if pagination and pagination.get('data-total'):
            max_pages = int(pagination['data-total'])
        elif pagination and pagination.get('data-current'):
            # Try to get max pages by counting page links
            page_links = pagination.select("ul.page-numbers li")
            if page_links:
                max_pages = len(page_links) - 1  # Subtract 1 for the "next" button
        
        # Check if we have "next" button
        next_button = soup.select_one("a.next.page-numbers")
        if not next_button:
            logger.info(f"No next page button found on page {current_page}. Stopping pagination.")
            break
            
        current_page += 1
    
    driver.quit()
    logger.info(f"Found a total of {len(product_urls)} product URLs across {current_page-1} pages")
    return product_urls

# --- MAIN PROCESS ---
def main():
    # Make sure the database has all required fields
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Check if required columns exist in Vendors table
    cursor.execute("PRAGMA table_info(Vendors)")
    columns = [col[1] for col in cursor.fetchall()]
    
    # Add in_supabase column if it doesn't exist
    if 'in_supabase' not in columns:
        logger.info("Adding 'in_supabase' column to Vendors table")
        cursor.execute("ALTER TABLE Vendors ADD COLUMN in_supabase BOOLEAN DEFAULT FALSE")
        conn.commit()
    
    conn.close()
    
    # Get all product URLs from all pages
    product_urls = get_all_product_urls()
    
    # Set up SQLite connection
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    products_added = 0
    
    # For each product link, scrape its details and insert a new vendor record
    for url in product_urls:
        try:
            product_variants = scrape_product_page(url)
            
            if not product_variants:
                logger.warning(f"No product data found for {url}. Skipping.")
                continue
            
            # Insert each product variant into the database
            for product_data in product_variants:
                if not product_data.get("product_name"):
                    logger.warning(f"Skipping variant with missing product name for {url}")
                    continue
                
                # Insert into Vendors table
                cursor.execute("""
                    INSERT INTO Vendors (name, product_name, product_link, product_image, price, size, in_supabase)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    "ResearchChem",  # Updated name to ResearchChem
                    product_data.get("product_name", ""),
                    product_data.get("product_link", ""),
                    product_data.get("product_image", ""),
                    product_data.get("price", ""),
                    product_data.get("size", ""),
                    0  # in_supabase flag set to 0
                ))
                conn.commit()
                products_added += 1
            
            # Add a random delay between product scrapes
            time.sleep(random.uniform(2, 4))
            
        except Exception as e:
            logger.error(f"Error processing product at {url}: {e}")
    
    conn.close()
    logger.info(f"Scraping complete. Added {products_added} products to the database.")

if __name__ == "__main__":
    main()