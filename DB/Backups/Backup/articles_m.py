#!/usr/bin/env python
import sqlite3
import csv
import sys
import os

DB_FILE = "DB/pepsources.db"
CSV_FILE = "vendor_details.csv"

def export_vendor_details():
    """Export all rows from VendorDetails to a CSV file."""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM VendorDetails")
    rows = cursor.fetchall()
    # Get column names from cursor.description
    column_names = [desc[0] for desc in cursor.description]
    
    with open(CSV_FILE, "w", newline='', encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(column_names)
        writer.writerows(rows)
    
    conn.close()
    print(f"Exported {len(rows)} rows to {CSV_FILE}")

def import_vendor_details():
    """Import data from the CSV file back into the VendorDetails table."""
    if not os.path.exists(CSV_FILE):
        print(f"CSV file '{CSV_FILE}' does not exist.")
        return
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    with open(CSV_FILE, "r", newline='', encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        for row in rows:
            # Build an insert query using the CSV column headers.
            columns = list(row.keys())
            placeholders = ", ".join(["?"] * len(columns))
            query = f"INSERT INTO VendorDetails ({', '.join(columns)}) VALUES ({placeholders})"
            values = [row[col] for col in columns]
            try:
                cursor.execute(query, values)
            except sqlite3.IntegrityError as e:
                print(f"Integrity error inserting row: {e}")
    conn.commit()
    conn.close()
    print(f"Imported {len(rows)} rows from {CSV_FILE}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python vendor_details_csv.py [export|import]")
        sys.exit(1)
    
    if sys.argv[1].lower() == "export":
        export_vendor_details()
    elif sys.argv[1].lower() == "import":
        import_vendor_details()
    else:
        print("Invalid argument. Use 'export' or 'import'.")