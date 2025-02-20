import os
import time
import json
import sqlite3
import logging
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from the .env file in the root directory
load_dotenv()

# Initialize OpenAI client as required
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"
BATCH_FILE = "batch_input.jsonl"
OUTPUT_FILE = "batch_job_results.jsonl"
MODEL = "gpt-4o"
MAX_TOKENS = 1000
MAX_REQUESTS = 50000
MAX_FILE_SIZE_MB = 100

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# --------------------------------------------------
# VALIDATE BATCH FILE
# --------------------------------------------------
def validate_batch_file(file_path: str):
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        raise Exception(f"Batch file size {file_size_mb:.2f} MB exceeds maximum allowed {MAX_FILE_SIZE_MB} MB.")
    with open(file_path, 'r') as file:
        lines = file.readlines()
        line_count = len(lines)
    if line_count > MAX_REQUESTS:
        raise Exception(f"Batch file has {line_count} requests, exceeding limit of {MAX_REQUESTS}.")
    logger.info(f"Batch file '{file_path}' is valid with {line_count} requests and {file_size_mb:.2f} MB.")
    return line_count

# --------------------------------------------------
# UPLOAD BATCH FILE
# --------------------------------------------------
def upload_batch_file(file_path: str):
    logger.info("Uploading batch file...")
    with open(file_path, "rb") as f:
        batch_file = client.files.create(
            file=f,
            purpose="batch"
        )
    logger.info(f"Batch file uploaded. File ID: {batch_file.id}")
    return batch_file.id

# --------------------------------------------------
# CREATE BATCH JOB
# --------------------------------------------------
def create_batch_job(input_file_id: str):
    logger.info("Creating batch job...")
    batch_job = client.batches.create(
        input_file_id=input_file_id,
        endpoint="/v1/chat/completions",
        completion_window="24h"
    )
    logger.info(f"Batch job created. Job ID: {batch_job.id}, initial status: {batch_job.status}")
    return batch_job.id

# --------------------------------------------------
# POLL BATCH JOB STATUS
# --------------------------------------------------
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

# --------------------------------------------------
# RETRIEVE RESULTS
# --------------------------------------------------
def retrieve_results(batch_job):
    if batch_job.status == "completed" and batch_job.output_file_id:
        logger.info("Batch job completed. Retrieving results...")
        result_content = client.files.content(batch_job.output_file_id).content
        with open(OUTPUT_FILE, "wb") as f:
            f.write(result_content)
        logger.info(f"Results saved to '{OUTPUT_FILE}'")
    else:
        logger.error(f"Batch job did not complete successfully. Final status: {batch_job.status}")
        if batch_job.error_file_id:
            logger.error("An error file is available for review.")

# --------------------------------------------------
# PARSE AND STORE RESULTS
# --------------------------------------------------
def parse_response_content(content: str):
    """
    Given a GPT response content string, parse out the sections.
    Returns a dict with keys: ai_heading, ai_background, ai_conclusion, key_terms.
    """
    lines = content.split("\n")
    ai_heading = ""
    ai_background = ""
    ai_conclusion = ""
    key_terms_lines = []
    recording_key_terms = False

    for line in lines:
        line = line.strip()
        if line.lower().startswith("**ai_heading:**"):
            ai_heading = line.split("**ai_heading:**", 1)[1].strip()
        elif line.lower().startswith("**ai_background:**"):
            ai_background = line.split("**ai_background:**", 1)[1].strip()
        elif line.lower().startswith("**ai_conclusion:**"):
            ai_conclusion = line.split("**ai_conclusion:**", 1)[1].strip()
        elif line.lower().startswith("**key_terms:**"):
            recording_key_terms = True
            key_terms_lines.append(line.split("**key_terms:**", 1)[1].strip())
        elif recording_key_terms:
            if line.startswith("**") or line == "":
                recording_key_terms = False
            else:
                key_terms_lines.append(line)
    key_terms = "\n".join(key_terms_lines)
    return {
        "ai_heading": ai_heading,
        "ai_background": ai_background,
        "ai_conclusion": ai_conclusion,
        "key_terms": key_terms
    }

def update_article_in_db(article_id: int, sections: dict):
    """
    Updates the article record in the database with the provided AI summary sections.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        update_query = """
            UPDATE articles
            SET ai_heading = ?,
                ai_background = ?,
                ai_conclusion = ?,
                key_terms = ?
            WHERE id = ?
        """
        cursor.execute(update_query, (
            sections.get("ai_heading", ""),
            sections.get("ai_background", ""),
            sections.get("ai_conclusion", ""),
            sections.get("key_terms", ""),
            article_id
        ))
        conn.commit()
        logger.info(f"Updated article ID {article_id} in the database.")
    except Exception as e:
        logger.error(f"Error updating article ID {article_id}: {e}")
    finally:
        conn.close()

def process_batch_results():
    """
    Reads the batch results JSONL file, parses each line to extract the GPT response,
    and updates the corresponding article in the database.
    Expects custom_id format "drug<drugId>_article<articleId>".
    """
    if not os.path.exists(OUTPUT_FILE):
        logger.error(f"Result file '{OUTPUT_FILE}' does not exist.")
        return

    with open(OUTPUT_FILE, "r", encoding="utf-8") as file:
        lines = file.readlines()

    processed_count = 0
    for line in lines:
        try:
            result = json.loads(line.strip())
            custom_id = result.get("custom_id", "")
            # Extract article_id from custom_id, assuming format "drug{drugId}_article{articleId}"
            parts = custom_id.split("_")
            article_part = [p for p in parts if p.startswith("article")]
            if not article_part:
                logger.warning(f"Custom ID {custom_id} does not contain article info. Skipping.")
                continue
            article_id = int(article_part[0].replace("article", ""))
            
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
            sections = parse_response_content(content)
            update_article_in_db(article_id, sections)
            processed_count += 1
        except Exception as e:
            logger.error(f"Error processing line: {e}")

    logger.info(f"Finished processing batch results. Updated {processed_count} articles.")

# --------------------------------------------------
# MAIN PROCESS: SEND, RECEIVE, PARSE, AND STORE
# --------------------------------------------------
if __name__ == "__main__":
    try:
        # Validate and upload batch file
        validate_batch_file(BATCH_FILE)
        input_file_id = upload_batch_file(BATCH_FILE)
        
        # Create and poll batch job
        batch_job_id = create_batch_job(input_file_id)
        final_job = poll_batch_status(batch_job_id)
        
        # Retrieve results from the batch job
        retrieve_results(final_job)
        
        # Process the results and update the database
        process_batch_results()
        
    except Exception as e:
        logger.error(f"Error during batch processing: {e}")
