import sqlite3
import time
import random
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import Select, WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from fake_useragent import UserAgent

# -------------------------------------------------------
# Selenium Configuration
# -------------------------------------------------------
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")  # Run headless
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument(f"--user-agent={ua.random}")
    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(5)
    return driver

# -------------------------------------------------------
# Price Extraction Functions
# -------------------------------------------------------
def get_price_for_size(driver, select, size_value):
    # Attempt to get the current price before selecting new size
    try:
        old_price_element = driver.find_element(By.CSS_SELECTOR, ".woocommerce-variation-price .woocommerce-Price-amount.amount")
        old_price = old_price_element.text.strip() if old_price_element else ""
    except Exception:
        old_price = ""
    # Scroll select element into view and choose the given size
    driver.execute_script("arguments[0].scrollIntoView(true);", select._el)
    select.select_by_value(size_value)
    time.sleep(random.uniform(1, 2))
    try:
        # Wait until the price text updates
        WebDriverWait(driver, 10).until(
            lambda d: d.find_element(By.CSS_SELECTOR, ".woocommerce-variation-price .woocommerce-Price-amount.amount").text.strip() != old_price
        )
    except Exception:
        return None
    try:
        new_price_element = driver.find_element(By.CSS_SELECTOR, ".woocommerce-variation-price .woocommerce-Price-amount.amount")
        current_price = new_price_element.text.strip() if new_price_element else None
    except Exception:
        current_price = None
    return current_price

def get_single_product_price(driver):
    try:
        price_el = driver.find_element(By.CSS_SELECTOR, ".price .woocommerce-Price-amount.amount")
        return price_el.text.strip()
    except Exception:
        return None

# -------------------------------------------------------
# Update Price for a Single Vendor
# -------------------------------------------------------
def update_vendor_price(driver, vendor):
    driver.get(vendor["product_link"])
    time.sleep(random.uniform(2, 5))
    new_price = None
    # Try several possible variation dropdown IDs
    dropdown_ids = ["pa_size", "weight-selection", "attribute_size"]
    variation_found = False
    for dropdown_id in dropdown_ids:
        try:
            select_element = WebDriverWait(driver, 5).until(
                EC.presence_of_element_located((By.ID, dropdown_id))
            )
            select = Select(select_element)
            variation_found = True
            # Try to select the vendor's recorded size first
            current_vendor_size = vendor["size"]
            try:
                select.select_by_value(current_vendor_size)
                time.sleep(random.uniform(1,2))
                new_price = get_price_for_size(driver, select, current_vendor_size)
            except Exception:
                # If that fails, choose the first available option.
                options = select.options
                if options:
                    option_value = options[0].get_attribute("value")
                    select.select_by_value(option_value)
                    time.sleep(random.uniform(1,2))
                    new_price = get_price_for_size(driver, select, option_value)
            break  # Use the first found variation dropdown.
        except Exception:
            continue
    if not variation_found:
        new_price = get_single_product_price(driver)
    return new_price

# -------------------------------------------------------
# Main Price Update Function
# -------------------------------------------------------
def update_prices():
    # Connect to SQLite database.
    conn = sqlite3.connect("DB/pepsources.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Fetch all vendors (id, product_link, price, size)
    cursor.execute("SELECT id, product_link, price, size FROM Vendors")
    vendors = cursor.fetchall()
    print(f"[INFO] Found {len(vendors)} vendors in the database.")
    
    driver = configure_selenium()
    
    for vendor in vendors:
        vendor_id = vendor["id"]
        product_link = vendor["product_link"]
        old_price = vendor["price"]
        new_price = update_vendor_price(driver, vendor)
        # Log and update only if a new price is found and it's different from the old one.
        if new_price and new_price != old_price:
            print(f"[INFO] Vendor {vendor_id}: New price found: {new_price} (old price: {old_price})")
            cursor.execute("UPDATE Vendors SET price = ? WHERE id = ?", (new_price, vendor_id))
            conn.commit()
        # Otherwise, do nothing.
        time.sleep(random.uniform(1, 3))
    
    driver.quit()
    conn.close()
    print("[INFO] Price update complete.")

if __name__ == "__main__":
    update_prices()