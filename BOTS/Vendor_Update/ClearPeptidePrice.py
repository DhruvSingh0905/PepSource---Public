#!/usr/bin/env python3
import sqlite3
import requests
from bs4 import BeautifulSoup
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("clearpeptides_price_updater")

DB_FILE = "DB/pepsources.db"
BASE_URL = "https://clearpeptides.net"

def get_clearpeptides_vendors():
    """
    Retrieve vendors from the database whose product_link indicates they come from ClearPeptides.
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Fetch vendors whose product_link contains "clearpeptides.net" or starts with "/products"
    query = """
        SELECT id, product_link, price 
        FROM Vendors
        WHERE product_link LIKE '%clearpeptides.net%' OR product_link LIKE '/products/%'
    """
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()
    return rows

def fetch_price_from_page(url):
    """
    Fetches the HTML page at 'url' and extracts the price.
    It first checks for a sale price and if not found, uses the regular price.
    Returns the price text (e.g., "$39.99 USD") or None if no price is found.
    """
    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            logger.error(f"Failed to fetch URL {url} (status code: {response.status_code})")
            return None
        soup = BeautifulSoup(response.text, "html.parser")
        # Look for sale price first.
        sale_price_elem = soup.select_one("span.price-item--sale.price-item--last")
        if sale_price_elem:
            price_text = sale_price_elem.get_text(strip=True)
            return price_text
        # Otherwise, look for the regular price.
        regular_price_elem = soup.select_one("span.price-item--regular")
        if regular_price_elem:
            price_text = regular_price_elem.get_text(strip=True)
            return price_text
        logger.warning(f"No price element found on page: {url}")
        return None
    except Exception as e:
        logger.error(f"Error fetching price from {url}: {e}")
        return None

def update_vendor_price(vendor_id, new_price):
    """
    Updates the vendor row in the database with the new price.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("UPDATE Vendors SET price = ? WHERE id = ?", (new_price, vendor_id))
    conn.commit()
    conn.close()

def main():
    vendors = get_clearpeptides_vendors()
    logger.info(f"Found {len(vendors)} ClearPeptides vendor rows to process.")
    
    for vendor in vendors:
        vendor_id = vendor["id"]
        product_link = vendor["product_link"]
        current_price = vendor["price"]
        # If product_link is relative, prepend BASE_URL.
        full_url = BASE_URL + product_link if product_link.startswith("/") else product_link
        logger.info(f"Processing vendor ID {vendor_id} with URL: {full_url}")
        
        new_price = fetch_price_from_page(full_url)
        if new_price:
            if new_price != current_price:
                update_vendor_price(vendor_id, new_price)
                logger.info(f"Updated vendor {vendor_id}: Price changed from '{current_price}' to '{new_price}'.")
            else:
                logger.info(f"No price change for vendor {vendor_id}. Current price remains '{current_price}'.")
        else:
            logger.warning(f"Could not fetch new price for vendor {vendor_id} at {full_url}.")
    
if __name__ == "__main__":
    main()