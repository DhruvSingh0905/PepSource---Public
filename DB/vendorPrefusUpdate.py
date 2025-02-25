#!/usr/bin/env python3
import sqlite3
import json
import os
import logging

# Configuration
DB_FILE = "DB/pepsources.db"

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("update_vendor_details")

def update_vendor_details():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # Get unique vendor names from Vendors table, along with the minimal vendor_id for each name.
        cursor.execute("SELECT name, MIN(id) as vendor_id FROM Vendors GROUP BY name")
        unique_vendors = cursor.fetchall()
        logger.info(f"Found {len(unique_vendors)} unique vendor names in Vendors table.")
        
        # Get the vendor_ids that are already in VendorDetails.
        cursor.execute("SELECT vendor_id FROM VendorDetails")
        existing_rows = cursor.fetchall()
        existing_vendor_ids = {row["vendor_id"] for row in existing_rows}
        logger.info(f"Found {len(existing_vendor_ids)} vendor IDs already in VendorDetails.")
        
        # For each unique vendor, if the chosen vendor_id is not in VendorDetails, insert a new row.
        new_vendor_count = 0
        for vendor in unique_vendors:
            vendor_name = vendor["name"]
            vendor_id = vendor["vendor_id"]
            if vendor_id in existing_vendor_ids:
                logger.info(f"Vendor '{vendor_name}' (ID: {vendor_id}) already exists in VendorDetails. Skipping.")
                continue
            # Insert a new row into VendorDetails with default NULL values for optional fields.
            cursor.execute("""
                INSERT INTO VendorDetails (
                    vendor_id, internal_coa, external_coa, latest_batch_test_date, 
                    endotoxin_test, sterility_test, years_in_business, external_COA_provider,
                    contact, Refund, Reimburse_Test, "comission", shipping, price_rating, Test_rating
                )
                VALUES (?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
            """, (vendor_id,))
            new_vendor_count += 1
            logger.info(f"Inserted vendor '{vendor_name}' with vendor_id {vendor_id} into VendorDetails.")
        
        conn.commit()
        conn.close()
        logger.info(f"VendorDetails update completed successfully. {new_vendor_count} new rows inserted.")
    except Exception as e:
        logger.error(f"Error updating VendorDetails: {e}")

if __name__ == "__main__":
    update_vendor_details()