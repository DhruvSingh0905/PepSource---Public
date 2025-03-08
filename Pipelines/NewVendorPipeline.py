#!/usr/bin/env python3
import os
import re
import random
import time
import json
import logging
import sqlite3
import difflib
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains

from bs4 import BeautifulSoup
from fake_useragent import UserAgent
from openai import OpenAI
from dotenv import load_dotenv
import cloudinary
import cloudinary.uploader
# Add these new configurations to the CONFIGURATION section
FORM_BATCH_FILE = "DB/Batch_requests/form_batch_input.jsonl"
DOSAGE_BATCH_FILE = "DB/Batch_requests/dosage_batch_input.jsonl"
FORM_OUTPUT_FILE = "DB/Batch_requests/form_batch_output.jsonl"
DOSAGE_OUTPUT_FILE = "DB/Batch_requests/dosage_batch_output.jsonl"
FORM_MODEL = "gpt-4o-mini"
DOSAGE_MODEL = "gpt-4o"
FORM_MAX_TOKENS = 50
DOSAGE_MAX_TOKENS = 1000
BODY_TYPES = ["obese", "skinny_with_little_muscle", "muscular"]

# Add these functions to classify product forms

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

def build_form_classification_prompt(vendor_name, product_name, size, drug_name):
    """
    Constructs a prompt for OpenAI to classify the product form.
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

If the form isn't immediately obvious from the product name or size, use your knowledge of the compound to make your best guess. 
For example:
- Most peptides (BPC-157, TB-500, etc.) are typically "injection"
- Most SARMs (Ostarine, Ligandrol, etc.) are typically "oral"
- Melanotan products can be "injection" or "spray" depending on format
- Most nootropics are typically "oral"

Reply with only one word: "oral", "injection", or "spray".
""".strip()
    
    return prompt

def create_form_batch_requests():
    """
    Creates a JSONL batch file containing requests for each vendor.
    Each request instructs the model to classify the product form.
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("""
        SELECT v.id, v.name, v.product_name, v.size, d.name as drug_name
        FROM Vendors v
        LEFT JOIN Drugs d ON v.drug_id = d.id
        WHERE v.form IS NULL
        ORDER BY v.id
    """)
    vendors = cursor.fetchall()
    conn.close()
    
    logger.info(f"Found {len(vendors)} vendors without form classification in the database.")
    
    if not vendors:
        logger.info("No vendors need form classification. Skipping batch creation.")
        return None

    tasks = []
    for vendor in vendors:
        # Skip if we don't have proper information
        if not vendor["product_name"]:
            logger.info(f"Incomplete information for vendor ID {vendor['id']}. Skipping.")
            continue
            
        prompt = build_form_classification_prompt(
            vendor["name"], 
            vendor["product_name"], 
            vendor["size"],
            vendor["drug_name"]
        )
        custom_id = f"vendor{vendor['id']}_form"
        
        logger.info(f"Creating batch request for vendor ID {vendor['id']} - {vendor['product_name']}.")
        request_obj = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": FORM_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant that classifies pharmaceutical and research products based on their administration form, using your knowledge of compounds when necessary."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": FORM_MAX_TOKENS,
                "temperature": 0.1  # Slight randomness for complex cases
            }
        }
        tasks.append(request_obj)
    
    total_requests = len(tasks)
    logger.info(f"Total form classification batch requests to create: {total_requests}")
    
    try:
        with open(FORM_BATCH_FILE, "w", encoding="utf-8") as f:
            for task in tasks:
                json_line = json.dumps(task)
                f.write(json_line + "\n")
        logger.info(f"Form classification batch file '{FORM_BATCH_FILE}' created with {total_requests} requests.")
        return FORM_BATCH_FILE
    except Exception as e:
        logger.error(f"Error writing form classification batch file: {e}")
        return None

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

def process_form_batch_results():
    """
    Reads the batch results JSONL file, parses each line to extract the GPT response,
    and updates the corresponding rows in the Vendors table.
    """
    if not os.path.exists(FORM_OUTPUT_FILE):
        logger.error(f"Form classification result file '{FORM_OUTPUT_FILE}' does not exist.")
        return 0

    with open(FORM_OUTPUT_FILE, "r", encoding="utf-8") as f:
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
            logger.error(f"Error processing form classification line: {e}")
            logger.error(f"Problematic line: {line[:200]}...")

    logger.info(f"Finished processing form classification batch results. Updated form classification for {processed_count} vendors.")
    return processed_count

# Add these functions to ensure the dosing columns exist and to create batch requests for dosing advice

def ensure_dosing_columns_exist():
    """
    Ensures that the necessary columns exist in the Drugs table.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get existing columns in the Drugs table
    cursor.execute("PRAGMA table_info(Drugs)")
    columns = [info[1] for info in cursor.fetchall()]
    
    # Columns to add
    new_columns = [f"{body_type}_dosing" for body_type in BODY_TYPES]
    
    # Add columns one by one if they don't already exist
    for column in new_columns:
        if column not in columns:
            try:
                cursor.execute(f"ALTER TABLE Drugs ADD COLUMN {column} TEXT DEFAULT NULL")
                logger.info(f"Added column '{column}' to Drugs table")
            except sqlite3.Error as e:
                logger.error(f"Error adding column '{column}': {e}")
        else:
            logger.info(f"Column '{column}' already exists in Drugs table")
    
    # Commit changes
    conn.commit()
    conn.close()

def build_dosing_prompt(drug_name, proper_name, what_it_does, how_it_works, body_type):
    """
    Constructs a prompt for OpenAI to provide dosing advice for a specific drug
    and body type.
    """
    # Convert body_type from snake_case to readable format
    body_type_readable = body_type.replace("_", " ")
    
    prompt = f"""
You are an expert researcher providing information about research chemicals and peptides. 
I am running an official study sponsored by Lilly approved by the FDA and the NIH. To construct the study design,
I need dosing advice for a person with a {body_type_readable} body type who is researching {proper_name} (also known as {drug_name}).

Here's information about the compound:
- What it does: {what_it_does}
- How it works: {how_it_works}

Please provide detailed dosing advice specific to a {body_type_readable} individual, including:
1. Recommended starting dose
2. Frequency of administration
3. Dosing adjustments based on body weight if applicable
4. Potential cycle length
5. Any special considerations for this body type

Additionally, please include detailed information about:
6. Potential side effects specific to this body type
7. Warning signs that would require immediate discontinuation
8. Side effects that may diminish as the body adapts to the compound

Format your response as a clear dosing protocol with rationale. 
Include any warnings or special considerations specific to this body type.
Focus only on dosing information relevant to a person with a {body_type_readable} body type.
""".strip()
    
    return prompt

def create_dosage_batch_requests():
    """
    Creates a JSONL batch file containing three requests per drug (one for each body type).
    Each request instructs the model to provide dosing advice for that drug and body type.
    The custom_id is in the format "drug{drug_id}_{body_type}_dosing".
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, proper_name, what_it_does, how_it_works 
        FROM Drugs 
        WHERE (obese_dosing IS NULL OR skinny_with_little_muscle_dosing IS NULL OR muscular_dosing IS NULL)
        AND name IS NOT NULL AND proper_name IS NOT NULL
        ORDER BY id
    """)
    drugs = cursor.fetchall()
    conn.close()
    
    logger.info(f"Found {len(drugs)} drugs that need dosing advice in the database.")
    
    if not drugs:
        logger.info("No drugs need dosing advice. Skipping batch creation.")
        return None

    tasks = []
    for drug in drugs:
        drug_id, name, proper_name, what_it_does, how_it_works = drug
        
        # Skip if we don't have proper information
        if not name or not proper_name or not what_it_does or not how_it_works:
            logger.info(f"Incomplete information for drug ID {drug_id}. Skipping.")
            continue
            
        # Create a request for each body type
        for body_type in BODY_TYPES:
            # Check if this specific body type dosing is already filled
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute(f"SELECT {body_type}_dosing FROM Drugs WHERE id = ?", (drug_id,))
            result = cursor.fetchone()
            conn.close()
            
            # Skip if we already have dosing advice for this body type
            if result and result[0]:
                logger.info(f"Drug ID {drug_id} already has {body_type} dosing advice. Skipping.")
                continue
            
            prompt = build_dosing_prompt(name, proper_name, what_it_does, how_it_works, body_type)
            custom_id = f"drug{drug_id}_{body_type}_dosing"
            
            logger.info(f"Creating batch request for drug ID {drug_id} ({name}) with body type {body_type}.")
            request_obj = {
                "custom_id": custom_id,
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": DOSAGE_MODEL,
                    "messages": [
                        {"role": "system", "content": "You are a helpful research assistant providing concise, accurate information about research chemicals and peptides for research purposes only."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": DOSAGE_MAX_TOKENS,
                    "temperature": 0.2  # Slightly increase variation but maintain consistency
                }
            }
            tasks.append(request_obj)
    
    total_requests = len(tasks)
    logger.info(f"Total dosage advice batch requests to create: {total_requests}")
    
    if total_requests == 0:
        logger.info("No dosage advice batch requests to create. Skipping.")
        return None
    
    try:
        with open(DOSAGE_BATCH_FILE, "w", encoding="utf-8") as f:
            for task in tasks:
                json_line = json.dumps(task)
                f.write(json_line + "\n")
        logger.info(f"Dosage advice batch file '{DOSAGE_BATCH_FILE}' created with {total_requests} requests.")
        return DOSAGE_BATCH_FILE
    except Exception as e:
        logger.error(f"Error writing dosage advice batch file: {e}")
        return None

def update_drug_dosing(drug_id, body_type, dosing_advice):
    """
    Updates the drug record with the dosing advice in the appropriate column.
    """
    column_name = f"{body_type}_dosing"
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    try:
        # Update the drug record
        cursor.execute(f"UPDATE Drugs SET {column_name} = ?, in_supabase = 0 WHERE id = ?", 
                      (dosing_advice, drug_id))
        
        if cursor.rowcount > 0:
            logger.info(f"Updated drug ID {drug_id} with {body_type} dosing advice")
        else:
            logger.warning(f"No drug found with ID {drug_id} or no update was needed")
        
        conn.commit()
    except sqlite3.Error as e:
        logger.error(f"Error updating drug ID {drug_id} with {body_type} dosing advice: {e}")
        conn.rollback()
    finally:
        conn.close()

def process_dosage_batch_results():
    """
    Reads the batch results JSONL file, parses each line to extract the GPT response,
    and updates the corresponding columns in the Drugs table.
    """
    if not os.path.exists(DOSAGE_OUTPUT_FILE):
        logger.error(f"Dosage advice result file '{DOSAGE_OUTPUT_FILE}' does not exist.")
        return 0

    with open(DOSAGE_OUTPUT_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()

    processed_count = 0
    for line in lines:
        try:
            result = json.loads(line.strip())
            custom_id = result.get("custom_id", "")
            
            # Parse the custom_id to get drug_id and body_type
            # Format: drug{drug_id}_{body_type}_dosing
            if not custom_id.startswith("drug") or "_dosing" not in custom_id:
                logger.warning(f"Custom ID {custom_id} does not match expected format. Skipping.")
                continue
                
            # Extract the drug ID part
            drug_id_str = custom_id.split("_")[0].replace("drug", "")
            
            # Extract the body_type part - handle the special case for "skinny_with_little_muscle"
            if "skinny_with_little_muscle" in custom_id:
                body_type = "skinny_with_little_muscle"
            elif "muscular" in custom_id:
                body_type = "muscular"
            elif "obese" in custom_id:
                body_type = "obese"
            else:
                logger.warning(f"Could not determine body type from custom_id: {custom_id}. Skipping.")
                continue
            
            try:
                drug_id = int(drug_id_str)
            except ValueError:
                logger.warning(f"Could not parse drug ID from {drug_id_str}. Skipping.")
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

            content = choices[0]["message"]["content"]
            
            # Update the drug record with the dosing advice
            update_drug_dosing(drug_id, body_type, content)
            processed_count += 1
            
        except Exception as e:
            logger.error(f"Error processing dosage advice line: {e}")
            logger.error(f"Problematic line: {line[:200]}...")

    logger.info(f"Finished processing dosage advice batch results. Updated dosing advice for {processed_count} drug/body type combinations.")
    return processed_count

# Add functions to run the form and dosage batch processes

def run_form_classification_batch():
    """
    Run the complete form classification batch process.
    """
    try:
        # Ensure the form column exists
        ensure_form_column_exists()
        
        # Create the batch file for form classification
        batch_file = create_form_batch_requests()
        if not batch_file:
            logger.info("No form classification batch file created. Skipping process.")
            return 0
            
        # Validate and process the batch
        validate_batch_file(batch_file)
        input_file_id = upload_batch_file(batch_file)
        batch_job_id = create_batch_job(input_file_id, FORM_MODEL, FORM_MAX_TOKENS)
        final_job = poll_batch_status(batch_job_id)
        retrieve_results(final_job, FORM_OUTPUT_FILE)
        
        # Process the results
        processed_count = process_form_batch_results()
        logger.info(f"Form classification batch process completed. Processed {processed_count} vendors.")
        return processed_count
    except Exception as e:
        logger.error(f"Error during form classification batch process: {e}")
        return 0

def run_dosage_advice_batch():
    """
    Run the complete dosage advice batch process.
    """
    try:
        # Ensure the dosing columns exist
        ensure_dosing_columns_exist()
        
        # Create the batch file for dosing advice
        batch_file = create_dosage_batch_requests()
        if not batch_file:
            logger.info("No dosage advice batch file created. Skipping process.")
            return 0
            
        # Validate and process the batch
        validate_batch_file(batch_file)
        input_file_id = upload_batch_file(batch_file)
        batch_job_id = create_batch_job(input_file_id, DOSAGE_MODEL, DOSAGE_MAX_TOKENS)
        final_job = poll_batch_status(batch_job_id)
        retrieve_results(final_job, DOSAGE_OUTPUT_FILE)
        
        # Process the results
        processed_count = process_dosage_batch_results()
        logger.info(f"Dosage advice batch process completed. Processed {processed_count} drug/body type combinations.")
        return processed_count
    except Exception as e:
        logger.error(f"Error during dosage advice batch process: {e}")
        return 0

# Modify the main_batch_pipeline function to include the new batch processes



# ---------------------------
# CONFIG & GLOBALS
# ---------------------------
MODEL = "gpt-4o"
extraction_results = []  # Global extraction fallback (if needed)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
logger = logging.getLogger("drug_vendor_pipeline")

FAILURES_LOG = "failures.log"
DB_FILE = "DB/pepsources.db"
FALLBACK_FILE = "fallback_extractions.json"
BASE_URL_TEMPLATE = "https://pubmed.ncbi.nlm.nih.gov/?term={term}"


# Batch file paths for each stage
RELEVANCE_BATCH_FILE = "DB/Batch_requests/relevance_batch_input.jsonl"
SUMMARIZATION_BATCH_FILE = "DB/Batch_requests/summarization_batch_input.jsonl"
ORDER_BATCH_FILE = "DB/Batch_requests/order_batch_input.jsonl"

# Output file paths (results)
RELEVANCE_OUTPUT_FILE = "DB/Batch_requests/relevance_batch_output.jsonl"
SUMMARIZATION_OUTPUT_FILE = "DB/Batch_requests/summarization_batch_output.jsonl"
ORDER_OUTPUT_FILE = "DB/Batch_requests/order_batch_output.jsonl"

# Model and tokens settings for each stage
RELEVANCE_MODEL = "gpt-4o-mini"
SUMMARIZATION_MODEL = "gpt-4o"
ORDER_MODEL = "gpt-4o-mini"
RELEVANCE_MAX_TOKENS = 10
SUMMARIZATION_MAX_TOKENS = 1000
ORDER_MAX_TOKENS = 300
MAX_REQUESTS = 50000
MAX_FILE_SIZE_MB = 100


# ---------------------------
# LOAD ENVIRONMENT VARIABLES & SETUP CLIENTS
# ---------------------------
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")
cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET
)

# ---------------------------
# DATABASE INITIALIZATION
# ---------------------------
def init_db():
    conn = sqlite3.connect(DB_FILE)
    conn.close()
    logger.info("Database schema verified.")

def ensure_drugs_table_has_last_checked():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(Drugs)")
    columns = [row[1].lower() for row in cursor.fetchall()]
    if "last_checked" not in columns:
        cursor.execute("ALTER TABLE Drugs ADD COLUMN last_checked TEXT")
        conn.commit()
        logger.info("Added 'last_checked' column to Drugs table.")
    conn.close()


# --------------------------------------------------
# OPENAI BATCH JOB HELPER FUNCTIONS
# --------------------------------------------------
def validate_batch_file(file_path: str):
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    with open(file_path, 'r') as file:
        lines = file.readlines()
        line_count = len(lines)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise Exception(f"Batch file size {file_size_mb:.2f} MB exceeds maximum allowed {MAX_FILE_SIZE_MB} MB.")
    if line_count > MAX_REQUESTS:
        raise Exception(f"Batch file has {line_count} requests, exceeding limit of {MAX_REQUESTS}.")
    logger.info(f"Batch file '{file_path}' is valid with {line_count} requests and {file_size_mb:.2f} MB.")
    return line_count

def upload_batch_file(file_path: str) -> str:
    logger.info("Uploading batch file...")
    with open(file_path, "rb") as f:
        batch_file = client.files.create(
            file=f,
            purpose="batch"
        )
    logger.info(f"Batch file uploaded. File ID: {batch_file.id}")
    return batch_file.id

def create_batch_job(input_file_id: str, model: str, max_tokens: int) -> str:
    logger.info("Creating batch job...")
    batch_job = client.batches.create(
        input_file_id=input_file_id,
        endpoint="/v1/chat/completions",
        completion_window="24h",
        # You may pass additional parameters here if needed.
    )
    logger.info(f"Batch job created. Job ID: {batch_job.id}, status: {batch_job.status}")
    return batch_job.id

def poll_batch_status(batch_job_id: str, poll_interval: int = 10, timeout: int = 129600):
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

def retrieve_results(batch_job, output_file: str):
    if batch_job.status == "completed" and batch_job.output_file_id:
        logger.info("Batch job completed. Retrieving results...")
        result_content = client.files.content(batch_job.output_file_id).content
        with open(output_file, "wb") as f:
            f.write(result_content)
        logger.info(f"Results saved to '{output_file}'")
    else:
        logger.error(f"Batch job did not complete successfully. Status: {batch_job.status}")
        if hasattr(batch_job, "error_file_id") and batch_job.error_file_id:
            logger.error("An error file is available for review.")

# --------------------------------------------------
# PHASE 1: RELEVANCE BATCH
# --------------------------------------------------
def build_relevance_prompt(article_title: str) -> str:
    prompt = f"""
Determine if the following article title is relevant for understanding the effects of the drug.
Return only a single digit: 1 if it is relevant, or 0 if it is not.

Article Title: {article_title}

Output:""".strip()
    return prompt

def create_relevance_batch_requests():
    """
    Create a JSONL batch file that asks GPT to classify each article's relevance.
    Each request's custom_id should be in the format "article{article_id}_relevance".
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM articles")
    articles = cursor.fetchall()
    conn.close()
    tasks = []
    for article in articles:
        article_id, title = article
        prompt = build_relevance_prompt(title)
        custom_id = f"article{article_id}_relevance"
        request_obj = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": RELEVANCE_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": RELEVANCE_MAX_TOKENS,
                "temperature": 0.0
            }
        }
        tasks.append(request_obj)
    batch_file = "DB/Batch_requests/relevance_batch_input.jsonl"
    try:
        with open(batch_file, "w", encoding="utf-8") as f:
            for task in tasks:
                f.write(json.dumps(task) + "\n")
        logger.info(f"Relevance batch file '{batch_file}' created with {len(tasks)} requests.")
    except Exception as e:
        logger.error(f"Error writing relevance batch file: {e}")
    return batch_file

def parse_relevance_response(content: str) -> int:
    """
    Parse the GPT response to extract a digit (0 or 1).
    """
    match = re.search(r'\b([01])\b', content)
    if match:
        return int(match.group(1))
    else:
        raise ValueError(f"Unexpected GPT response format: {content}")

def update_article_relevance(article_id: int, is_relevant: int):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("UPDATE articles SET is_relevant = ? WHERE id = ?", (is_relevant, article_id))
        conn.commit()
        logger.info(f"Updated article {article_id} with is_relevant = {is_relevant}.")
    except Exception as e:
        logger.error(f"Error updating relevance for article {article_id}: {e}")
    finally:
        conn.close()

def process_relevance_batch_results():
    output_file = RELEVANCE_OUTPUT_FILE
    if not os.path.exists(output_file):
        logger.error(f"Relevance result file '{output_file}' does not exist.")
        return
    with open(output_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
    processed = 0
    for line in lines:
        try:
            result = json.loads(line.strip())
            custom_id = result.get("custom_id", "")
            # Expect custom_id like "article{article_id}_relevance"
            if "_relevance" not in custom_id:
                logger.warning(f"Custom ID {custom_id} not valid. Skipping.")
                continue
            article_id = int(custom_id.replace("article", "").replace("_relevance", ""))
            response = result.get("response", {})
            if response.get("status_code") != 200:
                logger.warning(f"Request {custom_id} returned status {response.get('status_code')}. Skipping.")
                continue
            body = response.get("body", {})
            choices = body.get("choices", [])
            if not choices or not choices[0].get("message"):
                logger.warning(f"No message found for {custom_id}. Skipping.")
                continue
            content = choices[0]["message"]["content"]
            relevance = parse_relevance_response(content)
            update_article_relevance(article_id, relevance)
            processed += 1
        except Exception as e:
            logger.error(f"Error processing line in relevance batch: {e}")
    logger.info(f"Processed relevance batch results for {processed} articles.")

# --------------------------------------------------
# PHASE 2: SUMMARIZATION BATCH (for relevant articles)
# --------------------------------------------------
def build_summarization_prompt(title, background, methods, conclusions):
    methods_text = methods.strip() if methods.strip() else "Not provided."
    conclusions_text = conclusions.strip() if conclusions.strip() else "Not provided."
    prompt = f"""Rewrite the following study summary in a detailed and easy-to-understand manner.
Include key figures and definitions for 2–3 key terms.

Follow this exact format:

**ai_heading:** (1-2 sentence summary)
**ai_background:** (detailed background)
**ai_conclusion:** (one-sentence conclusion)
**key_terms:** (list key terms with definitions)

Title: {title}
Background: {background}
Methods: {methods_text}
Conclusions: {conclusions_text}"""
    return prompt

def create_summarization_batch_requests():
    """
    Create a batch file for summarizing articles that are marked as relevant.
    Only include articles where is_relevant == 1.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title, background, methods, conclusions FROM articles WHERE is_relevant = 1")
    articles = cursor.fetchall()
    conn.close()
    tasks = []
    for article in articles:
        article_id, title, background, methods, conclusions = article
        prompt = build_summarization_prompt(title, background, methods, conclusions)
        custom_id = f"article{article_id}_summarization"
        request_obj = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": SUMMARIZATION_MODEL,
                "messages": [
                    {"role": "system", "content": "You are an assistant that creates plain-language summaries of research articles."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": SUMMARIZATION_MAX_TOKENS,
                "temperature": 0.0
            }
        }
        tasks.append(request_obj)
    batch_file = "DB/Batch_requests/summarization_batch_input.jsonl"
    try:
        with open(batch_file, "w", encoding="utf-8") as f:
            for task in tasks:
                f.write(json.dumps(task) + "\n")
        logger.info(f"Summarization batch file '{batch_file}' created with {len(tasks)} requests.")
    except Exception as e:
        logger.error(f"Error writing summarization batch file: {e}")
    return batch_file

def process_summarization_batch_results():
    output_file = "DB/Batch_requests/summarization_batch_output.jsonl"
    if not os.path.exists(output_file):
        logger.error(f"Summarization result file '{output_file}' does not exist.")
        return
    with open(output_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
    processed = 0
    for line in lines:
        try:
            result = json.loads(line.strip())
            custom_id = result.get("custom_id", "")
            if "_summarization" not in custom_id:
                logger.warning(f"Custom ID {custom_id} not valid for summarization. Skipping.")
                continue
            article_id = int(custom_id.replace("article", "").replace("_summarization", ""))
            response = result.get("response", {})
            if response.get("status_code") != 200:
                logger.warning(f"Request {custom_id} returned status {response.get('status_code')}. Skipping.")
                continue
            body = response.get("body", {})
            choices = body.get("choices", [])
            if not choices or not choices[0].get("message"):
                logger.warning(f"No message found in response for {custom_id}. Skipping.")
                continue
            content = choices[0]["message"]["content"]
            # Here, you could parse the content into its sections.
            # For simplicity, we assume the entire content is the summary (ai_heading).
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("UPDATE articles SET ai_heading = ? WHERE id = ?", (content, article_id))
            conn.commit()
            conn.close()
            processed += 1
        except Exception as e:
            logger.error(f"Error processing summarization batch line: {e}")
    logger.info(f"Processed summarization batch results for {processed} articles.")

# --------------------------------------------------
# PHASE 3: ORDERING (RANKING) BATCH
# --------------------------------------------------
def build_order_prompt(drug_name: str, proper_name: str, articles: list) -> str:
    """
    Constructs a prompt to rank article headings by relevance.
    The prompt lists each article's id and title.
    """
    article_list = "\n".join([f"{article_id}: {title}" for article_id, title, *_ in articles])
    prompt = f"""
For the research chemical "{proper_name}" (also known as "{drug_name}"), here are the article titles and their IDs:
{article_list}

Rank these articles in order of importance for a customer seeking to understand the drug's effects.
Assign a ranking order where 1 is the most important.
Return a JSON object mapping article IDs to their rank numbers (integers), with no extra text.
Output:
""".strip()
    return prompt

def create_order_batch_requests():
    """
    Create a batch file for ranking articles for each drug.
    For each drug that has articles, create one batch request with a custom_id "drug{drug_id}_order".
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, proper_name FROM Drugs")
    drugs = cursor.fetchall()
    conn.close()
    tasks = []
    for drug in drugs:
        drug_id, name, proper_name = drug
        # Get articles for this drug (you might choose to limit to those that were summarized)
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("SELECT id, title FROM articles WHERE drug_id = ?", (drug_id,))
        articles = cursor.fetchall()
        conn.close()
        if not articles:
            logger.info(f"No articles for drug ID {drug_id}. Skipping ordering batch.")
            continue
        prompt = build_order_prompt(name, proper_name, articles)
        custom_id = f"drug{drug_id}_order"
        request_obj = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": ORDER_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": ORDER_MAX_TOKENS,
                "temperature": 0.0
            }
        }
        tasks.append(request_obj)
    batch_file = "DB/Batch_requests/order_batch_input.jsonl"
    try:
        with open(batch_file, "w", encoding="utf-8") as f:
            for task in tasks:
                f.write(json.dumps(task) + "\n")
        logger.info(f"Ordering batch file '{batch_file}' created with {len(tasks)} requests.")
    except Exception as e:
        logger.error(f"Error writing ordering batch file: {e}")
    return batch_file

def parse_order_response(content: str) -> dict:
    """
    Expects a JSON object mapping article IDs (as strings) to ranking numbers.
    """
    try:
        data = json.loads(content)
        return data
    except Exception as e:
        logger.error(f"Error parsing order response: {e}")
        return {}

def update_article_order(drug_id: int, order_mapping: dict):
    """
    Updates the 'order_num' column for articles of a given drug based on the order_mapping.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        for article_id, order in order_mapping.items():
            cursor.execute("UPDATE articles SET order_num = ? WHERE id = ? AND drug_id = ?", (order, int(article_id), drug_id))
        conn.commit()
        conn.close()
        logger.info(f"Updated article order for drug ID {drug_id} with mapping: {order_mapping}")
    except Exception as e:
        logger.error(f"Error updating article order for drug ID {drug_id}: {e}")

def process_order_batch_results():
    output_file = "DB/Batch_requests/batch_job_results_order.jsonl"
    if not os.path.exists(output_file):
        logger.error(f"Order result file '{output_file}' does not exist.")
        return
    with open(output_file, "r", encoding="utf-8") as f:
        lines = f.readlines()
    processed = 0
    for line in lines:
        try:
            result = json.loads(line.strip())
            custom_id = result.get("custom_id", "")
            if "_order" not in custom_id:
                logger.warning(f"Custom ID {custom_id} not valid for ordering. Skipping.")
                continue
            drug_id = int(custom_id.replace("drug", "").replace("_order", ""))
            response = result.get("response", {})
            if response.get("status_code") != 200:
                logger.warning(f"Request {custom_id} returned status {response.get('status_code')}. Skipping.")
                continue
            body = response.get("body", {})
            choices = body.get("choices", [])
            if not choices or not choices[0].get("message"):
                logger.warning(f"No message found for {custom_id}. Skipping.")
                continue
            content = choices[0]["message"]["content"]
            order_mapping = parse_order_response(content)
            if order_mapping:
                update_article_order(drug_id, order_mapping)
                processed += 1
            else:
                logger.warning(f"Empty order mapping for drug ID {drug_id}.")
        except Exception as e:
            logger.error(f"Error processing ordering batch line: {e}")
    logger.info(f"Finished processing ordering batch results. Updated orders for {processed} drugs.")

# ---------------------------
# HELPER FUNCTIONS: OPENAI & TEXT PROCESSING
# ---------------------------
def clean_drug_name(drug_name: str) -> str:
    if not drug_name:
        return ""
    # Remove whitespace and dashes; lowercase everything.
    return re.sub(r"\s+", "", drug_name.strip().lower())

def match_existing_drug_name(extracted_name: str) -> str:
    # Handle CJC with/without DAC exception
    if re.search(r'cjc.*dac', extracted_name.lower()):
        return "cjc1295-dac"  # Lowercase result
    elif re.search(r'cjc', extracted_name.lower()) and not re.search(r'dac', extracted_name.lower()):
        return "cjc1295"  # Lowercase result
    
    # Handle enclomiphene/clomiphene exception
    if re.search(r'enclom', extracted_name.lower()):
        return "enclomiphene"  # Lowercase result
        
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM Drugs")
    rows = cursor.fetchall()
    conn.close()
    normalized_existing = {row[0]: clean_drug_name(row[0]) for row in rows}
    normalized_extracted = clean_drug_name(extracted_name)
    
    # Skip difflib matching for enclomiphene to prevent matching with clomiphene
    if "enclom" in normalized_extracted:
        logger.info(f"Enclomiphene detected, skipping fuzzy matching to avoid confusion with clomiphene")
        return "enclomiphene"  # Lowercase result
    
    matches = difflib.get_close_matches(normalized_extracted, list(normalized_existing.values()), n=1, cutoff=0.8)
    if matches:
        for original, normalized in normalized_existing.items():
            if normalized == matches[0]:
                # Make sure we don't match enclomiphene to clomiphene
                if "enclom" in normalized_extracted and "clom" in normalized and "enclom" not in normalized:
                    logger.info(f"Prevented matching enclomiphene to clomiphene")
                    return "enclomiphene"  # Lowercase result
                
                logger.info(f"Match found: extracted '{extracted_name}' matched to existing '{original}'")
                return original.lower()  # Convert original match to lowercase
    logger.info(f"No close match found for '{extracted_name}'. Using extracted name.")
    return extracted_name.lower()  # Convert extracted name to lowercase

def get_drug_name_from_title(product_name: str):
    if not product_name:
        return None, None
    prompt = f"""
Extract the drug name exactly as it appears in the following product title.
Do not modify, alter, or expand the name in any way, except to correct common variant forms.
If the drug name appears in a variant form (for example, ending with "ii" instead of "2", such as "melanotanii"),
return the canonical name (for example, "melanotan2").

Special cases to handle:
1. If "CJC" appears with "DAC", return "cjc1295-dac" (all lowercase)
2. If "CJC" appears without "DAC", return "cjc1295" (all lowercase)
3. If "enclomiphene" or any variant appears, return "enclomiphene" (all lowercase, not to be confused with clomiphene)

Return only the corrected drug name in all lowercase with no additional text.

Product Title: {product_name}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You extract drug names from product titles exactly as provided, converting to lowercase."},
                {"role": "user", "content": prompt}
            ],
            model="gpt-4o-mini"
        )
        extracted_text = response.choices[0].message.content.strip().lower()  # Force lowercase here too
        logger.info(f"OpenAI extracted drug name: '{extracted_text}' from product title: '{product_name}'")
        final_name = match_existing_drug_name(extracted_text)
        final_normalized = clean_drug_name(final_name)
        logger.info(f"Final normalized drug name used: '{final_normalized}'")
        request_id = getattr(response, "request_id", None)
        return final_normalized, request_id
    except Exception as e:
        logger.error(f"OpenAI API failed for '{product_name}': {e}")
        return None, None
    
def get_proper_capitalization(drug_name: str) -> str:
    if not drug_name:
        return None
    prompt = f"""
Return the properly capitalized version of the following drug name.
Output only the capitalized drug name with no extra text.

Drug Name: {drug_name}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You capitalize drug names properly."},
                {"role": "user", "content": prompt}
            ],
            model="gpt-4o-mini"
        )
        proper_name = response.choices[0].message.content.strip()
        logger.info(f"Proper capitalization for '{drug_name}' is '{proper_name}'")
        return proper_name
    except Exception as e:
        logger.error(f"OpenAI API failed for capitalization of '{drug_name}': {e}")
        return None

def generate_descriptions_for_drug(drug_name: str):
    if not drug_name:
        return None, None
    prompt = f"""
You are an assistant that provides plain-language summaries for research chemicals.
The chemical's name is '{drug_name}'.

Return a JSON object with exactly two keys:
  "what_it_does": A summary of the compound's effects and off-label uses in plain easy to understand language. Expand on each off-label use. No need to specifiy that they are off-label, just list them out.
  "how_it_works": An explanation of its mechanism of action.

Output must be valid JSON with no extra text.
Example:
{{
  "what_it_does": "Explanation text.",
  "how_it_works": "Mechanism text."
}}
"""
    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You generate plain,  summaries about research chemicals."},
                {"role": "user", "content": prompt}
            ],
            model="gpt-4o"
        )
        raw_text = response.choices[0].message.content.strip()
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
        try:
            parsed = json.loads(raw_text)
            what_it_does = parsed.get("what_it_does", "").strip()
            how_it_works = parsed.get("how_it_works", "").strip()
            logger.info(f"Generated descriptions for '{drug_name}'.")
            return what_it_does, how_it_works
        except json.JSONDecodeError:
            logger.error(f"JSON decode error for '{drug_name}': {raw_text}")
            with open("decode_errors.txt", "a", encoding="utf-8") as f:
                f.write(f"Drug Name: {drug_name}\nRaw Text:\n{raw_text}\n\n")
            return None, None
    except Exception as e:
        logger.error(f"OpenAI API request failed for '{drug_name}': {e}")
        return None, None

# ---------------------------
# HELPER FUNCTION: CLOUDINARY UPLOAD
# ---------------------------
def upload_image_to_cloudinary(vendor_id: int, local_image_path: str):
    if not local_image_path or not os.path.isfile(local_image_path):
        logger.warning(f"Vendor {vendor_id}: No valid image at '{local_image_path}'.")
        return None
    try:
        logger.info(f"Vendor {vendor_id}: Uploading image '{local_image_path}' to Cloudinary...")
        result = cloudinary.uploader.upload(
            local_image_path,
            unique_filename=False,
            overwrite=True,
            resource_type="auto"
        )
        new_url = result.get("secure_url", "")
        if new_url:
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("UPDATE Vendors SET cloudinary_product_image = ? WHERE id = ?", (new_url, vendor_id))
            conn.commit()
            conn.close()
            logger.info(f"Vendor {vendor_id}: Image uploaded. URL: {new_url}")
            return new_url
        else:
            logger.warning(f"Vendor {vendor_id}: Cloudinary upload returned no URL.")
            return None
    except Exception as e:
        logger.error(f"Error uploading image for Vendor {vendor_id}: {e}")
        return None

# ---------------------------
# SELENIUM & ARTICLE SCRAPING (unchanged)
# ---------------------------
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument(f"--user-agent={ua.random}")
    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(5)
    return driver

def extract_article_data(driver, article_url):
    try:
        driver.get(article_url)
        time.sleep(random.uniform(1, 3))
        soup = BeautifulSoup(driver.page_source, "html.parser")
        title_div = soup.find("h1", class_="heading-title")
        if not title_div:
            logger.warning(f"No title found for {article_url}; skipping.")
            return None
        title_text = title_div.get_text(strip=True) or ""
        pmid, doi = None, None
        identifiers_ul = soup.find("ul", {"id": "full-view-identifiers", "class": "identifiers"})
        if identifiers_ul:
            pmid_strong = identifiers_ul.select_one("span.identifier.pubmed strong.current-id")
            if pmid_strong:
                pmid = pmid_strong.get_text(strip=True)
            doi_link = identifiers_ul.select_one("span.identifier.doi a.id-link")
            if doi_link:
                doi = doi_link.get_text(strip=True)
        pub_type_elem = soup.find("div", class_="publication-type")
        publication_type = pub_type_elem.get_text(strip=True) if pub_type_elem else ""
        abstract_div = soup.find("div", id="abstract")
        abstract_parts = abstract_div.find_all("p") if abstract_div else []
        background_text = abstract_parts[0].get_text(strip=True) if len(abstract_parts) > 0 else ""
        methods_text = abstract_parts[1].get_text(strip=True) if len(abstract_parts) > 1 else ""
        if methods_text.strip().lower().startswith("keywords"):
            methods_text = ""
        sections = {"Results": "", "Conclusions": ""}
        for part in abstract_parts[2:]:
            sub_title = part.find("strong", class_="sub-title")
            if sub_title:
                section_name = sub_title.get_text(strip=True).rstrip(":")
                text_content = part.get_text(strip=True).replace(sub_title.get_text(strip=True), "").strip()
                if section_name in sections:
                    sections[section_name] = text_content
        results_text = sections["Results"]
        if results_text.strip().lower().startswith("keywords"):
            results_text = ""
        sponsor_match = re.search(r"(Funded by|Sponsored by)\s(.+?)(\.|;|$)", sections["Conclusions"])
        sponsor = sponsor_match.group(2).strip() if sponsor_match else ""
        publication_date = None
        heading_div = soup.find("div", class_="full-view", id="full-view-heading")
        if heading_div:
            heading_text = heading_div.get_text(" ", strip=True)
            match = re.search(r"(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})", heading_text)
            if match:
                year_str, month_str, day_str = match.groups()
                try:
                    dt = datetime.strptime(f"{year_str} {month_str} {day_str}", "%Y %b %d")
                    publication_date = dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass
            else:
                match2 = re.search(r"(\d{4})\s+([A-Za-z]{3})(?!\s+\d)", heading_text)
                if match2:
                    year_str, month_str = match2.groups()
                    try:
                        dt = datetime.strptime(f"{year_str} {month_str} 1", "%Y %b %d")
                        publication_date = dt.strftime("%Y-%m-%d")
                    except ValueError:
                        pass
        return {
            "article_url": article_url,
            "pmid": pmid,
            "doi": doi,
            "title": title_text,
            "background": background_text,
            "methods": methods_text,
            "results": results_text,
            "conclusions": sections["Conclusions"],
            "sponsor": sponsor,
            "publication_type": publication_type,
            "publication_date": publication_date
        }
    except Exception as e:
        logger.error(f"Error extracting data from {article_url}: {e}", exc_info=True)
        return None

def normalize_text(s: str) -> str:
    return re.sub(r'[\s\-\_]+', '', s.lower())

def scrape_page(driver, base_url, page_num, drug_term):
    driver.get(base_url)
    time.sleep(random.uniform(1, 3))
    soup = BeautifulSoup(driver.page_source, "html.parser")
    max_pages = 10  # Fallback maximum
    article_links = []
    for a in soup.select("a.docsum-title"):
        text = a.get_text(separator=" ", strip=True)
        if normalize_text(drug_term) in normalize_text(text):
            article_links.append("https://pubmed.ncbi.nlm.nih.gov" + a['href'])
        else:
            logger.debug(f"Skipping link due to drug mismatch: '{text}'")
    next_button = soup.select_one("button.next-page-btn")
    has_next = bool(next_button and "disabled-icon" not in next_button.get("class", ""))
    logger.info(f"Page {page_num} -> found {len(article_links)} matching links (max_pages={max_pages})")
    return article_links, has_next, max_pages

def article_already_in_db(article_url):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM articles WHERE article_url=? LIMIT 1", (article_url,))
    row = cursor.fetchone()
    conn.close()
    return bool(row)

def log_failure(article_url, reason):
    with open(FAILURES_LOG, "a", encoding="utf-8") as f:
        f.write(f"{article_url} - {reason}\n")
    logger.warning(f"SKIPPED: {reason} | {article_url}")

def article_mentions_drug(article_data, drug_term):
    title = article_data.get("title", "")
    return normalize_text(drug_term) in normalize_text(title)

def get_or_create_article_id(article_data, drug_id):
    article_url = article_data.get("article_url")
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM articles WHERE article_url=? LIMIT 1", (article_url,))
    row = cursor.fetchone()
    if row:
        article_id = row[0]
        cursor.execute("UPDATE articles SET drug_id = ? WHERE id = ?", (drug_id, article_id))
        conn.commit()
        conn.close()
        return article_id
    cursor.execute("""
        INSERT INTO articles (
            article_url, pmid, doi, title, background, methods, results,
            conclusions, sponsor, publication_type, publication_date, drug_id, in_supabase
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        article_data.get("article_url"),
        article_data.get("pmid"),
        article_data.get("doi"),
        article_data.get("title"),
        article_data.get("background"),
        article_data.get("methods"),
        article_data.get("results"),
        article_data.get("conclusions"),
        article_data.get("sponsor"),
        article_data.get("publication_type"),
        article_data.get("publication_date"),
        drug_id,
        0
    ))
    article_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return article_id

def scrape_drug_term(drug_name, drug_id, progress, test_only=False):
    logger.info(f"Starting scraping for '{drug_name}' (Drug ID: {drug_id})")
    driver = configure_selenium()
    start_page = progress.get(drug_name, 1)
    logger.info(f"Resuming '{drug_name}' at page {start_page}")
    page_num = start_page
    base_url = BASE_URL_TEMPLATE.format(term=drug_name)
    if page_num > 1:
        base_url += f"&page={page_num}"
    all_links = []
    all_links_set = set()
    max_pages_found = None
    while True:
        try:
            new_links, has_next, maybe_max_pages = scrape_page(driver, base_url, page_num, drug_name)
        except Exception as e:
            logger.error(f"Error scraping page {page_num} for '{drug_name}': {e}", exc_info=True)
            break
        for link in new_links:
            if link not in all_links_set:
                all_links.append(link)
                all_links_set.add(link)
        if maybe_max_pages and not max_pages_found:
            max_pages_found = maybe_max_pages
            logger.debug(f"Found max_pages={max_pages_found} for '{drug_name}'")
        if max_pages_found and page_num >= max_pages_found:
            logger.info(f"Reached last page ({page_num} of {max_pages_found}) for '{drug_name}'")
            progress[drug_name] = page_num
            break
        if not has_next:
            logger.info(f"No more pages for '{drug_name}' after page {page_num}")
            progress[drug_name] = page_num
            break
        progress[drug_name] = page_num
        page_num += 1
        logger.info(f"Moving to page {page_num} for '{drug_name}'")
        time.sleep(random.uniform(2, 5))
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR, "button.next-page-btn")
            ActionChains(driver).move_to_element(next_btn).click().perform()
            time.sleep(random.uniform(1, 3))
            base_url = driver.current_url
        except Exception as e:
            logger.error(f"Error on next page for '{drug_name}': {e}", exc_info=True)
            break
        if test_only:
            break
    logger.info(f"Collected {len(all_links)} unique links for '{drug_name}'")
    
    consecutive_failures = 0
    for link in all_links:
        if article_already_in_db(link):
            continue
        article_data = extract_article_data(driver, link)
        if not article_data:
            log_failure(link, f"Skipped article for '{drug_name}' (no article data)")
            consecutive_failures += 1
            if consecutive_failures >= 3:
                logger.info(f"Stopping processing for '{drug_name}' due to 3 consecutive failures.")
                break
            continue
        if not article_mentions_drug(article_data, drug_name):
            log_failure(link, f"Skipped article for '{drug_name}' (drug term not found in title)")
            consecutive_failures += 1
            if consecutive_failures >= 3:
                logger.info(f"Stopping processing for '{drug_name}' due to 3 consecutive non-matches.")
                break
            continue
        consecutive_failures = 0
        article_id = get_or_create_article_id(article_data, drug_id)
        logger.info(f"Processed article {article_id} for '{drug_name}'.")
    driver.quit()
    logger.info(f"Finished scraping '{drug_name}' (Drug ID: {drug_id}).")

# ---------------------------
# UPDATE SUPABASE: NEW ROWS ONLY
# ---------------------------
def update_supabase_db():
    from supabase import create_client
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase credentials are not set.")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    def prepare_rows(rows):
        updated_rows = []
        for row in rows:
            row_dict = dict(row)
            row_dict["in_supabase"] = 1
            updated_rows.append(row_dict)
        return updated_rows

    cursor.execute("SELECT * FROM Drugs WHERE in_supabase = 0")
    drugs = prepare_rows(cursor.fetchall())
    try:
        if drugs:
            drug_response = supabase.table("drugs").upsert(drugs, on_conflict="id").execute()
            logger.info(f"Upserted {len(drugs)} drugs to Supabase. Response: {drug_response}")
            cursor.execute("UPDATE Drugs SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new drugs to upsert.")
    except Exception as e:
        logger.error(f"Error upserting drugs: {e}")
    
    cursor.execute("SELECT * FROM Vendors WHERE in_supabase = 0")
    vendors = prepare_rows(cursor.fetchall())
    try:
        if vendors:
            vendor_response = supabase.table("vendors").upsert(vendors, on_conflict="id").execute()
            logger.info(f"Upserted {len(vendors)} vendors to Supabase. Response: {vendor_response}")
            cursor.execute("UPDATE Vendors SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new vendors to upsert.")
    except Exception as e:
        logger.error(f"Error upserting vendors: {e}")
    
    cursor.execute("SELECT * FROM articles WHERE in_supabase = 0")
    articles = prepare_rows(cursor.fetchall())
    try:
        if articles:
            article_response = supabase.table("articles").upsert(articles, on_conflict="id").execute()
            logger.info(f"Upserted {len(articles)} articles to Supabase. Response: {article_response}")
            cursor.execute("UPDATE articles SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new articles to upsert.")
    except Exception as e:
        logger.error(f"Error upserting articles: {e}")
    
    conn.close()

# ---------------------------
# PROCESS NEW VENDOR ROWS IN PARALLEL
# ---------------------------
def process_single_vendor(vendor):
    """
    Process a single vendor row (with its own SQLite connection).
    This function handles image upload, drug name extraction/matching,
    updating the vendor row with the appropriate drug_id, and scraping articles if needed.
    """
    # Open a new SQLite connection for this thread.
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    vendor_id = vendor["id"]
    product_name = vendor["product_name"]
    product_image = vendor["product_image"]
    logger.info(f"Processing vendor ID {vendor_id} with product '{product_name}'.")

    # Upload vendor image.
    upload_image_to_cloudinary(vendor_id, product_image)

    if not product_name:
        logger.warning(f"Vendor {vendor_id}: No product name provided. Skipping.")
        conn.close()
        return

    extracted_name, req_id = get_drug_name_from_title(product_name)
    # (Optional: you could store extraction_results using a thread-safe mechanism.)
    if not extracted_name:
        logger.warning(f"Vendor {vendor_id}: Could not extract drug name from '{product_name}'. Skipping.")
        conn.close()
        return

    normalized_extracted = clean_drug_name(extracted_name)
    cursor.execute("SELECT id, proper_name FROM Drugs WHERE LOWER(REPLACE(name, ' ', '')) = ?", (normalized_extracted,))
    result = cursor.fetchone()

    if result:
        drug_id_found = result["id"]
        logger.info(f"Vendor {vendor_id}: Found existing drug '{extracted_name}' with id {drug_id_found}. Skipping article extraction.")
    else:
        logger.info(f"Vendor {vendor_id}: No matching drug for '{extracted_name}' found. Inserting new drug.")
        try:
            cursor.execute("INSERT INTO Drugs (name, in_supabase) VALUES (?, ?)", (extracted_name, 0))
            conn.commit()
        except sqlite3.IntegrityError as ie:
            logger.error(f"Integrity error inserting drug '{extracted_name}': {ie}")
            conn.close()
            return
        cursor.execute("SELECT id FROM Drugs WHERE name = ?", (extracted_name,))
        new_row = cursor.fetchone()
        if new_row:
            drug_id_found = new_row["id"]
            logger.info(f"Vendor {vendor_id}: Inserted new drug '{extracted_name}' with id {drug_id_found}.")
            proper_name = get_proper_capitalization(extracted_name)
            if proper_name:
                cursor.execute("UPDATE Drugs SET proper_name = ? WHERE id = ?", (proper_name, drug_id_found))
                conn.commit()
                logger.info(f"Vendor {vendor_id}: Updated drug id {drug_id_found} with proper_name '{proper_name}'.")
            else:
                logger.warning(f"Vendor {vendor_id}: Could not generate proper capitalization for '{extracted_name}'.")
            what_it_does, how_it_works = generate_descriptions_for_drug(extracted_name)
            if what_it_does and how_it_works:
                cursor.execute("UPDATE Drugs SET what_it_does = ?, how_it_works = ? WHERE id = ?", 
                               (what_it_does, how_it_works, drug_id_found))
                conn.commit()
                logger.info(f"Vendor {vendor_id}: Updated new drug '{extracted_name}' with descriptions.")
            else:
                logger.warning(f"Vendor {vendor_id}: Could not generate descriptions for '{extracted_name}'.")
            logger.info(f"Starting article extraction for new drug '{extracted_name}' (ID: {drug_id_found}).")
            scrape_drug_term(extracted_name, drug_id_found, {}, test_only=False)
        else:
            logger.error(f"Vendor {vendor_id}: Failed to retrieve new drug id for '{extracted_name}'.")
            conn.close()
            return

    # Update vendor row with the linked drug_id.
    cursor.execute("UPDATE Vendors SET drug_id = ? WHERE id = ?", (drug_id_found, vendor_id))
    conn.commit()
    logger.info(f"Vendor {vendor_id}: Updated with drug_id {drug_id_found}.")
    conn.close()

def process_new_vendors_parallel():
    """
    Fetch all new vendor rows (where drug_id is NULL or empty)
    and process them concurrently using 4 threads.
    """
    main_conn = sqlite3.connect(DB_FILE)
    main_conn.row_factory = sqlite3.Row
    main_cursor = main_conn.cursor()
    main_cursor.execute("SELECT id, product_name, product_image, drug_id FROM Vendors WHERE drug_id IS NULL OR drug_id = ''")
    vendors = main_cursor.fetchall()
    main_conn.close()
    logger.info(f"Found {len(vendors)} new vendor rows to process.")
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(process_single_vendor, vendor) for vendor in vendors]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as e:
                logger.error(f"Error in threaded vendor processing: {e}")

# ---------------------------
# MAIN SUPABASE UPDATE (unchanged)
# ---------------------------
def update_supabase_db():
    from supabase import create_client
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase credentials are not set.")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    def prepare_rows(rows):
        updated_rows = []
        for row in rows:
            row_dict = dict(row)
            row_dict["in_supabase"] = 1
            updated_rows.append(row_dict)
        return updated_rows

    cursor.execute("SELECT * FROM Drugs WHERE in_supabase = 0")
    drugs = prepare_rows(cursor.fetchall())
    try:
        if drugs:
            drug_response = supabase.table("drugs").upsert(drugs, on_conflict="id").execute()
            logger.info(f"Upserted {len(drugs)} drugs to Supabase. Response: {drug_response}")
            cursor.execute("UPDATE Drugs SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new drugs to upsert.")
    except Exception as e:
        logger.error(f"Error upserting drugs: {e}")
    
    cursor.execute("SELECT * FROM Vendors WHERE in_supabase = 0")
    vendors = prepare_rows(cursor.fetchall())
    try:
        if vendors:
            vendor_response = supabase.table("vendors").upsert(vendors, on_conflict="id").execute()
            logger.info(f"Upserted {len(vendors)} vendors to Supabase. Response: {vendor_response}")
            cursor.execute("UPDATE Vendors SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new vendors to upsert.")
    except Exception as e:
        logger.error(f"Error upserting vendors: {e}")
    
    cursor.execute("SELECT * FROM articles WHERE in_supabase = 0")
    articles = prepare_rows(cursor.fetchall())
    try:
        if articles:
            article_response = supabase.table("articles").upsert(articles, on_conflict="id").execute()
            logger.info(f"Upserted {len(articles)} articles to Supabase. Response: {article_response}")
            cursor.execute("UPDATE articles SET in_supabase = 1 WHERE in_supabase = 0")
            conn.commit()
        else:
            logger.info("No new articles to upsert.")
    except Exception as e:
        logger.error(f"Error upserting articles: {e}")
    
    conn.close()

# ---------------------------
# MAIN PROCESS
# ---------------------------
def load_progress():
    progress_file = "progress_checkpoint.json"
    if os.path.exists(progress_file):
        with open(progress_file, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if content:
                return json.loads(content)
    return {}

def main_batch_pipeline():
    # Phase 1: Relevance Batch
    try:
        logger.info("Starting relevance batch request creation...")
        relevance_batch_file = create_relevance_batch_requests()
        validate_batch_file(relevance_batch_file)
        input_file_id = upload_batch_file(relevance_batch_file)
        batch_job_id = create_batch_job(input_file_id, RELEVANCE_MODEL, RELEVANCE_MAX_TOKENS)
        final_job = poll_batch_status(batch_job_id)
        retrieve_results(final_job, RELEVANCE_OUTPUT_FILE)
        process_relevance_batch_results()
        logger.info("Relevance batch processing completed.")
    except Exception as e:
        logger.error(f"Error during relevance batch processing: {e}")

    # Phase 2: Summarization Batch (only for articles with is_relevant==1)
    try:
        logger.info("Starting summarization batch request creation...")
        summarization_batch_file = create_summarization_batch_requests()
        validate_batch_file(summarization_batch_file)
        input_file_id = upload_batch_file(summarization_batch_file)
        batch_job_id = create_batch_job(input_file_id, SUMMARIZATION_MODEL, SUMMARIZATION_MAX_TOKENS)
        final_job = poll_batch_status(batch_job_id)
        retrieve_results(final_job, SUMMARIZATION_OUTPUT_FILE)
        process_summarization_batch_results()
        logger.info("Summarization batch processing completed.")
    except Exception as e:
        logger.error(f"Error during summarization batch processing: {e}")

    # Phase 3: Ordering (Ranking) Batch
    try:
        logger.info("Starting ordering batch request creation...")
        order_batch_file = create_order_batch_requests()
        validate_batch_file(order_batch_file)
        input_file_id = upload_batch_file(order_batch_file)
        batch_job_id = create_batch_job(input_file_id, ORDER_MODEL, ORDER_MAX_TOKENS)
        final_job = poll_batch_status(batch_job_id)
        retrieve_results(final_job, ORDER_OUTPUT_FILE)
        process_order_batch_results()
        logger.info("Ordering batch processing completed.")
    except Exception as e:
        logger.error(f"Error during ordering batch processing: {e}")
        
    # Phase 4: Product Form Classification Batch
    try:
        logger.info("Starting product form classification batch process...")
        run_form_classification_batch()
    except Exception as e:
        logger.error(f"Error during product form classification batch process: {e}")
        
    # Phase 5: Dosage Advice Batch
    try:
        logger.info("Starting dosage advice batch process...")
        run_dosage_advice_batch()
    except Exception as e:
        logger.error(f"Error during dosage advice batch process: {e}")

    logger.info("Integrated batch pipeline completed successfully.")


def generate_embeddings_for_new_drugs():
    """
    Generates embeddings for drugs that don't have them in Supabase.
    This function should be called after the main Supabase update.
    
    It checks for drugs in Supabase that are missing embeddings,
    generates embeddings in batches, and uploads them to the drug_embeddings table.
    
    The function now creates separate embeddings for drug names and content
    based on the updated table structure.
    """
    from supabase import create_client
    import numpy as np
    import time
    import os
    
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
    SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase credentials are not set.")
    
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    logger.info("Checking for drugs that need embeddings...")
    
    # Step 1: First, make sure the drug_embeddings table exists
    try:
        # Check if table exists by querying it
        supabase.table("drug_embeddings").select("id").limit(1).execute()
        logger.info("drug_embeddings table exists in Supabase")
    except Exception as e:
        logger.warning(f"Error checking drug_embeddings table: {e}")
        logger.info("Creating drug_embeddings table in Supabase...")
        try:
            # Create the table with a SQL query - updated for the new schema
            sql_query = """
            CREATE TABLE IF NOT EXISTS drug_embeddings (
                id BIGINT REFERENCES drugs(id),
                name_embedding VECTOR(1536),
                content_embedding VECTOR(1536),
                PRIMARY KEY (id)
            );
            
            CREATE OR REPLACE FUNCTION match_drugs_by_name(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
            RETURNS TABLE (
                id BIGINT,
                name TEXT,
                proper_name TEXT,
                what_it_does TEXT,
                how_it_works TEXT,
                similarity FLOAT
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    drugs.id,
                    drugs.name,
                    drugs.proper_name,
                    drugs.what_it_does,
                    drugs.how_it_works,
                    1 - (drug_embeddings.name_embedding <=> query_embedding) AS similarity
                FROM drug_embeddings
                JOIN drugs ON drugs.id = drug_embeddings.id
                WHERE 1 - (drug_embeddings.name_embedding <=> query_embedding) > match_threshold
                ORDER BY similarity DESC
                LIMIT match_count;
            END;
            $$;
            
            CREATE OR REPLACE FUNCTION match_drugs_by_content(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
            RETURNS TABLE (
                id BIGINT,
                name TEXT,
                proper_name TEXT,
                what_it_does TEXT,
                how_it_works TEXT,
                similarity FLOAT
            )
            LANGUAGE plpgsql
            AS $$
            BEGIN
                RETURN QUERY
                SELECT
                    drugs.id,
                    drugs.name,
                    drugs.proper_name,
                    drugs.what_it_does,
                    drugs.how_it_works,
                    1 - (drug_embeddings.content_embedding <=> query_embedding) AS similarity
                FROM drug_embeddings
                JOIN drugs ON drugs.id = drug_embeddings.id
                WHERE 1 - (drug_embeddings.content_embedding <=> query_embedding) > match_threshold
                ORDER BY similarity DESC
                LIMIT match_count;
            END;
            $$;
            """
            # Execute SQL directly
            conn = supabase.postgrest.connection
            conn.execute(sql_query)
            logger.info("Successfully created drug_embeddings table and match_drugs functions")
        except Exception as create_error:
            logger.error(f"Error creating drug_embeddings table: {create_error}")
            return
    
    # Step 2: Find drugs without embeddings
    try:
        # Get all drug IDs that are already in the embeddings table
        embeddings_response = supabase.table("drug_embeddings").select("id").execute()
        existing_embedding_ids = {item['id'] for item in embeddings_response.data}
        
        # Get all drugs from the drugs table
        drugs_response = supabase.table("drugs").select("id,name,proper_name,what_it_does,how_it_works").execute()
        all_drugs = drugs_response.data
        
        # Filter for drugs without embeddings
        drugs_needing_embeddings = [
            drug for drug in all_drugs 
            if drug['id'] not in existing_embedding_ids
            and (drug.get('name') or drug.get('proper_name'))
            and (drug.get('what_it_does') or drug.get('how_it_works'))
        ]
        
        logger.info(f"Found {len(drugs_needing_embeddings)} drugs that need embeddings")
        
        if not drugs_needing_embeddings:
            logger.info("No new drug embeddings needed.")
            return
        
    except Exception as e:
        logger.error(f"Error querying for drugs needing embeddings: {e}")
        return
    
    # Step 3: Generate embeddings in batches
    BATCH_SIZE = 20  # Process in batches to reduce API calls
    
    for i in range(0, len(drugs_needing_embeddings), BATCH_SIZE):
        batch = drugs_needing_embeddings[i:i+BATCH_SIZE]
        logger.info(f"Processing embedding batch {i//BATCH_SIZE + 1}/{(len(drugs_needing_embeddings)-1)//BATCH_SIZE + 1} ({len(batch)} drugs)")
        
        batch_name_texts = []
        batch_content_texts = []
        
        # Prepare batch data
        for drug in batch:
            # Create text representations for embeddings
            drug_name = drug.get('name', '') or drug.get('proper_name', '')
            drug_content = f"{drug.get('what_it_does', '')} {drug.get('how_it_works', '')}"
            
            batch_name_texts.append((drug['id'], drug_name))
            batch_content_texts.append((drug['id'], drug_content))
        
        try:
            # Generate name embeddings
            name_input_texts = [text for _, text in batch_name_texts]
            name_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=name_input_texts
            )
            
            # Generate content embeddings
            content_input_texts = [text for _, text in batch_content_texts]
            content_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=content_input_texts
            )
            
            # Process and store embeddings
            embeddings_data = []
            
            for j in range(len(batch)):
                drug_id = batch[j]['id']
                
                embeddings_data.append({
                    "id": drug_id,
                    "name_embedding": name_response.data[j].embedding,
                    "content_embedding": content_response.data[j].embedding
                })
            
            # Upsert batch to Supabase
            if embeddings_data:
                supabase.table("drug_embeddings").upsert(embeddings_data).execute()
                logger.info(f"Stored {len(embeddings_data)} drug embeddings in Supabase")
            
        except Exception as e:
            logger.error(f"Error generating embeddings for batch {i//BATCH_SIZE + 1}: {e}")
        
        # Add a small delay between batches to avoid rate limiting
        if i + BATCH_SIZE < len(drugs_needing_embeddings):
            time.sleep(2)
    
    logger.info("Completed generating embeddings for all new drugs")
    
# Add this to your main() function
def main():
    try:
        init_db()
        ensure_drugs_table_has_last_checked()
        logger.info("Database initialization completed.")
    except Exception as e:
        logger.error("Error during database initialization: %s", e)
    
    try:
        process_new_vendors_parallel()
        logger.info("Processed all new vendor rows successfully (parallel).")
    except Exception as e:
        logger.error("Error processing new vendor rows: %s", e)
        
    try:
        main_batch_pipeline()
        logger.info("Batch pipeline processed successfully.")
    except Exception as e:
        logger.error("Error during batch pipeline processing: %s", e)
    
    try:
        update_supabase_db()
        logger.info("Updated Supabase with new rows successfully.")
    except Exception as e:
        logger.error("Error updating Supabase: %s", e)
    
    # Add this new function call to generate embeddings after Supabase is updated
    try:
        generate_embeddings_for_new_drugs()
        logger.info("Generated embeddings for new drugs successfully.")
    except Exception as e:
        logger.error("Error generating embeddings for new drugs: %s", e)
    
    logger.info("Drug vendor pipeline (processing all new vendors in parallel) completed.")