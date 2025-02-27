#!/usr/bin/env python3
import os
import sqlite3
import json
import time
import logging
import random
from datetime import datetime
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
BATCH_FILE = "DB/Batch_requests/batch_input_order_articles.jsonl"
OUTPUT_FILE = "DB/Batch_requests/batch_output_order_articles.jsonl"
MODEL = "gpt-4o"  # or your preferred model
MAX_TOKENS = 300  # adjust as needed
MAX_REQUESTS = 50000
MAX_FILE_SIZE_MB = 100

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("order_articles_batch")

# --------------------------------------------------
# DATABASE FUNCTIONS
# --------------------------------------------------
def get_all_drugs():
    """
    Retrieves all drugs from the Drugs table.
    Returns a list of tuples: (id, name, proper_name).
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, proper_name FROM Drugs ORDER BY id")
    drugs = cursor.fetchall()
    conn.close()
    logger.info(f"Found {len(drugs)} drugs in the database.")
    return drugs

def get_articles_for_drug(drug_id):
    """
    Retrieves all articles for a given drug_id.
    Returns a list of tuples: (id, title).
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM articles WHERE drug_id = ?", (drug_id,))
    articles = cursor.fetchall()
    conn.close()
    logger.info(f"Drug ID {drug_id}: Found {len(articles)} articles.")
    return articles

# --------------------------------------------------
# PROMPT CREATION FUNCTION
# --------------------------------------------------
def build_order_prompt(drug_name: str, proper_name: str, articles: list) -> str:
    """
    Constructs a prompt for OpenAI to rank article headings by relevance.
    The prompt lists each article's id and heading, and instructs the model to return
    a JSON object mapping article ids to a ranking order (1 being the most relevant).
    """
    article_list = "\n".join([f"{article_id}: {title}" for article_id, title in articles])
    prompt = f"""
For the research chemical "{proper_name}" (also known as "{drug_name}"), here are the article headings along with their IDs:
{article_list}

Rank these articles in order of relevance for a customer seeking to understand the drug's effects on people or animals. 
Relevance criteria:
  - A ranking of 1 means the article is most vital (e.g. clinical trials or in vivo studies).
  - Higher numbers indicate lower relevance.
Return a JSON object where each key is an article id (as a number) and the corresponding value is its rank order (as an integer, starting at 1 for the most relevant).
Do not include any extra text.
Output:
""".strip()
    return prompt

# --------------------------------------------------
# BATCH REQUEST CREATION
# --------------------------------------------------
def create_batch_requests():
    """
    Creates a JSONL batch file containing one request per drug.
    Each request instructs the model to rank the articles for that drug.
    The custom_id is in the format "drug{drug_id}_order".
    """
    drugs = get_all_drugs()
    if not drugs:
        logger.error("No drugs found in the database.")
        return

    tasks = []
    for drug in drugs:
        drug_id, name, proper_name = drug
        articles = get_articles_for_drug(drug_id)
        if not articles:
            logger.info(f"No articles for drug ID {drug_id}. Skipping.")
            continue
        prompt = build_order_prompt(name, proper_name, articles)
        custom_id = f"drug{drug_id}_order"
        logger.info(f"Creating batch request for drug ID {drug_id} with {len(articles)} articles.")
        request_obj = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": MODEL,
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": MAX_TOKENS,
                "temperature": 0.0
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
    except Exception as e:
        logger.error(f"Error writing batch file: {e}")

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

def poll_batch_status(batch_job_id: str, poll_interval: int = 10, timeout: int = 3600):
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
    else:
        logger.error(f"Batch job did not complete successfully. Status: {batch_job.status}")
        if hasattr(batch_job, "error_file_id") and batch_job.error_file_id:
            logger.error("An error file is available for review.")

# --------------------------------------------------
# PARSE RESPONSE CONTENT AND UPDATE LOCAL DB
# --------------------------------------------------
def parse_order_response(content: str) -> dict:
    """
    Expects a JSON object mapping article IDs to ranking numbers.
    For example: {"101": 1, "102": 2, ...}
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
        logger.info(f"Updated article order for drug ID {drug_id} with mapping: {order_mapping}")
    except Exception as e:
        logger.error(f"Error updating article order for drug ID {drug_id}: {e}")
    finally:
        conn.close()

def process_batch_results():
    """
    Reads the batch results JSONL file, parses each line to extract the GPT response,
    and updates the corresponding drug's articles in the local database.
    Expects custom_id format "drug{drug_id}_order".
    """
    if not os.path.exists(OUTPUT_FILE):
        logger.error(f"Result file '{OUTPUT_FILE}' does not exist.")
        return

    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()

    processed_count = 0
    for line in lines:
        try:
            result = json.loads(line.strip())
            custom_id = result.get("custom_id", "")
            if not custom_id.startswith("drug") or "_order" not in custom_id:
                logger.warning(f"Custom ID {custom_id} does not match expected format. Skipping.")
                continue
            drug_id_str = custom_id.replace("drug", "").replace("_order", "")
            drug_id = int(drug_id_str)
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
            order_mapping = parse_order_response(content)
            if order_mapping:
                update_article_order(drug_id, order_mapping)
                processed_count += 1
            else:
                logger.warning(f"Empty order mapping for drug ID {drug_id}.")
        except Exception as e:
            logger.error(f"Error processing line: {e}")

    logger.info(f"Finished processing batch results. Updated orders for {processed_count} drugs in local DB.")

# --------------------------------------------------
# UPLOAD UPDATED ARTICLES TO SUPABASE
# --------------------------------------------------
def upsert_ordered_articles_to_supabase():
    """
    Retrieves articles from the local DB that have non-empty order values,
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
    cursor.execute("""
        SELECT * FROM articles
        WHERE order_num IS NOT NULL
    """)
    articles = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    if not articles:
        logger.info("No articles with order values to upsert to Supabase.")
        return
    
    try:
        upsert_response = supabase.table("articles").upsert(articles, on_conflict="id").execute()
        logger.info(f"Upserted {len(articles)} articles with order values to Supabase. Response: {upsert_response}")
    except Exception as e:
        logger.error(f"Error upserting articles to Supabase: {e}")

# --------------------------------------------------
# MAIN PROCESS
# --------------------------------------------------
if __name__ == "__main__":
    try:
        # Step 1: Create the batch file for ordering articles
        create_batch_requests()
        validate_batch_file(BATCH_FILE)
        
        # Step 2: Upload the batch file to OpenAI and create a batch job
        input_file_id = upload_batch_file(BATCH_FILE)
        batch_job_id = create_batch_job(input_file_id)
        
        # Step 3: Poll for batch job completion
        final_job = poll_batch_status(batch_job_id)
        
        # Step 4: Retrieve batch job results
        retrieve_results(final_job)
        
        # Step 5: Process the results and update the local DB with article orders (order_num)
        process_batch_results()
        
        # Step 6: Upsert the updated articles (with order values) to Supabase
        upsert_ordered_articles_to_supabase()
        
    except Exception as e:
        logger.error(f"Error during batch processing: {e}")