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

def ensure_embedding_tables_exist():
    """
    Ensures the necessary tables exist in both local DB and Supabase
    with the combined_embedding column added
    """
    # Local DB check and creation
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS drug_embeddings (
        id INTEGER PRIMARY KEY,
        drug_id INTEGER,
        proper_name TEXT,
        what_it_does TEXT,
        how_it_works TEXT,
        embedding TEXT,
        articles_embedding TEXT,
        combined_embedding TEXT,
        FOREIGN KEY (drug_id) REFERENCES Drugs(id)
    )
    """)
    
    # Check if combined_embedding column exists in local DB
    cursor.execute("PRAGMA table_info(drug_embeddings)")
    columns = [info[1] for info in cursor.fetchall()]
    if "combined_embedding" not in columns:
        cursor.execute("ALTER TABLE drug_embeddings ADD COLUMN combined_embedding TEXT")
        print("Added combined_embedding column to local DB")
    
    conn.commit()
    print("Checked/created drug_embeddings table in local DB")
    
    # Supabase table check and creation
    try:
        # First check if the table exists by querying it
        supabase.table("drug_embeddings").select("id").limit(1).execute()
        print("drug_embeddings table exists in Supabase")
        
        # Add combined_embedding column if it doesn't exist
        # Note: This requires appropriate Supabase permissions to run ALTER TABLE
        try:
            sql_query = """
            ALTER TABLE drug_embeddings ADD COLUMN IF NOT EXISTS combined_embedding VECTOR(1536);
            
            CREATE OR REPLACE FUNCTION match_drugs_combined(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
            RETURNS TABLE (
                id BIGINT,
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
                    drug_embeddings.id,
                    drug_embeddings.proper_name,
                    drug_embeddings.what_it_does,
                    drug_embeddings.how_it_works,
                    1 - (drug_embeddings.combined_embedding <=> query_embedding) AS similarity
                FROM drug_embeddings
                WHERE drug_embeddings.combined_embedding IS NOT NULL
                AND 1 - (drug_embeddings.combined_embedding <=> query_embedding) > match_threshold
                ORDER BY similarity DESC
                LIMIT match_count;
            END;
            $$;
            """
            conn = supabase.postgrest.connection
            conn.execute(sql_query)
            print("Successfully added combined_embedding column and search function in Supabase")
        except Exception as e:
            print(f"Note: Could not add column to Supabase table: {e}")
            
    except Exception:
        print("Creating drug_embeddings table in Supabase...")
        sql_query = """
        CREATE TABLE IF NOT EXISTS drug_embeddings (
            id BIGINT PRIMARY KEY,
            proper_name TEXT,
            what_it_does TEXT,
            how_it_works TEXT,
            embedding VECTOR(1536),
            articles_embedding VECTOR(1536),
            combined_embedding VECTOR(1536)
        );
        
        CREATE OR REPLACE FUNCTION match_drugs(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
        RETURNS TABLE (
            id BIGINT,
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
                drug_embeddings.id,
                drug_embeddings.proper_name,
                drug_embeddings.what_it_does,
                drug_embeddings.how_it_works,
                1 - (drug_embeddings.embedding <=> query_embedding) AS similarity
            FROM drug_embeddings
            WHERE 1 - (drug_embeddings.embedding <=> query_embedding) > match_threshold
            ORDER BY similarity DESC
            LIMIT match_count;
        END;
        $$;
        
        CREATE OR REPLACE FUNCTION match_drugs_with_articles(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
        RETURNS TABLE (
            id BIGINT,
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
                drug_embeddings.id,
                drug_embeddings.proper_name,
                drug_embeddings.what_it_does,
                drug_embeddings.how_it_works,
                1 - (drug_embeddings.articles_embedding <=> query_embedding) AS similarity
            FROM drug_embeddings
            WHERE drug_embeddings.articles_embedding IS NOT NULL
            AND 1 - (drug_embeddings.articles_embedding <=> query_embedding) > match_threshold
            ORDER BY similarity DESC
            LIMIT match_count;
        END;
        $$;
        
        CREATE OR REPLACE FUNCTION match_drugs_combined(query_embedding VECTOR(1536), match_threshold FLOAT, match_count INT)
        RETURNS TABLE (
            id BIGINT,
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
                drug_embeddings.id,
                drug_embeddings.proper_name,
                drug_embeddings.what_it_does,
                drug_embeddings.how_it_works,
                1 - (drug_embeddings.combined_embedding <=> query_embedding) AS similarity
            FROM drug_embeddings
            WHERE drug_embeddings.combined_embedding IS NOT NULL
            AND 1 - (drug_embeddings.combined_embedding <=> query_embedding) > match_threshold
            ORDER BY similarity DESC
            LIMIT match_count;
        END;
        $$;
        """
        conn = supabase.postgrest.connection
        conn.execute(sql_query)
        print("Successfully created drug_embeddings table and search functions in Supabase")

def get_drug_article_text(drug_id):
    """
    Retrieves concatenated article text for a drug
    """
    cursor.execute("""
    SELECT title, background, conclusions, ai_heading, ai_background, ai_conclusion 
    FROM articles 
    WHERE drug_id = ? AND is_relevant = 1 
    ORDER BY order_num 
    LIMIT 5
    """, (drug_id,))
    
    articles = cursor.fetchall()
    if not articles:
        return None
    
    # Concatenate article data with clear section markers
    article_texts = []
    for article in articles:
        article_text = f"TITLE: {article['title'] or ''}\n"
        article_text += f"BACKGROUND: {article['background'] or ''}\n"
        article_text += f"CONCLUSIONS: {article['conclusions'] or ''}\n"
        article_text += f"AI SUMMARY: {article['ai_heading'] or ''}\n"
        article_texts.append(article_text)
    
    # Join all articles with separators
    combined_text = "\n---\n".join(article_texts)
    
    # Truncate if very long to fit in embedding context
    if len(combined_text) > 8000:
        combined_text = combined_text[:8000]
    
    return combined_text

def combine_embeddings(embedding1, embedding2, weight1=0.6, weight2=0.4):
    """
    Combine two embeddings with weighted average.
    Default weights give slightly more importance to the main drug embedding.
    """
    if embedding1 is None:
        return embedding2
    if embedding2 is None:
        return embedding1
    
    # Convert to numpy arrays
    vec1 = np.array(embedding1)
    vec2 = np.array(embedding2)
    
    # Create weighted average
    combined = (weight1 * vec1 + weight2 * vec2) / (weight1 + weight2)
    
    # Normalize to unit length
    norm = np.linalg.norm(combined)
    if norm > 0:
        combined = combined / norm
        
    return combined.tolist()

def generate_embeddings_in_batches():
    """
    Generate embeddings for all drugs in batches to minimize API calls.
    Also generates separate embeddings including article content and a combined embedding.
    """
    # Ensure tables exist
    ensure_embedding_tables_exist()
    
    # Fetch all drugs from local DB that need embeddings
    cursor.execute("""
        SELECT d.id, d.name, d.proper_name, d.what_it_does, d.how_it_works 
        FROM Drugs d
        WHERE d.id NOT IN (SELECT drug_id FROM drug_embeddings)
        AND d.proper_name IS NOT NULL
    """)
    drugs_needing_embeddings = [dict(row) for row in cursor.fetchall()]
    
    # Fetch drugs that might need combined embeddings (have both embeddings but no combined)
    cursor.execute("""
        SELECT drug_id, embedding, articles_embedding 
        FROM drug_embeddings 
        WHERE embedding IS NOT NULL 
        AND articles_embedding IS NOT NULL 
        AND combined_embedding IS NULL
    """)
    drugs_needing_combined = [dict(row) for row in cursor.fetchall()]
    
    if not drugs_needing_embeddings and not drugs_needing_combined:
        print("No new embeddings or combined embeddings needed.")
        return
    
    # Process drugs needing combined embeddings first
    if drugs_needing_combined:
        print(f"Creating combined embeddings for {len(drugs_needing_combined)} existing drugs...")
        
        for drug in drugs_needing_combined:
            try:
                # Parse the embeddings
                embedding = json.loads(drug['embedding'])
                articles_embedding = json.loads(drug['articles_embedding'])
                
                # Create combined embedding
                combined_embedding = combine_embeddings(embedding, articles_embedding)
                
                # Update local DB
                cursor.execute("""
                UPDATE drug_embeddings 
                SET combined_embedding = ? 
                WHERE drug_id = ?
                """, (json.dumps(combined_embedding), drug['drug_id']))
                
                # Update Supabase
                supabase.table("drug_embeddings").update({
                    "combined_embedding": combined_embedding
                }).eq("id", drug['drug_id']).execute()
                
                print(f"Created combined embedding for drug ID {drug['drug_id']}")
            except Exception as e:
                print(f"Error creating combined embedding for drug ID {drug['drug_id']}: {e}")
        
        conn.commit()
    
    # Process drugs needing new embeddings
    if drugs_needing_embeddings:
        print(f"Generating embeddings for {len(drugs_needing_embeddings)} new drugs...")
        
        # Process in batches of 20 to reduce API calls
        BATCH_SIZE = 20
        for i in range(0, len(drugs_needing_embeddings), BATCH_SIZE):
            batch = drugs_needing_embeddings[i:i+BATCH_SIZE]
            
            # Prepare batch data for main embeddings
            main_batch_texts = []
            batch_ids = []
            article_batch_texts = []
            has_articles = []
            
            for drug in batch:
                # Text for main drug embedding
                main_text = f"{drug['proper_name']}. {drug['what_it_does'] or ''} {drug['how_it_works'] or ''}"
                main_batch_texts.append(main_text)
                
                # Get article text
                article_text = get_drug_article_text(drug['id'])
                if article_text:
                    # Combined text for article-enhanced embedding
                    article_batch_texts.append(f"{main_text}\n\nRELATED RESEARCH:\n{article_text}")
                    has_articles.append(True)
                else:
                    # If no articles, we'll use None as a placeholder
                    article_batch_texts.append(None)
                    has_articles.append(False)
                
                batch_ids.append(drug['id'])
            
            # Generate main embeddings for the entire batch in a single API call
            main_response = client.embeddings.create(
                model="text-embedding-3-small",
                input=main_batch_texts
            )
            
            # Generate article embeddings only for drugs that have articles
            article_embeddings = {}
            article_texts_to_embed = [text for text in article_batch_texts if text is not None]
            article_indices = [j for j, has_article in enumerate(has_articles) if has_article]
            
            if article_texts_to_embed:
                article_response = client.embeddings.create(
                    model="text-embedding-3-small",
                    input=article_texts_to_embed
                )
                
                # Map article embeddings back to their drugs
                for idx, embedding_data in enumerate(article_response.data):
                    drug_idx = article_indices[idx]
                    drug_id = batch_ids[drug_idx]
                    article_embeddings[drug_id] = embedding_data.embedding
            
            # Process and store embeddings
            for j, embedding_data in enumerate(main_response.data):
                drug = batch[j]
                drug_id = drug['id']
                
                # Get article embedding if it exists
                article_embedding = article_embeddings.get(drug_id)
                
                # Create combined embedding if both embeddings exist
                combined_embedding = None
                if article_embedding:
                    combined_embedding = combine_embeddings(embedding_data.embedding, article_embedding)
                
                # Store in local DB
                article_embedding_json = json.dumps(article_embedding) if article_embedding else None
                combined_embedding_json = json.dumps(combined_embedding) if combined_embedding else None
                
                cursor.execute("""
                INSERT INTO drug_embeddings 
                (drug_id, proper_name, what_it_does, how_it_works, embedding, articles_embedding, combined_embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    drug_id,
                    drug['proper_name'],
                    drug['what_it_does'],
                    drug['how_it_works'],
                    json.dumps(embedding_data.embedding),
                    article_embedding_json,
                    combined_embedding_json
                ))
                
                # Prepare for Supabase
                embedding_record = {
                    "id": drug_id,
                    "proper_name": drug['proper_name'],
                    "what_it_does": drug['what_it_does'],
                    "how_it_works": drug['how_it_works'],
                    "embedding": embedding_data.embedding
                }
                
                # Add additional embeddings if they exist
                if article_embedding:
                    embedding_record["articles_embedding"] = article_embedding
                if combined_embedding:
                    embedding_record["combined_embedding"] = combined_embedding
                
                # Upsert to Supabase
                try:
                    supabase.table("drug_embeddings").upsert([embedding_record]).execute()
                except Exception as e:
                    print(f"Error upserting embedding for drug {drug_id}: {e}")
            
            # Commit local DB changes for this batch
            conn.commit()
            print(f"Processed batch {i//BATCH_SIZE + 1}/{(len(drugs_needing_embeddings)-1)//BATCH_SIZE + 1}")
            
            # Add a small delay between batches
            if i + BATCH_SIZE < len(drugs_needing_embeddings):
                time.sleep(1)
    
    print("Embedding generation completed")

def create_combined_embeddings_for_existing():
    """
    Create combined embeddings for drugs that already have both main and article embeddings
    but no combined embedding yet.
    """
    cursor.execute("""
        SELECT de.drug_id, de.embedding, de.articles_embedding 
        FROM drug_embeddings de
        WHERE de.embedding IS NOT NULL 
        AND de.articles_embedding IS NOT NULL 
        AND de.combined_embedding IS NULL
    """)
    
    drugs = cursor.fetchall()
    if not drugs:
        print("No drugs need combined embeddings.")
        return
    
    print(f"Creating combined embeddings for {len(drugs)} drugs...")
    
    for drug in drugs:
        try:
            # Parse the embeddings
            embedding = json.loads(drug['embedding'])
            articles_embedding = json.loads(drug['articles_embedding'])
            
            # Create combined embedding
            combined_embedding = combine_embeddings(embedding, articles_embedding)
            
            # Update local DB
            cursor.execute("""
            UPDATE drug_embeddings 
            SET combined_embedding = ? 
            WHERE drug_id = ?
            """, (json.dumps(combined_embedding), drug['drug_id']))
            
            # Update Supabase
            supabase.table("drug_embeddings").update({
                "combined_embedding": combined_embedding
            }).eq("id", drug['drug_id']).execute()
            
            print(f"Created combined embedding for drug ID {drug['drug_id']}")
        except Exception as e:
            print(f"Error creating combined embedding for drug ID {drug['drug_id']}: {e}")
    
    conn.commit()
    print("Finished creating combined embeddings")

if __name__ == "__main__":
    try:
        ensure_embedding_tables_exist()
        generate_embeddings_in_batches()
        create_combined_embeddings_for_existing()
        conn.close()
        print("Process completed successfully")
    except Exception as e:
        print(f"Error in embedding generation: {e}")
        conn.close()