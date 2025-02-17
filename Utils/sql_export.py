#!/usr/bin/env python3
import sqlite3

# Path to your SQLite database
DB_FILE = "DB/pepsources.db"
# Output file for the schema
OUTPUT_FILE = "Utils/exported_schema.sql"

def export_schema(db_file, output_file):
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    
    # Query the sqlite_master table for all tables (ignoring internal tables if desired)
    cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
    tables = cursor.fetchall()

    with open(output_file, 'w', encoding='utf-8') as f:
        for table in tables:
            table_name, create_sql = table
            f.write(f"-- Table: {table_name}\n")
            f.write(create_sql + ";\n\n")
    
    conn.close()
    print(f"Schema exported successfully to '{output_file}'.")

if __name__ == "__main__":
    export_schema(DB_FILE, OUTPUT_FILE)