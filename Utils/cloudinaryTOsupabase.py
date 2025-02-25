#!/usr/bin/env python3
import os
import sqlite3
import logging
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("update_vendor_images_supabase")

# Local SQLite database file
DB_FILE = "DB/pepsources.db"

# Supabase credentials from environment variables
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise Exception("Supabase credentials are not set in the environment.")

# Create Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_local_vendor_image(vendor_id: int) -> str:
    """
    Retrieve the local cloudinary_product_image from the Vendors table for a given vendor_id.
    Returns the image URL (string) or an empty string if not found.
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT cloudinary_product_image FROM Vendors WHERE id = ?", (vendor_id,))
    row = cursor.fetchone()
    conn.close()
    if row and row["cloudinary_product_image"]:
        return row["cloudinary_product_image"]
    return ""

def update_vendor_in_supabase(vendor_id: int, image_url: str):
    """
    Update the vendor row in Supabase (matched by vendor id) with the given image URL,
    and set the in_supabase flag to 1.
    """
    update_data = {"cloudinary_product_image": image_url, "in_supabase": 1}
    response = supabase.table("vendors").update(update_data).eq("id", vendor_id).execute()
    
    # Check if response.data exists and is non-empty.
    if not response.data:
        logger.error(f"Error updating vendor {vendor_id} in Supabase: {response}")
    else:
        logger.info(f"Vendor {vendor_id} updated in Supabase with image URL: {image_url}")

def update_missing_vendor_images():
    """
    Queries Supabase for vendor rows where cloudinary_product_image is null or empty,
    then updates each with the corresponding local image URL from the SQLite database.
    """
    # Using Supabase PostgREST syntax, filter rows where cloudinary_product_image is null or equal to empty string.
    response = supabase.table("vendors").select("*").or_("cloudinary_product_image.is.null,cloudinary_product_image.eq.").execute()
    
    if not response.data:
        logger.error("No data returned when fetching vendors from Supabase.")
        return

    vendors = response.data
    logger.info(f"Found {len(vendors)} vendor rows in Supabase with missing Cloudinary image references.")

    for vendor in vendors:
        vendor_id = vendor.get("id")
        local_image = get_local_vendor_image(vendor_id)
        if local_image:
            logger.info(f"Updating vendor {vendor_id} with local image: {local_image}")
            update_vendor_in_supabase(vendor_id, local_image)
        else:
            logger.info(f"No local image found for vendor {vendor_id}; skipping update.")

if __name__ == "__main__":
    update_missing_vendor_images()