#!/usr/bin/env python3
import os
from dotenv import load_dotenv
load_dotenv()

import sqlite3
import time
import logging
import random
from openai import OpenAI

# Initialize OpenAI client with the API key from the environment
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("extract_size")

# Path to your SQLite DB file
DB_FILE = "DB/pepsources.db"

# Define the prompt template.
# If the product title does not contain "mg", "ml", or "iu" (case-insensitive),
# then append the current size value (from the DB) to the title.
def build_prompt(product_title: str, current_size: str) -> str:
    lower_title = product_title.lower()
    if not any(unit in lower_title for unit in ["mg", "ml", "iu"]):
        # Append the current size value so the AI can compute the total.
        product_title = f"{product_title} {current_size}"
    prompt = (
        "Extract the total size from the following product title. The product title may include a single size value "
        "or a multiplication expression. For example:\n"
        "- If the title contains '12.5mg x 10 ml', compute the total as 125mg (multiply 12.5 by 10, and use the unit from the first part).\n"
        "- If the title contains '60 mg x 60 capsules', compute the total as 3600mg.\n"
        "Return only a single output string that contains the numeric value and the unit (mg, ml, or IU) with no extra text.\n\n"
        f"Product Title: {product_title}\n"
        "Output:"
    )
    return prompt

def extract_size_from_title(product_title: str, current_size: str) -> str:
    prompt = build_prompt(product_title, current_size)
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=20,
            temperature=0.0
        )
        result = response.choices[0].message.content.strip()
        logger.info(f"Extracted size for '{product_title}': {result}")
        return result
    except Exception as e:
        logger.error(f"Error extracting size for '{product_title}': {e}")
        return ""

def main():
    # Connect to the local SQLite database
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # Modify the query to also fetch the current size column.
    cursor.execute("SELECT id, product_name, size FROM Vendors")
    vendors = cursor.fetchall()
    logger.info(f"Found {len(vendors)} vendor rows to process.")

    # Iterate over each vendor row
    for vendor in vendors:
        vendor_id, product_title, current_size = vendor
        if not product_title or product_title.strip() == "":
            logger.info(f"Skipping vendor id {vendor_id}: empty product title.")
            continue

        # If current_size is empty, use the product_title as is.
        if not current_size or current_size.strip() == "":
            current_size = ""

        # Extract standardized size via OpenAI
        standardized_size = extract_size_from_title(product_title, current_size)

        # If a size was successfully extracted, update the vendor row.
        if standardized_size:
            try:
                cursor.execute("UPDATE Vendors SET size = ? WHERE id = ?", (standardized_size, vendor_id))
                conn.commit()
                logger.info(f"Updated vendor id {vendor_id} with standardized size: {standardized_size}")
            except Exception as e:
                logger.error(f"Error updating vendor id {vendor_id}: {e}")
        else:
            logger.warning(f"No standardized size extracted for vendor id {vendor_id}.")

        # Wait a short randomized delay to avoid hitting rate limits
        time.sleep(random.uniform(1, 2))

    conn.close()
    logger.info("Processing complete.")

if __name__ == "__main__":
    main()