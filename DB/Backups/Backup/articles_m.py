import sqlite3
import logging

# Configuration paths
BACKUP_DB_PATH = "DB/Backups/Backup/pepsources-bp.db"
PROD_DB_PATH = "DB/pepsources.db"

# Set up logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def transfer_articles():
    try:
        # Connect to the backup database and fetch all rows from the articles table
        backup_conn = sqlite3.connect(BACKUP_DB_PATH)
        backup_cursor = backup_conn.cursor()
        backup_cursor.execute("SELECT * FROM articles")
        articles = backup_cursor.fetchall()
        logger.info(f"Fetched {len(articles)} rows from backup articles table.")
        
        # Get the column names from the backup articles table
        backup_cursor.execute("PRAGMA table_info(articles)")
        columns_info = backup_cursor.fetchall()
        columns = [col[1] for col in columns_info]  # extract column names
        logger.info(f"Article table columns: {columns}")
        
        # Prepare the INSERT statement for the production database
        placeholders = ", ".join(["?"] * len(columns))
        columns_str = ", ".join(columns)
        insert_query = f"INSERT INTO articles ({columns_str}) VALUES ({placeholders})"
        
        # Connect to the production database
        prod_conn = sqlite3.connect(PROD_DB_PATH)
        prod_cursor = prod_conn.cursor()
        
        # Clear the existing data in the production articles table
        prod_cursor.execute("DELETE FROM articles")
        prod_conn.commit()
        logger.info("Cleared existing data in production articles table.")
        
        # Insert all rows from the backup into the production table
        prod_cursor.executemany(insert_query, articles)
        prod_conn.commit()
        logger.info(f"Inserted {len(articles)} rows into production articles table.")
    
    except Exception as e:
        logger.error(f"Error during transfer: {e}")
    
    finally:
        backup_conn.close()
        prod_conn.close()

if __name__ == "__main__":
    transfer_articles()
    print("Article data transfer complete.")