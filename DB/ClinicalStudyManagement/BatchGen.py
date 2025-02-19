import sqlite3
import json
import os
import logging
from datetime import datetime

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"
OUTPUT_FILE = "batch_input.jsonl"

# Set the model to use
MODEL = "gpt-4o"

# Maximum tokens for the completion
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
    return drugs

def get_newest_articles_for_drug(drug_id, limit=3):
    """
    Retrieves up to the 'limit' newest articles for the given drug_id.
    Assumes articles.publication_date is in a sortable format (e.g. ISO 8601).
    If publication_date is NULL or not set, orders by id descending.
    Returns a list of tuples for each article.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Try to order by publication_date (if available) then by id
    query = """
        SELECT id, title, background, methods, conclusions
        FROM articles
        WHERE drug_id = ?
        ORDER BY 
            CASE 
                WHEN publication_date IS NOT NULL AND publication_date <> '' THEN publication_date 
                ELSE '0000-00-00'
            END DESC,
            id DESC
        LIMIT ?
    """
    cursor.execute(query, (drug_id, limit))
    articles = cursor.fetchall()
    conn.close()
    return articles

# --------------------------------------------------
# PROMPT CREATION FUNCTION
# --------------------------------------------------
def create_prompt(title, background, methods, conclusions):
    """
    Constructs the prompt for the article request.
    Uses the following template:
    
    Rewrite this study summary in a detailed and comprehensive manner that is **extremely easy to understand**.
    Include relevant figures and numerical data where available, using a "~" to indicate approximate values.
    Additionally, list 2–3 key terms that are important to the study and provide very simple, one-sentence definitions for each.
    
    Follow the exact format below:
    
    **ai_heading:** A one-to-two sentence summary of the study's primary goal, including any relevant numerical data.
    **ai_background:** A detailed explanation of the study's purpose, defining key terms and providing context with figures.
    **ai_conclusion:** A simplified one-sentence summary of the key findings.
    **key_terms:** List 2–3 key terms along with very simple one-sentence definitions.
    
    Title: {title}
    Background: {background}
    Methods: {methods_text}
    Conclusions: {conclusions_text}
    """
    methods_text = methods.strip() if methods.strip() else "Not provided."
    conclusions_text = conclusions.strip() if conclusions.strip() else "Not provided."
    
    prompt = f"""Rewrite this study summary in a detailed and comprehensive manner that is **extremely easy to understand**.
Include relevant figures and numerical data where available, using a "~" to indicate approximate values.
Additionally, list 2–3 key terms that are important to the study and provide very simple, one-sentence definitions for each.

Follow the exact format below:

**ai_heading:** A one-to-two sentence summary of the study's primary goal, including any relevant numerical data.
**ai_background:** A detailed explanation of the study's purpose, defining key terms and providing context with figures.
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
    Creates batch request entries for the 3 newest articles per drug.
    Writes a JSONL file where each line is a request to the /v1/chat/completions endpoint.
    """
    drugs = get_all_drugs()
    if not drugs:
        logger.error("No drugs found in the database.")
        return

    requests = []
    request_count = 0

    for drug in drugs:
        drug_id, drug_name, drug_proper_name = drug
        logger.info(f"Processing drug '{drug_name}' (ID: {drug_id})")
        articles = get_newest_articles_for_drug(drug_id, limit=3)
        if not articles:
            logger.info(f"No articles found for drug ID {drug_id}.")
            continue

        for article in articles:
            article_id, title, background, methods, conclusions = article
            prompt = create_prompt(title, background, methods, conclusions)
            
            # Build a unique custom_id for this request
            custom_id = f"drug{drug_id}_article{article_id}"
            
            # Build the request JSON object
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
            requests.append(request_obj)
            request_count += 1
            logger.info(f"Created batch request {custom_id} for article ID {article_id} of drug ID {drug_id}.")

    # Write the batch requests to a .jsonl file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as outfile:
        for req in requests:
            json_line = json.dumps(req)
            outfile.write(json_line + "\n")
    
    logger.info(f"Batch file '{OUTPUT_FILE}' created with {request_count} requests.")

# --------------------------------------------------
# MAIN
# --------------------------------------------------
if __name__ == "__main__":
    create_batch_requests()
    print(f"Batch input file '{OUTPUT_FILE}' created.")