import sqlite3
import os

# Path to your database and checkpoint files (adjust as necessary)
DB_FILE = "DB/pepsources.db"
PROGRESS_JSON = "progress_checkpoint.json"
CHECKPOINT_FILE = "scraped_links.txt"

def reset_db():
    """Reset the Drugs and Articles tables."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    # Set last_checked to NULL for all drugs
    cursor.execute("UPDATE Drugs SET last_checked = NULL")
    # Delete all rows from the articles table
    cursor.execute("DELETE FROM articles")
    conn.commit()
    conn.close()
    print("Database reset: last_checked dates cleared and articles table emptied.")

def reset_checkpoint_files():
    """Clear out the checkpoint files."""
    # Remove progress checkpoint file if it exists, then create an empty file.
    if os.path.exists(PROGRESS_JSON):
        os.remove(PROGRESS_JSON)
    open(PROGRESS_JSON, 'w').close()
    
    # Remove scraped links file if it exists, then create an empty file.
    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
    open(CHECKPOINT_FILE, 'w').close()
    
    print("Checkpoint files reset.")

if __name__ == "__main__":
    reset_db()
    reset_checkpoint_files()
    print("Reset complete.")