#!/usr/bin/env python3
import sqlite3
import os
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("clearpeptides_clearer")

# Path to your SQLite database
DB_FILE = "DB/pepsources.db"

def clear_clearpeptides_vendors():
    """Deletes vendor rows from the Vendors table where the product_link contains 'clearpeptides.net'."""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        delete_query = "DELETE FROM Vendors WHERE product_link LIKE ?"
        pattern = "%clearpeptides.net%"
        cursor.execute(delete_query, (pattern,))
        conn.commit()
        deleted = cursor.rowcount
        logger.info(f"Deleted {deleted} vendor rows from ClearPeptides selection.")
    except Exception as e:
        logger.error(f"Error deleting ClearPeptides vendors: {e}")
    finally:
        conn.close()

def main():
    clear_clearpeptides_vendors()

if __name__ == "__main__":
    main()