#!/usr/bin/env python3
import sqlite3
import csv
import os
from datetime import datetime

# Path to your SQLite database
DB_FILE = "DB/pepsources.db"

# Define the CSV filenames for each table.
TABLES = {
    "users": "Utils/exported_data/users.csv",
    "reviews": "Utils/exported_data/reviews.csv",
}

# We'll handle articles separately.
ARTICLES_CSV = "articles.csv"

# Conversion functions for fields that need to be in PostgreSQL-friendly format.
def convert_date(value):
    """
    Convert a date string from SQLite to YYYY-MM-DD format.
    Adjust the input format string if your SQLite dates differ.
    If conversion fails, return the original value.
    """
    if value is None or value == "":
        return ""
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):  # add formats as needed
        try:
            dt = datetime.strptime(value, fmt)
            return dt.strftime("%Y-%m-%d")
        except Exception:
            continue
    return value

def process_row(table, row, columns):
    """
    For rows from specific tables, convert fields as needed.
    """
    row = list(row)  # convert from tuple to list for mutability
    if table == "drugs":
        try:
            idx = columns.index("last_checked")
            row[idx] = convert_date(row[idx])
        except ValueError:
            pass
    elif table == "articles":
        try:
            idx = columns.index("publication_date")
            row[idx] = convert_date(row[idx])
        except ValueError:
            pass
    elif table == "reviews":
        try:
            idx = columns.index("created_at")
            row[idx] = convert_date(row[idx])
        except ValueError:
            pass
    return row

def export_table_to_csv(conn, table, csv_filename):
    cursor = conn.cursor()

    # Retrieve column names from the table.
    cursor.execute(f"PRAGMA table_info({table})")
    columns_info = cursor.fetchall()
    column_names = [info[1] for info in columns_info]

    # Fetch all rows from the table.
    cursor.execute(f"SELECT * FROM {table}")
    rows = cursor.fetchall()

    # Process rows if needed (e.g., convert date fields)
    processed_rows = [process_row(table, row, column_names) for row in rows]

    with open(csv_filename, "w", newline='', encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        # Write header row.
        writer.writerow(column_names)
        # Write rows.
        writer.writerows(processed_rows)

    print(f"Exported {table} to {csv_filename}")

def export_articles_to_csv(conn, csv_filename):
    """
    For the articles table, join with the drugs table so that the exported
    drug_id value is the integer ID from the drugs table (instead of a string).
    Assumes that in SQLite, articles.drug_id stores the drug name.
    """
    cursor = conn.cursor()
    query = """
    SELECT 
        a.id,
        a.article_url,
        a.pmid,
        a.doi,
        a.title,
        a.background,
        a.methods,
        a.results,
        a.conclusions,
        a.sponsor,
        a.publication_date,
        d.id as drug_id,
        a.publication_type,
        a.ai_heading,
        a.ai_background,
        a.ai_conclusion
    FROM articles a
    LEFT JOIN drugs d ON a.drug_id = d.name
    """
    cursor.execute(query)
    rows = cursor.fetchall()

    # Use the cursor description to get column names.
    column_names = [desc[0] for desc in cursor.description]

    processed_rows = [process_row("articles", row, column_names) for row in rows]

    with open(csv_filename, "w", newline='', encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(column_names)
        writer.writerows(processed_rows)

    print(f"Exported articles to {csv_filename}")

def main():
    if not os.path.exists(DB_FILE):
        print(f"Database file '{DB_FILE}' not found!")
        return

    conn = sqlite3.connect(DB_FILE)
    # Export standard tables (drugs, users, vendors, reviews, user_preferences)
    for table, csv_filename in TABLES.items():
        export_table_to_csv(conn, table, csv_filename)
    # Export the articles table with conversion
    export_articles_to_csv(conn, ARTICLES_CSV)
    conn.close()
    print("All tables exported successfully.")

if __name__ == "__main__":
    main()