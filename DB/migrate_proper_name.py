import csv
import sqlite3
import logging
import os

# Configuration
CSV_FILE = os.path.join("Utils", "exported_data", "articles.csv")
DB_FILE = os.path.join("DB", "pepsources.db")

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

def import_csv_to_db():
    try:
        # Connect to the production database
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        # Open the CSV file and create a DictReader (assuming the file has a header)
        with open(CSV_FILE, mode="r", encoding="utf-8", newline="") as csvfile:
            reader = csv.DictReader(csvfile)
            rows = []
            for row in reader:
                # Build a tuple in the correct order for the insert query.
                rows.append((
                    row['id'],
                    row['article_url'],
                    row['pmid'],
                    row['doi'],
                    row['title'],
                    row['background'],
                    row['methods'],
                    row['results'],
                    row['conclusions'],
                    row['sponsor'],
                    row['publication_date'],
                    row['drug_id'],
                    row['publication_type'],
                    row['ai_heading'],
                    row['ai_background'],
                    row['ai_conclusion']
                ))
        
        logger.info(f"Fetched {len(rows)} rows from CSV.")

        # Optional: clear out the articles table first
        cursor.execute("DELETE FROM articles")
        conn.commit()
        logger.info("Cleared existing data in the articles table.")

        # Build the insert query with the appropriate number of placeholders
        insert_query = """
            INSERT INTO articles (
                id,
                article_url,
                pmid,
                doi,
                title,
                background,
                methods,
                results,
                conclusions,
                sponsor,
                publication_date,
                drug_id,
                publication_type,
                ai_heading,
                ai_background,
                ai_conclusion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        cursor.executemany(insert_query, rows)
        conn.commit()
        logger.info(f"Imported {len(rows)} rows into the articles table.")

    except Exception as e:
        logger.error(f"Error importing CSV data: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    import_csv_to_db()
    print("CSV data import complete.")