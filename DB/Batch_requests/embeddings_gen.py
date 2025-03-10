import os
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

def get_drug_article_text(drug_id):
    """
    Retrieves concatenated article text for a drug from Supabase
    """
    # Query articles from Supabase - fixed ordering syntax
    response = supabase.table("articles")\
        .select("title,background,conclusions,ai_heading,ai_background,ai_conclusion")\
        .eq("drug_id", drug_id)\
        .eq("is_relevant", True)\
        .order("order_num")\
        .limit(5)\
        .execute()
    
    articles = response.data
    if not articles:
        return None
    
    # Concatenate article data with clear section markers
    article_texts = []
    for article in articles:
        article_text = f"TITLE: {article.get('title', '')}\n"
        article_text += f"BACKGROUND: {article.get('background', '')}\n"
        article_text += f"CONCLUSIONS: {article.get('conclusions', '')}\n"
        article_text += f"AI SUMMARY: {article.get('ai_heading', '')}\n"
        article_texts.append(article_text)
    
    # Join all articles with separators
    combined_text = "\n---\n".join(article_texts)
    
    # Truncate if very long to fit in embedding context
    if len(combined_text) > 8000:
        combined_text = combined_text[:8000]
    
    return combined_text

def get_drugs_without_content_embeddings():
    """
    Retrieves all drugs that don't have content_embedding yet, including:
    1. Drugs that don't exist in drug_embeddings table at all
    2. Drugs that exist in drug_embeddings but have null content_embedding
    """
    # Get existing drug IDs that already have content_embedding
    existing_response = supabase.table("drug_embeddings")\
        .select("id")\
        .not_.is_("content_embedding", "null")\
        .execute()
    
    drugs_with_content_embedding = set(item['id'] for item in existing_response.data)
    
    # Get all drugs with proper_name
    drugs_response = supabase.table("drugs")\
        .select("id,name,proper_name,what_it_does,how_it_works")\
        .not_.is_("proper_name", "null")\
        .execute()
    
    # Filter out drugs that already have content_embedding
    return [drug for drug in drugs_response.data if drug['id'] not in drugs_with_content_embedding]
def generate_embeddings_in_batches():
    """
    Generate embeddings for all drugs in batches to minimize API calls.
    Combines drug info and article content into one content_embedding.
    """
    # Get drugs that need new embeddings
    drugs_needing_embeddings = get_drugs_without_content_embeddings()
    
    if not drugs_needing_embeddings:
        print("No new embeddings needed.")
        return
    
    print(f"Generating embeddings for {len(drugs_needing_embeddings)} drugs...")
    
    # Process in batches of 20 to reduce API calls
    BATCH_SIZE = 20
    for i in range(0, len(drugs_needing_embeddings), BATCH_SIZE):
        batch = drugs_needing_embeddings[i:i+BATCH_SIZE]
        
        # Prepare batch data for embeddings
        batch_ids = []
        name_batch_texts = []
        content_batch_texts = []
        
        for drug in batch:
            drug_id = drug['id']
            batch_ids.append(drug_id)
            
            # Text for name embedding
            drug_info = f"{drug['proper_name']}. {drug.get('what_it_does', '')} {drug.get('how_it_works', '')}"
            name_batch_texts.append(drug_info)
            
            # Get article text and combine with drug info for content embedding
            article_text = get_drug_article_text(drug_id)
            if article_text:
                content_text = f"{drug_info}\n\nRELATED RESEARCH:\n{article_text}"
            else:
                content_text = drug_info
                
            content_batch_texts.append(content_text)
        
        # Generate name embeddings
        name_response = client.embeddings.create(
            model="text-embedding-3-small",
            input=name_batch_texts
        )
        
        # Generate content embeddings
        content_response = client.embeddings.create(
            model="text-embedding-3-small",
            input=content_batch_texts
        )
        
        # Process and store embeddings
        for j in range(len(batch)):
            drug_id = batch_ids[j]
            name_embedding = name_response.data[j].embedding
            content_embedding = content_response.data[j].embedding
            
            # Prepare for Supabase
            embedding_record = {
                "id": drug_id,
                "name_embedding": name_embedding,
                "content_embedding": content_embedding
            }
            
            # Upsert to Supabase
            try:
                supabase.table("drug_embeddings").upsert([embedding_record], on_conflict="id").execute()
                print(f"Stored embeddings for drug ID {drug_id}")
            except Exception as e:
                print(f"Error upserting embedding for drug {drug_id}: {e}")
        
        print(f"Processed batch {i//BATCH_SIZE + 1}/{(len(drugs_needing_embeddings)-1)//BATCH_SIZE + 1}")
        
        # Add a small delay between batches
        if i + BATCH_SIZE < len(drugs_needing_embeddings):
            time.sleep(1)
    
    print("Embedding generation completed")

if __name__ == "__main__":
    try:
        generate_embeddings_in_batches()
        print("Process completed successfully")
    except Exception as e:
        print(f"Error in embedding generation: {e}")