#!/usr/bin/env python3
import sqlite3
import json
import os
import logging
from datetime import datetime
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from the .env file
load_dotenv()

# Initialize OpenAI client using the environment variable
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"
OUTPUT_FILE = "DB/Batch_requests/batch_input_summarization.jsonl"
MODEL = "gpt-4o"
MAX_TOKENS = 1000

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# --------------------------------------------------
# DATABASE FUNCTIONS
# --------------------------------------------------
def get_all_drugs():
    """
    Retrieves all drugs from the Drugs table.
    Returns a list of tuples (id, name, proper_name).
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, proper_name FROM Drugs ORDER BY id")
    drugs = cursor.fetchall()
    conn.close()
    logger.info(f"Found {len(drugs)} drugs in the database.")
    return drugs

def get_priority_articles_for_drug(drug_id, limit_total=5):
    """
    Retrieves up to `limit_total` articles for the given drug_id that have not been processed 
    (i.e. ai_heading is NULL or empty), ordered by the following priority:
      1. Articles with is_relevant = 1 and publication_type containing 'Clinical Trial'
      2. Articles with is_relevant = 1 (but not clinical trial)
      3. All other articles.
    Within each group, articles are ordered by publication_date DESC, then id DESC.
    Returns a list of tuples: (id, title, background, methods, conclusions).
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    query = """
        SELECT id, title, background, methods, conclusions
        FROM articles
        WHERE drug_id = ?
          AND (ai_heading IS NULL OR ai_heading = '')
        ORDER BY 
          CASE 
            WHEN is_relevant = 1 AND publication_type LIKE '%Clinical Trial%' THEN 1
            WHEN is_relevant = 1 THEN 2
            ELSE 3
          END,
          publication_date DESC,
          id DESC
        LIMIT ?
    """
    cursor.execute(query, (drug_id, limit_total))
    articles = cursor.fetchall()
    conn.close()
    logger.info(f"Drug ID {drug_id}: Retrieved {len(articles)} prioritized articles.")
    return articles

# --------------------------------------------------
# PROMPT CREATION FUNCTION
# --------------------------------------------------
def create_prompt(title, background, methods, conclusions):
    """
    Constructs the summarization prompt for an article.
    The prompt instructs the model to produce:
      - A detailed AI Heading,
      - A detailed AI Background,
      - A simplified one-sentence AI Conclusion,
      - And a list of 2–3 key terms with very simple one-sentence definitions.
    """
    methods_text = methods.strip() if methods.strip() else "Not provided."
    conclusions_text = conclusions.strip() if conclusions.strip() else "Not provided."
    
    prompt = f"""Rewrite this study summary in a detailed and comprehensive manner that is **extremely easy to understand**.
Include relevant figures and numerical data where available, using a "~" to indicate approximate values.
Additionally, list 2–3 key terms that are important to the study and provide very simple, one-sentence definitions for each.

Follow the exact format below:

**ai_heading:** A one-to-two sentence summary of the study's primary goal, including any relevant numerical data.
**ai_background:** A simplified explanation of the study's purpose, defining key terms and providing context with figures.
**ai_conclusion:** A simplified one-sentence summary of the key findings.
**key_terms:** List 2–3 key terms along with very simple one-sentence definitions.

Title: {title}
Background: {background}
Methods: {methods_text}
Conclusions: {conclusions_text}"""
    return prompt

# --------------------------------------------------
# BATCH REQUEST CREATION
# --------------------------------------------------
def create_batch_requests():
    """
    Creates a JSONL batch file containing one request per article.
    For each drug, retrieves up to 5 prioritized articles (using is_relevant and publication_type)
    that have not been processed, and creates a batch request for summarizing the article using the Chat Completions API.
    """
    logger.info("Starting batch request creation process.")
    drugs = get_all_drugs()
    if not drugs:
        logger.error("No drugs found in the database.")
        return

    tasks = []
    total_requests = 0

    for drug in drugs:
        drug_id, drug_name, drug_proper_name = drug
        logger.info(f"Processing drug '{drug_name}' (ID: {drug_id}).")
        articles = get_priority_articles_for_drug(drug_id, limit_total=5)
        if not articles:
            logger.info(f"No eligible articles found for drug ID {drug_id}.")
            continue

        for article in articles:
            article_id, title, background, methods, conclusions = article
            prompt = create_prompt(title, background, methods, conclusions)
            custom_id = f"drug{drug_id}_article{article_id}"
            logger.info(f"Creating batch request with custom_id: {custom_id}")
            
            request_obj = {
                "custom_id": custom_id,
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": MODEL,
                    "messages": [
                        {
                            "role": "developer",
                            "content": "You simplify complex research articles into detailed, easy-to-understand summaries with contextualized figures and clear, simple definitions of key terms."
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
            logger.info(f"Batch request {custom_id} created for article ID {article_id} (Drug ID {drug_id}).")
    
    logger.info(f"Total batch requests created: {total_requests}")
    
    try:
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            for task in tasks:
                json_line = json.dumps(task)
                f.write(json_line + "\n")
        logger.info(f"Batch file '{OUTPUT_FILE}' created with {total_requests} requests.")
    except Exception as e:
        logger.error(f"Error writing batch file: {e}")

# --------------------------------------------------
# MAIN
# --------------------------------------------------
if __name__ == "__main__":
    create_batch_requests()
    print(f"Batch input file '{OUTPUT_FILE}' created.")