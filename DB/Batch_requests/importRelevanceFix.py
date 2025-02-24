#!/usr/bin/env python3
import os
import json
import sqlite3
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"               # Path to your SQLite DB
OUTPUT_FILE = "batch_job_results.jsonl"     # Batch results file

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def update_article_relevance(article_id: int, is_relevant: int):
    """
    Updates the article record in the database by setting the is_relevant column.
    """
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        update_query = "UPDATE articles SET is_relevant = ? WHERE id = ?"
        cursor.execute(update_query, (is_relevant, article_id))
        conn.commit()
        logger.info(f"Updated article ID {article_id} with is_relevant = {is_relevant}.")
    except Exception as e:
        logger.error(f"Error updating article ID {article_id}: {e}")
    finally:
        conn.close()

def parse_response_content(content: str) -> int:
    """
    Parses the GPT response content.
    Expects a single digit (0 or 1) in the response.
    Returns the integer value if found, or raises an exception.
    """
    stripped = content.strip()
    # Look for the first character that is either '0' or '1'
    for char in stripped:
        if char in ("0", "1"):
            return int(char)
    raise ValueError(f"Unexpected GPT response format: {content}")

def process_batch_results():
    """
    Reads the batch results JSONL file, parses each line to extract the GPT response,
    and updates the corresponding article's is_relevant column in the database.
    
    Expects custom_id in the format "article{article_id}".
    """
    if not os.path.exists(OUTPUT_FILE):
        logger.error(f"Result file '{OUTPUT_FILE}' does not exist.")
        return

    processed_count = 0
    with open(OUTPUT_FILE, "r", encoding="utf-8") as file:
        for line in file:
            try:
                result = json.loads(line.strip())
                custom_id = result.get("custom_id", "")
                if not custom_id.startswith("article"):
                    logger.warning(f"Custom ID {custom_id} does not start with 'article'. Skipping.")
                    continue

                # Extract article ID: assuming format "article{article_id}"
                try:
                    article_id = int(custom_id[len("article"):])
                except ValueError:
                    logger.error(f"Could not parse article ID from custom ID '{custom_id}'. Skipping.")
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
                try:
                    relevance = parse_response_content(content)
                except Exception as parse_e:
                    logger.error(f"Error parsing response for {custom_id}: {parse_e}")
                    continue

                update_article_relevance(article_id, relevance)
                processed_count += 1

            except Exception as e:
                logger.error(f"Error processing line: {e}")

    logger.info(f"Finished processing batch results. Updated {processed_count} articles.")

if __name__ == "__main__":
    process_batch_results()
