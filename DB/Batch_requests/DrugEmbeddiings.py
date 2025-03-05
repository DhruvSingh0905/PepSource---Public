#!/usr/bin/env python3
import os
import sqlite3
import json
import logging
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("drug_name_embeddings")

# Initialize clients
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")

# Database paths
DB_FILE = "DB/pepsources.db"
BATCH_FILE = "DB/Batch_requests/name_embeddings_batch_input.jsonl"
OUTPUT_FILE = "DB/Batch_requests/name_embeddings_batch_output.jsonl"
MODEL = "text-embedding-3-small"  # Cost-efficient model for embeddings

# Create name_embedding column in local SQLite database
def create_local_embedding_column():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get existing columns in the Drugs table
    cursor.execute("PRAGMA table_info(Drugs)")
    columns = [info[1] for info in cursor.fetchall()]
    
    # Add name_embedding column if it doesn't already exist
    if 'name_embedding' not in columns:
        try:
            cursor.execute("ALTER TABLE Drugs ADD COLUMN name_embedding TEXT DEFAULT NULL")
            logger.info("Added column 'name_embedding' to Drugs table in SQLite")
            conn.commit()
        except sqlite3.Error as e:
            logger.error(f"Error adding column 'name_embedding': {e}")
    else:
        logger.info("Column 'name_embedding' already exists in Drugs table in SQLite")
    
    conn.close()

# Create structure in Supabase
def create_supabase_structure():
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # SQL to set up the necessary infrastructure
        sql_query = """
        -- Add the name_embedding column to drugs table if it doesn't exist
        ALTER TABLE drugs ADD COLUMN IF NOT EXISTS name_embedding vector(1536);
        
        -- Create a separate table for name embeddings if it doesn't exist
        CREATE TABLE IF NOT EXISTS drug_name_embeddings (
            id BIGINT REFERENCES drugs(id),
            name TEXT,
            proper_name TEXT,
            name_embedding VECTOR(1536),
            PRIMARY KEY (id)
        );
        
        -- Create a function for similarity search
        CREATE OR REPLACE FUNCTION match_drug_names(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
        RETURNS TABLE (
            id BIGINT,
            name TEXT,
            proper_name TEXT,
            similarity FLOAT
        )
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RETURN QUERY
            SELECT
                drug_name_embeddings.id,
                drug_name_embeddings.name,
                drug_name_embeddings.proper_name,
                1 - (drug_name_embeddings.name_embedding <=> query_embedding) AS similarity
            FROM drug_name_embeddings
            WHERE 1 - (drug_name_embeddings.name_embedding <=> query_embedding) > match_threshold
            ORDER BY similarity DESC
            LIMIT match_count;
        END;
        $$;
        """
        
        # Execute SQL directly
        conn = supabase.postgrest.connection
        conn.execute(sql_query)
        logger.info("Successfully created vector search infrastructure in Supabase")
            
    except Exception as e:
        logger.error(f"Error ensuring Supabase embedding structure: {e}")
        raise

# Create a batch file for drug name embeddings
def create_batch_file():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, proper_name
        FROM Drugs
        WHERE name_embedding IS NULL AND name IS NOT NULL
        ORDER BY id
    """)
    drugs = cursor.fetchall()
    conn.close()
    
    logger.info(f"Found {len(drugs)} drugs that need name embeddings")
    
    if not drugs:
        logger.info("No drugs need name embeddings. Skipping batch file creation.")
        return
    
    batch_requests = []
    for drug_id, name, proper_name in drugs:
        text_to_embed = f"{name.lower() if name else ''} {proper_name if proper_name else ''}"
        request_obj = {
            "custom_id": f"drug{drug_id}_name_embedding",
            "method": "POST",
            "url": "/v1/embeddings",
            "body": {
                "model": MODEL,
                "input": text_to_embed
            }
        }
        batch_requests.append(request_obj)
    
    try:
        with open(BATCH_FILE, "w", encoding="utf-8") as f:
            for request in batch_requests:
                f.write(json.dumps(request) + "\n")
        
        logger.info(f"Created batch file with {len(batch_requests)} requests at {BATCH_FILE}")
    except Exception as e:
        logger.error(f"Error creating batch file: {e}")

if __name__ == "__main__":
    try:
        # Create local column
        create_local_embedding_column()
        
        # Create Supabase structure
        create_supabase_structure()
        
        # Create batch file for processing
        create_batch_file()
        
        logger.info("Setup completed successfully")
    except Exception as e:
        logger.error(f"Error in setup: {e}")