import os
import sqlite3
import json
from openai import OpenAI
from supabase import create_client
from dotenv import load_dotenv
import numpy as np
import time

# Load environment variables
load_dotenv()

# Initialize clients
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Connect to local database
DB_FILE = "DB/pepsources.db"
conn = sqlite3.connect(DB_FILE)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

def generate_embeddings_in_batches():
    """
    Generate embeddings for all drugs in batches to minimize API calls.
    """
    # Fetch all drugs from local DB that need embeddings
    cursor.execute("""
        SELECT id, name, proper_name, what_it_does, how_it_works 
        FROM Drugs
        WHERE id NOT IN (SELECT id FROM drug_embeddings)
    """)
    drugs = [dict(row) for row in cursor.fetchall()]
    
    if not drugs:
        print("No new drugs need embeddings.")
        return
    
    print(f"Generating embeddings for {len(drugs)} drugs...")
    
    # Process in batches of 20 to reduce API calls
    BATCH_SIZE = 20
    for i in range(0, len(drugs), BATCH_SIZE):
        batch = drugs[i:i+BATCH_SIZE]
        batch_texts = []
        batch_ids = []
        
        # Prepare batch data
        for drug in batch:
            text_to_embed = f"{drug['proper_name']}. {drug['what_it_does'] or ''} {drug['how_it_works'] or ''}"
            batch_texts.append(text_to_embed)
            batch_ids.append(drug['id'])
        
        # Generate embeddings for the entire batch in a single API call
        response = client.embeddings.create(
            model="text-embedding-3-small",  # Cheaper model
            input=batch_texts
        )
        
        # Process and store embeddings
        embeddings_data = []
        for j, embedding_data in enumerate(response.data):
            drug = batch[j]
            
            embeddings_data.append({
                "id": drug['id'],
                "proper_name": drug['proper_name'],
                "what_it_does": drug['what_it_does'],
                "how_it_works": drug['how_it_works'],
                "embedding": embedding_data.embedding
            })
            
        # Upsert batch to Supabase
        try:
            supabase.table("drug_embeddings").upsert(embeddings_data).execute()
            print(f"Processed batch {i//BATCH_SIZE + 1}/{(len(drugs)-1)//BATCH_SIZE + 1}")
        except Exception as e:
            print(f"Error upserting embeddings batch: {e}")
        
        # Add a small delay between batches
        if i + BATCH_SIZE < len(drugs):
            time.sleep(1)

if __name__ == "__main__":
    generate_embeddings_in_batches()