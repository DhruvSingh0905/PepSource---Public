#!/usr/bin/env python3
import os
import re
import sqlite3
import logging
import json
import time
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("gurupeptides_size_extractor")

# Database and model configuration
DB_FILE = "DB/pepsources.db"
MODEL = "gpt-4o"
MAX_TOKENS = 100

# Initialize OpenAI client
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

def extract_size_from_product_name(product_name: str) -> str:
    """
    Uses OpenAI to extract and calculate the total size from a product name.
    For example, if the product name is "5ml x 10 vials", it should return "50 ml".
    The response is normalized (all lowercase, no extra spaces).
    """
    prompt = f"""
Extract the total volume or size from the following product name.
If the product name indicates a multiplication (e.g., "5ml x 10 vials"), perform the calculation and return the total (e.g., "50 ml").
Return only the result with the unit (e.g., "50 ml"), or if it's 12.5mg per ml and 10 ml, return 125 mg with no extra text.
Product Name: {product_name}
"""
    try:
        response = openai_client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are an assistant that extracts and calculates the total size from product names exactly as given."},
                {"role": "user", "content": prompt}
            ],
            model=MODEL,
            max_tokens=MAX_TOKENS
        )
        size = response.choices[0].message.content.strip()
        # Normalize the extracted size using our clean function.
        normalized_size = re.sub(r"\s+", " ", size).strip().lower()
        logger.info(f"Extracted size '{normalized_size}' from product name '{product_name}'")
        return normalized_size
    except Exception as e:
        logger.error(f"Error extracting size for product name '{product_name}': {e}")
        return ""

def update_vendor_size(vendor_id: int, size: str):
    """
    Updates the Vendors table to set the size for the given vendor_id.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE Vendors SET size = ? WHERE id = ?", (size, vendor_id))
        conn.commit()
        conn.close()
        logger.info(f"Updated vendor ID {vendor_id} with new size: {size}")
    except Exception as e:
        logger.error(f"Error updating vendor ID {vendor_id} in DB: {e}")

def process_gurupeptides_sizes():
    """
    For all vendor rows from GuruPeptides, use OpenAI to extract the size from the product name
    and update the 'size' column. Only process rows where the vendor name is 'GuruPeptides'.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # Change this query if your table uses a different indicator.
        cursor.execute("SELECT id, product_name FROM Vendors WHERE name = 'GuruPeptides'")
        rows = cursor.fetchall()
        conn.close()
        logger.info(f"Found {len(rows)} GuruPeptides vendor rows to update size.")
    except Exception as e:
        logger.error(f"Error retrieving GuruPeptides vendors: {e}")
        return

    for row in rows:
        vendor_id = row["id"]
        product_name = row["product_name"]
        if not product_name:
            logger.warning(f"Vendor ID {vendor_id} has no product name; skipping.")
            continue
        size = extract_size_from_product_name(product_name)
        if size:
            update_vendor_size(vendor_id, size)
        else:
            logger.warning(f"Size extraction failed for vendor ID {vendor_id} with product name '{product_name}'.")

if __name__ == "__main__":
    process_gurupeptides_sizes()