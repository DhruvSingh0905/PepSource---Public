import sqlite3
import logging

# Configuration
DB_FILE = "DB/pepsources.db"

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def clear_ai_columns():
    """Clears out the AI-generated columns in the articles table."""
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        update_query = """
            UPDATE articles
            SET ai_heading = NULL,
                ai_background = NULL,
                ai_conclusion = NULL,
                key_terms = NULL
        """
        cursor.execute(update_query)
        conn.commit()
        logger.info(f"Cleared AI-generated columns for {cursor.rowcount} rows.")
    except Exception as e:
        logger.error(f"Error clearing AI columns: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    clear_ai_columns()
    print("AI-generated columns have been cleared.")