#!/usr/bin/env python3
import os
import re
import json
import logging
import sqlite3
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Initialize OpenAI client using the environment variable
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = "gpt-4o"  # Your model to use
MAX_TOKENS = 10    # We only expect a one-digit response

# Configuration for our batch file output
DB_FILE = "DB/pepsources.db"
OUTPUT_FILE = "DB/Batch_requests/relevance_batch_input.jsonl"

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def get_articles_missing_relevance():
    """
    Retrieves all articles from the Articles table that have no relevance flag (is_relevant IS NULL).
    Returns a list of tuples (id, title).
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, title FROM articles WHERE is_relevant IS NULL ORDER BY id")
    articles = cursor.fetchall()
    conn.close()
    logger.info(f"Found {len(articles)} articles missing relevance flag.")
    return articles

def create_relevance_prompt(title: str) -> str:
    """
    Constructs a prompt for GPT to decide if an article is relevant for a customer
    interested in understanding the effects of a drug.
    
    The prompt instructs GPT to answer with a single digit:
      - 1 if the study is relevant (for example, if it uses human or in vivo data applicable to human health)
      - 0 if the study is not relevant (for example, if it is focused on in vitro experiments or mechanistic details unlikely to help a customer).
    
    Returns the constructed prompt string.
    """
    prompt = (
        "Based solely on the following study title, determine if this study is relevant for a customer who wants to understand "
        "the effects of the drug. If the study appears to be directly applicable to human health (e.g. clinical trials or in vivo research), "
        "answer with 1. If the study is focused on basic biochemical or in vitro details not directly relevant to human application, "
        "answer with 0. Provide only a single digit (0 or 1) with no additional text.\n\n"
        f"Title: {title}"
    )
    return prompt

def create_relevance_batch_requests():
    """
    Creates a JSONL batch file where each line corresponds to a request for GPT to decide the relevance of an article.
    Each request includes:
      - A custom_id in the format "article{article_id}"
      - A POST request to /v1/chat/completions
      - A message set containing a default system prompt plus the relevance prompt built from the article title.
    The resulting file is written to OUTPUT_FILE.
    """
    logger.info("Starting creation of relevance batch requests.")
    articles = get_articles_missing_relevance()
    if not articles:
        logger.error("No articles found missing relevance flag.")
        return

    tasks = []
    total_requests = 0

    for article in articles:
        article_id, title = article
        prompt = create_relevance_prompt(title)
        custom_id = f"article{article_id}"
        logger.info(f"Creating batch request {custom_id} for article title: {title[:50]}{'...' if len(title) > 50 else ''}")
        request_obj = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": MODEL,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are an expert in evaluating scientific studies. Your task is to decide whether a study is relevant for a customer interested in understanding the effects of a drug."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                "max_tokens": MAX_TOKENS
            }
        }
        tasks.append(request_obj)
        total_requests += 1

    logger.info(f"Total batch requests created: {total_requests}")

    try:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            for task in tasks:
                json_line = json.dumps(task)
                f.write(json_line + "\n")
        logger.info(f"Batch file '{OUTPUT_FILE}' created with {total_requests} requests.")
    except Exception as e:
        logger.error(f"Error writing batch file: {e}")

if __name__ == "__main__":
    create_relevance_batch_requests()
    print(f"Batch input file '{OUTPUT_FILE}' created.")