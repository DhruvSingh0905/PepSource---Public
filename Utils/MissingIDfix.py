#!/usr/bin/env python3
import os
import sqlite3
import logging
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
SQLITE_DB_FILE = "DB/pepsources.db"  # Path to your local SQLite database
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
VENDORS_TABLE = "vendors"  # Supabase vendors table name

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Create Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def fetch_supabase_vendors_missing_drug_id():
    """
    Fetch vendors from Supabase where drug_id is NULL.
    """
    try:
        response = supabase.table(VENDORS_TABLE).select("*").is_("drug_id", None).execute()
        vendors = response.data or []
        logger.info(f"Found {len(vendors)} Supabase vendors with missing drug_id (NULL).")
        return vendors
    except Exception as e:
        logger.error(f"Error fetching Supabase vendors: {e}")
        return []

def fetch_local_vendor_by_name(vendor_name: str):
    """
    Given a vendor name, query the local SQLite database to fetch the vendor record.
    Assumes the local vendors table has columns: name and drug_id.
    """
    try:
        conn = sqlite3.connect(SQLITE_DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM vendors WHERE lower(name) = lower(?)", (vendor_name,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return dict(row)
        else:
            logger.warning(f"No local vendor found for name: {vendor_name}")
            return None
    except Exception as e:
        logger.error(f"Error fetching local vendor for name '{vendor_name}': {e}")
        return None

def update_supabase_vendor_drug_id(supabase_vendor_id, correct_drug_id):
    """
    Update the vendor record in Supabase with the correct drug_id.
    """
    try:
        response = supabase.table(VENDORS_TABLE).update({"drug_id": correct_drug_id}).eq("id", supabase_vendor_id).execute()
        logger.info(f"Updated Supabase vendor id {supabase_vendor_id} with drug_id {correct_drug_id}.")
    except Exception as e:
        logger.error(f"Error updating Supabase vendor id {supabase_vendor_id}: {e}")

def main():
    supa_vendors = fetch_supabase_vendors_missing_drug_id()
    if not supa_vendors:
        logger.info("No Supabase vendors with missing drug_id found.")
        return

    for vendor in supa_vendors:
        vendor_name = vendor.get("name")
        if not vendor_name:
            logger.warning("Found a Supabase vendor without a name; skipping.")
            continue

        logger.info(f"Processing vendor: {vendor_name}")
        local_vendor = fetch_local_vendor_by_name(vendor_name)
        if local_vendor and local_vendor.get("drug_id"):
            correct_drug_id = local_vendor.get("drug_id")
            supa_vendor_id = vendor.get("id")
            update_supabase_vendor_drug_id(supa_vendor_id, correct_drug_id)
        else:
            logger.warning(f"Could not determine correct drug_id for vendor: {vendor_name}")

if __name__ == "__main__":
    main()