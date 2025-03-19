#!/usr/bin/env python3
import os
import json
import sqlite3
import logging
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
load_dotenv()

# Configuration
DB_FILE = "DB/pepsources.db"
BATCH_RESULTS_FILE = "DB/Batch_requests/drug_definitions_rewrite_results.jsonl"
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("json_extractor")

def extract_definitions(content):
    """
    Extract what_it_does and how_it_works from the GPT response content.
    Works with both complete and truncated responses.
    """
    # Strip content to handle leading/trailing whitespace
    content = content.strip()
    
    # Check if content has backticks and looks like JSON
    if "```" in content and "{" in content and "what_it_does" in content:
        # Remove backticks and any language identifier
        content = content.replace("```json", "").replace("```", "").strip()
        
        # Fix any truncated JSON by adding a closing bracket if needed
        if content.count("{") > content.count("}"):
            content += '}'
            
        # Try to parse as JSON
        try:
            data = json.loads(content)
            return data
        except json.JSONDecodeError as e:
            logger.warning(f"JSON parsing error: {e}")
            # If JSON parsing fails, try direct extraction
            
    # Direct extraction approach for problematic cases
    what_it_does = None
    how_it_works = None
    
    # Look for the what_it_does field
    if '"what_it_does":' in content:
        # Find the start position 
        start_pos = content.find('"what_it_does":') + len('"what_it_does":')
        # Find the content after the colon
        content_after = content[start_pos:].strip()
        # If it starts with a quote, extract until the next quote that's followed by comma or }
        if content_after.startswith('"'):
            # Extract everything between quotes
            end_quote_pos = content_after.find('",', 1)
            if end_quote_pos == -1:
                end_quote_pos = content_after.find('"}', 1)
            
            if end_quote_pos != -1:
                what_it_does = content_after[1:end_quote_pos]
    
    # Look for the how_it_works field
    if '"how_it_works":' in content:
        # Find the start position
        start_pos = content.find('"how_it_works":') + len('"how_it_works":')
        # Find the content after the colon
        content_after = content[start_pos:].strip()
        # If it starts with a quote, extract until the next quote that's followed by comma or }
        if content_after.startswith('"'):
            # Extract everything between quotes
            end_quote_pos = content_after.find('",', 1)
            if end_quote_pos == -1:
                end_quote_pos = content_after.find('"}', 1)
            
            if end_quote_pos != -1:
                how_it_works = content_after[1:end_quote_pos]
            else:
                # For truncated responses, take everything until the end
                how_it_works = content_after[1:]
    
    # If either approach worked, return the results
    if what_it_does or how_it_works:
        return {
            "what_it_does": what_it_does or "",
            "how_it_works": how_it_works or ""
        }
    
    return None

def update_databases(drug_id, definitions):
    """Update both local SQLite database and Supabase."""
    local_success = False
    supabase_success = False
    
    # 1. Update local database
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE Drugs
            SET what_it_does = ?, how_it_works = ?
            WHERE id = ?
        """, (
            definitions.get("what_it_does", ""),
            definitions.get("how_it_works", ""),
            drug_id
        ))
        
        if cursor.rowcount > 0:
            conn.commit()
            local_success = True
            logger.info(f"Updated drug ID {drug_id} in local database")
        else:
            logger.warning(f"No rows affected for drug ID {drug_id} in local database")
        
        conn.close()
    except Exception as e:
        logger.error(f"Error updating local database: {e}")
    
    # 2. Update Supabase
    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        try:
            supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
            
            update_data = {
                "id": drug_id,
                "what_it_does": definitions.get("what_it_does", ""),
                "how_it_works": definitions.get("how_it_works", "")
            }
            
            logger.info(f"Updating Supabase for drug ID {drug_id}...")
            response = supabase.table("drugs").upsert(update_data).execute()
            
            if not getattr(response, 'error', None):
                supabase_success = True
                logger.info(f"Updated drug ID {drug_id} in Supabase")
            else:
                logger.error(f"Error upserting to Supabase: {response.error}")
        except Exception as e:
            logger.error(f"Error updating Supabase: {e}")
    
    return local_success, supabase_success

def process_file():
    """Process the batch results file and update databases."""
    if not os.path.exists(BATCH_RESULTS_FILE):
        logger.error(f"Batch results file not found: {BATCH_RESULTS_FILE}")
        return
    
    with open(BATCH_RESULTS_FILE, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]
    
    logger.info(f"Found {len(lines)} batch results to process")
    
    local_updates = 0
    supabase_updates = 0
    
    for i, line in enumerate(lines):
        try:
            # Parse the batch result line
            result = json.loads(line)
            custom_id = result.get("custom_id", "")
            
            if not custom_id.startswith("drug"):
                logger.warning(f"Skipping non-drug custom_id: {custom_id}")
                continue
            
            drug_id = int(custom_id.replace("drug", ""))
            
            # Get the response data
            response = result.get("response", {})
            if response.get("status_code") != 200:
                logger.warning(f"Skipping non-200 response for drug ID {drug_id}")
                continue
            
            body = response.get("body", {})
            choices = body.get("choices", [])
            
            if not choices:
                logger.warning(f"No choices found for drug ID {drug_id}")
                continue
            
            content = choices[0].get("message", {}).get("content", "")
            
            if not content:
                logger.warning(f"No content found for drug ID {drug_id}")
                continue
            
            # Extract definitions
            definitions = extract_definitions(content)
            
            if not definitions:
                logger.error(f"Failed to extract definitions for drug ID {drug_id}")
                # Let's print the content to debug
                logger.error(f"Content: {content[:100]}...")
                continue
            
            # Update databases
            local_success, supabase_success = update_databases(drug_id, definitions)
            
            if local_success:
                local_updates += 1
            
            if supabase_success:
                supabase_updates += 1
            
            # Print progress every 10 items
            if (i + 1) % 10 == 0:
                logger.info(f"Processed {i + 1}/{len(lines)} items")
        
        except Exception as e:
            logger.error(f"Error processing line: {e}")
    
    logger.info(f"Successfully updated {local_updates}/{len(lines)} drugs in local database")
    logger.info(f"Successfully updated {supabase_updates}/{len(lines)} drugs in Supabase")

if __name__ == "__main__":
    logger.info("Starting batch processing...")
    process_file()
    logger.info("Batch processing completed")