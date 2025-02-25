#!/usr/bin/env python3
import sqlite3
import csv
import os
from datetime import datetime

DB_FILE = "DB/pepsources.db"
ARTICLES_CSV = "articles.csv"

def convert_date(value):
    """
    Convert a date string to YYYY-MM-DD format.
    If conversion fails, return the original value.
    """
    if not value:
        return ""
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    return value

def process_row(row, columns):
    """
    Process a row from the articles table.
    Currently, only converts publication_date.
    """
    row = list(row)
    try:
        idx = columns.index("publication_date")
        row[idx] = convert_date(row[idx])
    except ValueError:
        pass
    return row

def export_articles_to_csv(conn, csv_filename):
    """
    Export all rows from the articles table to a CSV file.
    The drug_id will be stored as the integer id.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM articles")
    rows = cursor.fetchall()

    # Get column names from the cursor description.
    column_names = [desc[0] for desc in cursor.description]

    processed_rows = [process_row(row, column_names) for row in rows]

    with open(csv_filename, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(column_names)
        writer.writerows(processed_rows)
    
    print(f"Exported {len(rows)} rows to {csv_filename}")

def main():
    if not os.path.exists(DB_FILE):
        print(f"Database file '{DB_FILE}' not found!")
        return
    conn = sqlite3.connect(DB_FILE)
    export_articles_to_csv(conn, ARTICLES_CSV)
    conn.close()
    print("Articles table exported successfully.")

if __name__ == "__main__":
    main()