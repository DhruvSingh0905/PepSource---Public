import sqlite3
import openai
import time
import logging
import os

# --------------------------------------------------
# CONFIGURATION
# --------------------------------------------------
# Set the database file path for Pepsource
DB_FILE = "pepsource.db"

# Set your OpenAI API key (preferably via environment variable)
openai.api_key = os.getenv("OPENAI_API_KEY", "your-api-key-here")

# Configure logging: writes INFO and above to ai_generation.log
logging.basicConfig(
    filename="ai_generation.log",
    filemode="w",
    format="%(asctime)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# Define batch size for processing
BATCH_SIZE = 5

# --------------------------------------------------
# FUNCTIONS FOR DATABASE ACCESS
# --------------------------------------------------
def fetch_articles_without_ai():
    """
    Retrieve articles that are missing any AI summaries.
    Assumes the articles table has columns: ai_heading, ai_background, ai_conclusion.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, title, background, methods, conclusions 
        FROM articles
        WHERE ai_heading IS NULL OR ai_background IS NULL OR ai_conclusion IS NULL
    """)
    articles = cursor.fetchall()
    conn.close()
    return articles

def update_database(articles, summaries):
    """
    For each article in the batch, update its AI summary fields.
    Expects each summary to include lines starting with **ai_heading:**, **ai_background:**, and **ai_conclusion:**.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    for article, summary in zip(articles, summaries):
        article_id = article[0]
        try:
            # Split the generated summary into lines
            lines = summary.split("\n")
            # Expecting the output format to be:
            # **ai_heading:** <text>
            # **ai_background:** <text>
            # **ai_conclusion:** <text>
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

            cursor.execute("""
                UPDATE articles
                SET ai_heading = ?, ai_background = ?, ai_conclusion = ?
                WHERE id = ?
            """, (ai_heading, ai_background, ai_conclusion, article_id))
            logger.info(f"Updated article {article_id} with AI summaries.")
        except Exception as e:
            logger.error(f"Error processing article ID {article_id}: {e}")
    conn.commit()
    conn.close()

# --------------------------------------------------
# FUNCTIONS FOR AI SUMMARIZATION
# --------------------------------------------------
def generate_ai_summaries(articles):
    """
    Use OpenAI GPT-4o to generate simplified summaries for the given articles.
    Each article is processed to generate a prompt that includes its Title, Background, and Conclusions.
    """
    messages = [
        {"role": "system", "content": "You simplify complex research articles into easy-to-read summaries."}
    ]

    # Process each article individually in a batch
    summaries = []
    for article in articles:
        title, background, conclusions = article[1], article[2], article[3]
        prompt = f"""
Rewrite this study summary in a way that is **extremely easy to understand**.
Use the following format exactly:

**ai_heading:** A one-to-two sentence, simple explanation of the study's goal.
**ai_background:** A short and clear explanation of the study's purpose, defining key terms.
**ai_conclusion:** A brief summary of the key findings.

Title: {title}
Background: {background}
Conclusions: {conclusions}
"""
        messages.append({"role": "user", "content": prompt})
        try:
            response = openai.ChatCompletion.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=400,
                temperature=0.7
            )
            output = response["choices"][0]["message"]["content"]
            summaries.append(output)
            # Remove the prompt so we only send one user prompt per API call
            messages.pop()
        except Exception as e:
            logger.error(f"OpenAI API Error for article '{title}': {e}")
            summaries.append(None)
        time.sleep(1)  # Delay to avoid hitting rate limits

    return summaries

# --------------------------------------------------
# MAIN PROCESS
# --------------------------------------------------
def main():
    logger.info("🚀 Starting AI generation process for pepsource.db...")
    while True:
        articles = fetch_articles_without_ai()
        if not articles:
            logger.info("✅ All articles have AI-generated summaries.")
            break

        for i in range(0, len(articles), BATCH_SIZE):
            batch = articles[i:i+BATCH_SIZE]
            logger.info(f"📝 Processing batch {i // BATCH_SIZE + 1} with {len(batch)} articles...")
            summaries = generate_ai_summaries(batch)
            if summaries:
                update_database(batch, summaries)
                logger.info("✅ Successfully updated AI summaries for batch.")
            time.sleep(3)

    logger.info("🎉 AI summarization process completed.")

if __name__ == "__main__":
    main()