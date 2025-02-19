import sqlite3
from openai import OpenAI
import os
import time
import logging
from dotenv import load_dotenv

# Load environment variables from the .env file in the root directory
load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"

# Use the model "gpt-4o" as specified
MODEL = "gpt-4o"

# Configure logging: writes INFO and above to ai_generation.log and prints to console
logging.basicConfig(
    filename="ai_generation.log",
    filemode="w",
    format="%(asctime)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_formatter = logging.Formatter("%(asctime)s - %(message)s")
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

# --------------------------------------------------
# DATABASE HELPER FUNCTIONS
# --------------------------------------------------
def get_first_drug():
    """
    Retrieves the first drug from the Drugs table.
    Returns a tuple (id, name, proper_name) or None if no drug is found.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, proper_name FROM Drugs ORDER BY id LIMIT 1")
    drug = cursor.fetchone()
    conn.close()
    return drug

def ensure_ai_columns():
    """
    Ensure that the articles table has columns for AI summaries:
    ai_heading, ai_background, ai_conclusion, and key_terms.
    If any are missing, add them.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(articles)")
    columns = [row[1] for row in cursor.fetchall()]
    altered = False
    if "ai_heading" not in columns:
        cursor.execute("ALTER TABLE articles ADD COLUMN ai_heading TEXT")
        altered = True
    if "ai_background" not in columns:
        cursor.execute("ALTER TABLE articles ADD COLUMN ai_background TEXT")
        altered = True
    if "ai_conclusion" not in columns:
        cursor.execute("ALTER TABLE articles ADD COLUMN ai_conclusion TEXT")
        altered = True
    if "key_terms" not in columns:
        cursor.execute("ALTER TABLE articles ADD COLUMN key_terms TEXT")
        altered = True
    if altered:
        conn.commit()
        logger.info("AI summary columns (and key_terms) added to articles table (if missing).")
    conn.close()

def fetch_articles_without_ai(drug_id):
    """
    Retrieve articles connected to a specific drug (using the drug id)
    that are missing any AI summaries (NULL or empty).
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, background, methods, conclusions 
        FROM articles
        WHERE (
            ai_heading IS NULL OR ai_heading = '' OR
            ai_background IS NULL OR ai_background = '' OR
            ai_conclusion IS NULL OR ai_conclusion = '' OR
            key_terms IS NULL OR key_terms = ''
        )
        AND drug_id = ?
    """, (drug_id,))
    articles = cursor.fetchall()
    conn.close()
    
    logger.info(f"Fetched {len(articles)} articles for drug id {drug_id}.")
    for article in articles:
        logger.info(f"Article fetched: {article}")
    return articles

def update_article_ai_summary(article_id, ai_heading, ai_background, ai_conclusion, key_terms):
    """
    Update the article with the given AI summary values.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE articles
        SET ai_heading = ?,
            ai_background = ?,
            ai_conclusion = ?,
            key_terms = ?
        WHERE id = ?
    """, (ai_heading, ai_background, ai_conclusion, key_terms, article_id))
    conn.commit()
    conn.close()
    logger.info(f"Updated article {article_id} with AI summaries and key terms.")

# --------------------------------------------------
# FUNCTION FOR AI SUMMARIZATION
# --------------------------------------------------
def generate_ai_summary(article):
    """
    Generates an AI summary for a single article using an individual API call.
    This function checks for empty categories and uses placeholders if necessary.
    """
    # Unpack article fields; if any field is None, use an empty string.
    article_id, title, background, methods, conclusions = article
    title = title or ""
    background = background or ""
    methods = methods or ""
    conclusions = conclusions or ""
    
    # Use placeholder text if methods or conclusions are empty.
    methods_text = methods.strip() if methods.strip() else "Not provided."
    conclusions_text = conclusions.strip() if conclusions.strip() else "Not provided."
    
    # Updated prompt:
    # - Detailed summary with contextual figures.
    # - Simplified one-sentence conclusion.
    # - List 2–3 key terms with very simple, one-sentence definitions.
    prompt = f"""
Rewrite this study summary in a detailed and comprehensive manner that is **extremely easy to understand**.
Include relevant figures and numerical data where available, using a "~" to indicate approximate values.
Also, list 2–3 key terms that are important to the study and provide very simple, one-sentence definitions for each.

Follow the exact format below:

**ai_heading:** A one-to-two sentence summary of the study's primary goal, including any relevant numerical data.
**ai_background:** A detailed explanation of the study's purpose, defining key terms and providing context with figures.
**ai_conclusion:** A simplified one-sentence summary of the key findings.
**key_terms:** List 2–3 key terms along with very simple one-sentence definitions.

Title: {title}
Background: {background}
Methods: {methods_text}
Conclusions: {conclusions_text}
""".strip()
    
    messages = [
        {"role": "developer", "content": "You simplify complex research articles into detailed, easy-to-understand summaries with contextualized figures and clear, simple definitions of key terms."},
        {"role": "user", "content": prompt}
    ]
    logger.info(f"Sending prompt for article ID {article_id}:\n{prompt}")
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            store=True
        )
        # Print the full response object to the console.
        print(f"\n--- Full Response for Article ID {article_id} ---\n{response}\n")
        logger.info(f"Full Response for article ID {article_id}:\n{response}")
        
        message_obj = response.choices[0].message
        content = message_obj.content  # Use attribute access to get the content
        logger.info(f"Received AI summary for article ID {article_id}:\n{content}")
        print(f"\n--- AI Summary for Article ID {article_id} ---\n{content}\n")
        return content
    except Exception as e:
        logger.error(f"OpenAI API Error for article '{title}' (ID {article_id}): {e}")
        return ""

# --------------------------------------------------
# MAIN PROCESS
# --------------------------------------------------
def main():
    drug = get_first_drug()
    if not drug:
        logger.error("No drug found in the Drugs table.")
        return
    drug_id, drug_name, drug_proper_name = drug
    logger.info(f"Processing articles for drug '{drug_name}' (id {drug_id}, proper name: {drug_proper_name}).")
    
    ensure_ai_columns()
    articles = fetch_articles_without_ai(drug_id)
    if not articles:
        logger.info(f"✅ All articles for drug id {drug_id} have AI-generated summaries.")
        return
    
    for article in articles:
        summary = generate_ai_summary(article)
        if summary:
            try:
                # Parse the output into parts by markers.
                lines = summary.split("\n")
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
                        # Stop recording if a new marker starts or line is empty.
                        if line.startswith("**") or line == "":
                            recording_key_terms = False
                        else:
                            key_terms_lines.append(line)
                key_terms = "\n".join(key_terms_lines)
                if not ai_heading and not ai_background and not ai_conclusion and not key_terms:
                    logger.error(f"No valid summary parts extracted for article ID {article[0]}.")
                else:
                    update_article_ai_summary(article[0], ai_heading, ai_background, ai_conclusion, key_terms)
            except Exception as e:
                logger.error(f"Error updating article ID {article[0]}: {e}")
        else:
            logger.error(f"No summary generated for article ID {article[0]}.")
        time.sleep(1)  # Delay to avoid rate limits
    
    logger.info("🎉 AI summarization process completed.")

if __name__ == "__main__":
    main()