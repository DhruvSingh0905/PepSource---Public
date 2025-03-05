#!/usr/bin/env python3
import os
import sqlite3
import json
import time
import logging
import random
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Initialize OpenAI client using the environment variable
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"
BATCH_FILE = "DB/Batch_requests/batch_input_product_form_classification.jsonl"
OUTPUT_FILE = "DB/Batch_requests/batch_output_product_form_classification.jsonl"
MODEL = "gpt-4o-mini"  # Use a smaller model since this is a simple classification task
MAX_TOKENS = 50  # Small number of tokens needed for classification
MAX_REQUESTS = 50000
MAX_FILE_SIZE_MB = 100
BATCH_SIZE = 100  # Process vendors in batches

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("product_form_classifier")

# --------------------------------------------------
# DATABASE FUNCTIONS
# --------------------------------------------------
def ensure_form_column_exists():
    """
    Ensures that the 'form' column exists in the Vendors table.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get existing columns in the Vendors table
    cursor.execute("PRAGMA table_info(Vendors)")
    columns = [info[1] for info in cursor.fetchall()]
    
    # Add 'form' column if it doesn't already exist
    if 'form' not in columns:
        try:
            cursor.execute("ALTER TABLE Vendors ADD COLUMN form TEXT DEFAULT NULL")
            logger.info("Added column 'form' to Vendors table")
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error adding column 'form': {e}")
    else:
        logger.info("Column 'form' already exists in Vendors table")
    
    conn.close()

def get_all_vendors():
    """
    Retrieves all vendors from the Vendors table that don't have a form assigned yet.
    Returns a list of tuples: (id, name, product_name, size, drug_id).
    Also includes drug_id to help with classification based on the compound.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT v.id, v.name, v.product_name, v.size, v.drug_id, d.name as drug_name
        FROM Vendors v
        LEFT JOIN Drugs d ON v.drug_id = d.id
        WHERE v.form IS NULL
        ORDER BY v.id
    """)
    vendors = cursor.fetchall()
    conn.close()
    logger.info(f"Found {len(vendors)} vendors without form classification in the database.")
    return vendors

# --------------------------------------------------
# PROMPT CREATION FUNCTIONS
# --------------------------------------------------
def build_classification_prompt(vendor_name, product_name, size, drug_id, drug_name):
    """
    Constructs a prompt for OpenAI to classify the product form.
    Includes drug information if available to help with classification.
    """
    prompt = f"""
Classify the following product based on its form (how it's administered):
- Vendor: {vendor_name}
- Product Name: {product_name}
- Size/Format: {size}
- Drug/Compound: {drug_name or "Unknown"}

Classification rules:
1. If it's a peptide, GH secretagogue, SARM, or similar substance that usually needs to be injected, classify as "injection"
2. If it's a capsule, tablet, pill, or oral solution, classify as "oral"
3. If it has "spray", "nasal", or "inhaler" in the name, classify as "spray"
4. If it's from Peptide Sciences, it might be a Topical Solution, so keep it in mind. Label it as Topical.

If the form isn't immediately obvious from the product name or size, use your knowledge of the compound to make your best guess. 
For example:
- Most peptides (BPC-157, TB-500, etc.) are typically "injection"
- Most SARMs (Ostarine, Ligandrol, etc.) are typically "oral"
- Melanotan products can be "injection" or "spray" depending on format
- Most nootropics are typically "oral"

Reply with only one word: "oral", "injection", or "spray".
""".strip()
    
    return prompt

# --------------------------------------------------
# BATCH REQUEST CREATION
# --------------------------------------------------
def create_batch_requests(vendors_batch):
    """
    Creates a JSONL batch file containing requests for each vendor.
    Each request instructs the model to classify the product form.
    """
    if not vendors_batch:
        logger.error("No vendors to process.")
        return False

    tasks = []
    for vendor in vendors_batch:
        vendor_id, vendor_name, product_name, size, drug_id, drug_name = vendor
        
        # Skip if we don't have proper information
        if not product_name:
            logger.info(f"Incomplete information for vendor ID {vendor_id}. Skipping.")
            continue
            
        prompt = build_classification_prompt(vendor_name, product_name, size, drug_id, drug_name)
        custom_id = f"vendor{vendor_id}_form"
        
        logger.info(f"Creating batch request for vendor ID {vendor_id}.")
        request_obj = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant that classifies pharmaceutical and research products based on their administration form, using your knowledge of compounds when necessary."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": MAX_TOKENS,
                "temperature": 0.1  # Slight randomness for complex cases
            }
        }
        tasks.append(request_obj)
    
    total_requests = len(tasks)
    logger.info(f"Total batch requests to create: {total_requests}")
    
    try:
        with open(BATCH_FILE, "w", encoding="utf-8") as f:
            for task in tasks:
                json_line = json.dumps(task)
                f.write(json_line + "\n")
        logger.info(f"Batch file '{BATCH_FILE}' created with {total_requests} requests.")
        return True
    except Exception as e:
        logger.error(f"Error writing batch file: {e}")
        return False

# --------------------------------------------------
# OPENAI BATCH JOB FUNCTIONS
# --------------------------------------------------
def validate_batch_file(file_path: str):
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    with open(file_path, "r") as f:
        lines = f.readlines()
        line_count = len(lines)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise Exception(f"Batch file size {file_size_mb:.2f} MB exceeds maximum allowed {MAX_FILE_SIZE_MB} MB.")
    if line_count > MAX_REQUESTS:
        raise Exception(f"Batch file has {line_count} requests, exceeding limit of {MAX_REQUESTS}.")
    logger.info(f"Batch file '{file_path}' is valid with {line_count} requests and {file_size_mb:.2f} MB.")
    return line_count

def upload_batch_file(file_path: str):
    logger.info("Uploading batch file...")
    with open(file_path, "rb") as f:
        batch_file = client.files.create(
            file=f,
            purpose="batch"
        )
    logger.info(f"Batch file uploaded. File ID: {batch_file.id}")
    return batch_file.id

def create_batch_job(input_file_id: str):
    logger.info("Creating batch job...")
    batch_job = client.batches.create(
        input_file_id=input_file_id,
        endpoint="/v1/chat/completions",
        completion_window="24h"
    )
    logger.info(f"Batch job created. Job ID: {batch_job.id}, status: {batch_job.status}")
    return batch_job.id

def poll_batch_status(batch_job_id: str, poll_interval: int = 10, timeout: int = 360000000):
    logger.info("Polling batch job status...")
    elapsed = 0
    while elapsed < timeout:
        current_job = client.batches.retrieve(batch_job_id)
        status = current_job.status
        logger.info(f"Batch job status: {status}")
        if status in ["completed", "failed", "expired"]:
            return current_job
        time.sleep(poll_interval)
        elapsed += poll_interval
    raise Exception("Batch job polling timed out.")

def retrieve_results(batch_job):
    if batch_job.status == "completed" and batch_job.output_file_id:
        logger.info("Batch job completed. Retrieving results...")
        result_content = client.files.content(batch_job.output_file_id).content
        with open(OUTPUT_FILE, "wb") as f:
            f.write(result_content)
        logger.info(f"Results saved to '{OUTPUT_FILE}'")
        return True
    else:
        logger.error(f"Batch job did not complete successfully. Status: {batch_job.status}")
        if hasattr(batch_job, "error_file_id") and batch_job.error_file_id:
            logger.error("An error file is available for review.")
        return False

# --------------------------------------------------
# PARSE RESPONSE CONTENT AND UPDATE LOCAL DB
# --------------------------------------------------
def process_batch_results():
    """
    Reads the batch results JSONL file, parses each line to extract the GPT response,
    and updates the corresponding rows in the Vendors table.
    """
    if not os.path.exists(OUTPUT_FILE):
        logger.error(f"Result file '{OUTPUT_FILE}' does not exist.")
        return 0

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()

    processed_count = 0
    for line in lines:
        try:
            result = json.loads(line.strip())
            custom_id = result.get("custom_id", "")
            
            # Parse the custom_id to get vendor_id
            # Format: vendor{vendor_id}_form
            if not custom_id.startswith("vendor") or not custom_id.endswith("_form"):
                logger.warning(f"Custom ID {custom_id} does not match expected format. Skipping.")
                continue
                
            # Extract the vendor ID part
            vendor_id_str = custom_id.replace("vendor", "").replace("_form", "")
            
            try:
                vendor_id = int(vendor_id_str)
            except ValueError:
                logger.warning(f"Could not parse vendor ID from {vendor_id_str}. Skipping.")
                continue
                
            response = result.get("response", {})
            if response.get("status_code") != 200:
                logger.warning(f"Request {custom_id} returned status {response.get('status_code')}. Skipping.")
                continue

            body = response.get("body", {})
            choices = body.get("choices", [])
            if not choices or not choices[0].get("message"):
                logger.warning(f"No message found in response for {custom_id}. Skipping.")
                continue

            content = choices[0]["message"]["content"].strip().lower()
            
            # Normalize the classification
            if "oral" in content:
                form = "oral"
            elif "inject" in content:
                form = "injection"
            elif "spray" in content:
                form = "spray"
            else:
                logger.warning(f"Invalid classification '{content}' for vendor ID {vendor_id}. Using 'oral' as default.")
                form = "oral"  # Default to oral if the classification is unclear
            
            # Update the vendor record with the form classification
            update_vendor_form(vendor_id, form)
            processed_count += 1
            
        except Exception as e:
            logger.error(f"Error processing line: {e}")
            logger.error(f"Problematic line: {line[:200]}...")

    logger.info(f"Finished processing batch results. Updated form classification for {processed_count} vendors.")
    return processed_count

def update_vendor_form(vendor_id, form):
    """
    Updates the vendor record with the form classification.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        # Update the vendor record
        cursor.execute("UPDATE Vendors SET form = ?, in_supabase = 0 WHERE id = ?", 
                      (form, vendor_id))
        
        if cursor.rowcount > 0:
            logger.info(f"Updated vendor ID {vendor_id} with form classification: {form}")
        else:
            logger.warning(f"No vendor found with ID {vendor_id} or no update was needed")
        
        conn.commit()
    except sqlite3.Error as e:
        logger.error(f"Error updating vendor ID {vendor_id} with form classification: {e}")
        conn.rollback()
    finally:
        conn.close()

# --------------------------------------------------
# UPLOAD UPDATED VENDORS TO SUPABASE
# --------------------------------------------------
def upsert_vendors_to_supabase():
    """
    Retrieves vendors from the local DB that have been updated with form classification,
    and upserts them to Supabase.
    """
    from supabase import create_client
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase credentials are not set.")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Find vendors that have been updated with form classification
    cursor.execute("""
        SELECT * FROM Vendors
        WHERE form IS NOT NULL AND in_supabase = 0
    """)
    vendors = [dict(row) for row in cursor.fetchall()]
    
    if not vendors:
        logger.info("No vendors with updated form classification to upsert to Supabase.")
        return 0
    
    try:
        # Prepare vendors for upsert - set all to have in_supabase = true
        for vendor in vendors:
            vendor["in_supabase"] = True
        
        # Upsert to Supabase in batches to avoid payload size issues
        batch_size = 100
        total_upserted = 0
        
        for i in range(0, len(vendors), batch_size):
            batch = vendors[i:i+batch_size]
            try:
                supabase.table("vendors").upsert(batch, on_conflict="id").execute()
                total_upserted += len(batch)
                logger.info(f"Upserted batch {i//batch_size + 1}: {len(batch)} vendors")
            except Exception as e:
                logger.error(f"Error upserting batch {i//batch_size + 1}: {e}")
        
        # Mark vendors as upserted in local DB
        vendor_ids = [vendor["id"] for vendor in vendors]
        placeholders = ",".join(["?"] * len(vendor_ids))
        cursor.execute(f"UPDATE Vendors SET in_supabase = 1 WHERE id IN ({placeholders})", vendor_ids)
        conn.commit()
        
        logger.info(f"Upserted {total_upserted} vendors with form classification to Supabase")
        return total_upserted
    except Exception as e:
        logger.error(f"Error upserting vendors to Supabase: {e}")
        conn.rollback()
        return 0
    finally:
        conn.close()

# --------------------------------------------------
# PROCESS BATCH OF VENDORS
# --------------------------------------------------
def process_vendor_batch(vendors_batch):
    """
    Process a batch of vendors through the entire pipeline.
    """
    try:
        # Step 1: Create the batch file for form classification
        if not create_batch_requests(vendors_batch):
            return 0
            
        validate_batch_file(BATCH_FILE)
        
        # Step 2: Upload the batch file to OpenAI and create a batch job
        input_file_id = upload_batch_file(BATCH_FILE)
        batch_job_id = create_batch_job(input_file_id)
        
        # Step 3: Poll for batch job completion
        final_job = poll_batch_status(batch_job_id)
        
        # Step 4: Retrieve batch job results
        if not retrieve_results(final_job):
            return 0
        
        # Step 5: Process the results and update the Vendors table
        return process_batch_results()
        
    except Exception as e:
        logger.error(f"Error processing vendor batch: {e}")
        return 0

# --------------------------------------------------
# MAIN PROCESS
# --------------------------------------------------
def main():
    try:
        # Ensure the form column exists in the Vendors table
        ensure_form_column_exists()
        
        # Get all vendors without form classification
        all_vendors = get_all_vendors()
        if not all_vendors:
            logger.info("No vendors need form classification. Exiting.")
            return
        
        total_processed = 0
        
        # Process vendors in batches
        for i in range(0, len(all_vendors), BATCH_SIZE):
            batch = all_vendors[i:i+BATCH_SIZE]
            logger.info(f"Processing batch {i//BATCH_SIZE + 1} of {(len(all_vendors)-1)//BATCH_SIZE + 1} ({len(batch)} vendors)")
            processed = process_vendor_batch(batch)
            total_processed += processed
            logger.info(f"Batch {i//BATCH_SIZE + 1} complete. Processed {processed} vendors in this batch.")
            
            # Add a short delay between batches
            if i + BATCH_SIZE < len(all_vendors):
                delay = random.uniform(5, 10)
                logger.info(f"Waiting {delay:.2f} seconds before processing next batch...")
                time.sleep(delay)
        
        # Upsert all updated vendors to Supabase
        total_upserted = upsert_vendors_to_supabase()
        
        logger.info(f"All operations completed successfully! Total processed: {total_processed}, Total upserted: {total_upserted}")
        
    except Exception as e:
        logger.error(f"Error during processing: {e}")

if __name__ == "__main__":
    main()