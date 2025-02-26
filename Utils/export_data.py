#!/usr/bin/env python3
import sqlite3
import csv

# ----- CONFIGURATION -----
# Path to your SQLite database file
DB_FILE = "DB/pepsources.db"  
# Name of the output CSV file
OUTPUT_CSV = "vendors_export.csv"

# ----- EXPORT VENDORS TABLE TO CSV -----
def export_vendors_to_csv():
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Query all rows from Vendors table
        cursor.execute("SELECT * FROM Vendors")
        rows = cursor.fetchall()
        # Get column names from cursor description
        column_names = [description[0] for description in cursor.description]
        
        # Write rows to CSV file
        with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.writer(csvfile)
            writer.writerow(column_names)
            writer.writerows(rows)
        
        conn.close()
        print(f"Export successful! {len(rows)} rows written to '{OUTPUT_CSV}'.")
    except Exception as e:
        print("Error exporting vendors to CSV:", e)

# ----- PRINT SQL SETUP STATEMENT -----
def print_sql_setup():
    sql_setup = """
CREATE TABLE Vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    product_name TEXT,
    product_link TEXT,
    product_image TEXT,
    price TEXT,
    size TEXT,
    drug_id INTEGER,
    test_certificate TEXT,
    endotoxin_report TEXT,
    sterility_report TEXT,
    cloudinary_product_image TEXT,
    cloudinary_test_certificate TEXT,
    cloudinary_endotoxin_report TEXT,
    cloudinary_sterility_report TEXT,
    in_supabase BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (drug_id) REFERENCES Drugs (id)
)
    """
    print("SQL Setup for Vendors Table:")
    print(sql_setup)

# ----- MAIN -----
if __name__ == "__main__":
    export_vendors_to_csv()
    print_sql_setup()