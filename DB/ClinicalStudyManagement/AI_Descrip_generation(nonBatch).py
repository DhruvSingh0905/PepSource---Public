import sqlite3
import openai
import time
import logging
import os

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
DB_FILE = "DB/pepsources.db"

# Set your OpenAI API key (preferably via environment variable)
openai.api_key = os.getenv("OPENAI_API_KEY", "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"
)

# Use the model "gpt-4o" as specified
MODEL = "gpt-4o"

# Configure logging: writes INFO and above to ai_generation.log
logging.basicConfig(
    filename="ai_generation.log",
    filemode="w",
    format="%(asctime)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

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
    Retrieve articles that are missing any AI summaries (NULL or empty)
    and that are linked to a drug.
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
        AND drug_id IS NOT NULL
    """)
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
# FUNCTION FOR AI SUMMARIZATION (STANDARD REQUEST)
# --------------------------------------------------
def generate_ai_summary(article):
    """
    Generates an AI summary for a single article using an individual API call.
    Uses the new interface style with standard requests.
    
    Example usage in JavaScript (for reference):
    
    import OpenAI from "openai";
    const openai = new OpenAI();
    
    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "developer", content: "You are a helpful assistant." },
            { role: "user", content: "Write a haiku about recursion in programming." },
        ],
        store: true,
    });
    
    console.log(completion.choices[0].message);
    
    In Python, we mimic that below.
    """
    # Unpack article fields; if any field is None, use an empty string.
    article_id, title, background, methods, conclusions = article
    title = title or ""
    background = background or ""
    methods = methods or ""
    conclusions = conclusions or ""
    
    prompt = f"""
Rewrite this study summary in a way that is **extremely easy to understand**.
Use the following format exactly:

**ai_heading:** A one-to-two sentence, simple explanation of the study's goal.
**ai_background:** A short and clear explanation of the study's purpose, defining key terms.
**ai_conclusion:** A brief summary of the key findings.

Title: {title}
Background: {background}
Methods: {methods}
Conclusions: {conclusions}
"""
    messages = [
        {"role": "developer", "content": "You simplify complex research articles into easy-to-read summaries."},
        {"role": "user", "content": prompt}
    ]
    try:
        response = openai.ChatCompletion.create(
            model=MODEL,
            messages=messages,
            store=True
        )
        # Mimic the JavaScript snippet: return the full message object.
        message_obj = response.choices[0].message
        # For database update, we want the content.
        return message_obj["content"]
    except Exception as e:
        logger.error(f"OpenAI API Error for article '{title}': {e}")
        return ""

# --------------------------------------------------
# MAIN PROCESS
# --------------------------------------------------
def main():
    logger.info("🚀 Starting AI summarization process for pepsource.db...")
    ensure_ai_columns()
    articles = fetch_articles_without_ai()
    if not articles:
        logger.info("✅ All articles with a linked drug have AI-generated summaries.")
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
                update_article_ai_summary(article[0], ai_heading, ai_background, ai_conclusion)
            except Exception as e:
                logger.error(f"Error updating article ID {article[0]}: {e}")
        else:
            logger.error(f"No summary generated for article ID {article[0]}.")
        time.sleep(1)  # Delay to avoid rate limits
    logger.info("🎉 AI summarization process completed.")

if __name__ == "__main__":
    main()