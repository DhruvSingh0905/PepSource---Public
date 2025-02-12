import sqlite3
import openai
import time
import logging

# Database file path
DB_FILE = "DB/articles.db"

# OpenAI API Key (Set this securely in environment variables)
openai.api_key = "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"

# Configure logging
logging.basicConfig(
    filename="ai_generation.log",
    filemode="w",
    format="%(asctime)s - %(message)s",
    level=logging.INFO,
)

# Define batch size for processing
BATCH_SIZE = 5  

# Function to retrieve articles missing AI summaries
def fetch_articles_without_ai():
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

# Function to request AI summaries from GPT-4o
def generate_ai_summaries(articles):
    """Uses OpenAI GPT-4o in batch mode to generate simplified summaries for articles."""
    
    messages = [
        {"role": "system", "content": "You simplify complex research articles into easy-to-read summaries."}
    ]

    for article in articles:
        title, background, conclusions = article[1], article[2], article[3]

        prompt = f"""
        Rewrite this study summary in a way that is **extremely easy to understand**.
        Use the following format:

        **ai_heading:** A **one-two sentence**, simple explanation of the study's goal. Imagine if someone with no background in the field were reading this.
        **ai_background:** A  **short** and **clear** explanation of the study's purpose, defining key terms. Imagine if someone with no background in the field were reading this.
        **ai_conclusion:** A **two** summary of the key findings. Imagine if someone with no background in the field were reading this.

        **Title:** {title}
        **Background:** {background}
        **Conclusions:** {conclusions}
        """

        messages.append({"role": "user", "content": prompt})

    try:
        response = openai.ChatCompletion.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=400,
            temperature=0.7
        )

        return [choice["message"]["content"] for choice in response["choices"]]

    except Exception as e:
        logging.error(f"❌ OpenAI API Error: {e}")
        return None

# Function to update database with AI-generated summaries
def update_database(articles, summaries):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    for article, summary in zip(articles, summaries):
        article_id = article[0]

        try:
            lines = summary.split("\n")
            ai_heading = lines[0].replace("**ai_heading:** ", "").strip()
            ai_background = lines[1].replace("**ai_background:** ", "").strip()
            ai_conclusion = lines[3].replace("**ai_conclusion:** ", "").strip()

            cursor.execute("""
                UPDATE articles
                SET ai_heading = ?, ai_background = ?, ai_conclusion = ?
                WHERE id = ?
            """, (ai_heading, ai_background, ai_conclusion, article_id))

        except Exception as e:
            logging.error(f"⚠️ Error processing article ID {article_id}: {e}")

    conn.commit()
    conn.close()

# Main function to run the AI generation process
def main():
    logging.info("🚀 Starting AI generation process...")

    while True:
        # Fetch articles missing AI summaries
        articles = fetch_articles_without_ai()
        if not articles:
            logging.info("✅ All articles have AI-generated summaries.")
            break

        # Process in batches
        for i in range(0, len(articles), BATCH_SIZE):
            batch = articles[i:i+BATCH_SIZE]

            logging.info(f"📝 Processing batch {i // BATCH_SIZE + 1}...")

            # Generate AI summaries
            summaries = generate_ai_summaries(batch)
            if summaries:
                # Update database
                update_database(batch, summaries)
                logging.info("✅ Successfully updated AI summaries for batch.")

            time.sleep(3)  # Small delay to avoid rate limits

    logging.info("🎉 AI summarization process completed.")

if __name__ == "__main__":
    main()