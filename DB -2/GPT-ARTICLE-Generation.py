import sqlite3
from openai import OpenAI
import os
client = OpenAI(api_key=os.getenv(
    "OPENAI_API_KEY",
    "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"
))
import time
import logging
import os

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"
# Set the specific drug's ID (adjust this as needed or via environment variable)
DRUG_ID = os.getenv("DRUG_ID", "drug123")

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
# Add a stream handler to also output to console
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_formatter = logging.Formatter("%(asctime)s - %(message)s")
console_handler.setFormatter(console_formatter)
logger.addHandler(console_handler)

# --------------------------------------------------
# DATABASE HELPER FUNCTIONS
# --------------------------------------------------
def ensure_ai_columns():
    """
    Ensure that the articles table has columns for AI summaries:
    ai_heading, ai_background, and ai_conclusion.
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
    if altered:
        conn.commit()
        logger.info("AI summary columns added to articles table (if missing).")
    conn.close()

def fetch_articles_without_ai():
    """
    Retrieve articles for a specific drug (based on DRUG_ID) that are missing any AI summaries (NULL or empty).
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, background, methods, conclusions 
        FROM articles
        WHERE (
            ai_heading IS NULL OR ai_heading = '' OR
            ai_background IS NULL OR ai_background = '' OR
            ai_conclusion IS NULL OR ai_conclusion = ''
        )
        AND drug_id = ?
    """, (DRUG_ID,))
    articles = cursor.fetchall()
    conn.close()
    return articles

def update_article_ai_summary(article_id, ai_heading, ai_background, ai_conclusion):
    """
    Update the article with the given AI summary values.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE articles
        SET ai_heading = ?, ai_background = ?, ai_conclusion = ?
        WHERE id = ?
    """, (ai_heading, ai_background, ai_conclusion, article_id))
    conn.commit()
    conn.close()
    logger.info(f"Updated article {article_id} with AI summaries.")

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

    # If methods or conclusions are empty, we use a placeholder text.
    methods_text = methods.strip() if methods.strip() else "Not provided."
    conclusions_text = conclusions.strip() if conclusions.strip() else "Not provided."

    # Build the prompt; always include the headers so that the AI returns the correct format.
    prompt = f"""
Rewrite this study summary in a way that is **extremely easy to understand**.
Use the following format exactly:

**ai_heading:** A one-to-two sentence, simple explanation of the study's goal.
**ai_background:** A short and clear explanation of the study's purpose, defining key terms.
**ai_conclusion:** A brief summary of the key findings.

Title: {title}
Background: {background}
Methods: {methods_text}
Conclusions: {conclusions_text}
""".strip()

    messages = [
        {"role": "developer", "content": "You simplify complex research articles into easy-to-read summaries."},
        {"role": "user", "content": prompt}
    ]
    logger.info(f"Sending prompt for article ID {article_id}:\n{prompt}")
    try:
        response = client.chat.completions.create(model=MODEL,
            messages=messages,
            store=True)
        message_obj = response.choices[0].message
        content = message_obj["content"]
        logger.info(f"Received AI summary for article ID {article_id}:\n{content}")
        # Also print the response for immediate testing
        print(f"\n--- AI Summary for Article ID {article_id} ---\n{content}\n")
        return content
    except Exception as e:
        logger.error(f"OpenAI API Error for article '{title}' (ID {article_id}): {e}")
        return ""

# --------------------------------------------------
# MAIN PROCESS
# --------------------------------------------------
def main():
    logger.info("🚀 Starting AI summarization process for pepsources.db for drug: " + DRUG_ID)
    ensure_ai_columns()
    articles = fetch_articles_without_ai()
    if not articles:
        logger.info("✅ All articles for drug " + DRUG_ID + " have AI-generated summaries.")
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
                for line in lines:
                    line = line.strip()
                    if line.lower().startswith("**ai_heading:**"):
                        ai_heading = line.split("**ai_heading:**", 1)[1].strip()
                    elif line.lower().startswith("**ai_background:**"):
                        ai_background = line.split("**ai_background:**", 1)[1].strip()
                    elif line.lower().startswith("**ai_conclusion:**"):
                        ai_conclusion = line.split("**ai_conclusion:**", 1)[1].strip()
                # Check that we got some content before updating.
                if not ai_heading and not ai_background and not ai_conclusion:
                    logger.error(f"No valid summary parts extracted for article ID {article[0]}.")
                else:
                    update_article_ai_summary(article[0], ai_heading, ai_background, ai_conclusion)
            except Exception as e:
                logger.error(f"Error updating article ID {article[0]}: {e}")
        else:
            logger.error(f"No summary generated for article ID {article[0]}.")
        time.sleep(1)  # Delay to avoid rate limits

    logger.info("🎉 AI summarization process completed.")

if __name__ == "__main__":
    main()