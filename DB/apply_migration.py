#!/usr/bin/env python3
"""
Script to apply the subscription cancellation SQL migration.
This adds the canceled and canceled_at columns to the subscriptions table.
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get database connection details from environment variables
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")

# Path to migration file
MIGRATION_FILE = os.path.join(os.path.dirname(__file__), "migrations", "add_canceled_fields.sql")

def apply_migration():
    """Apply the SQL migration to add canceled fields to the subscriptions table."""
    try:
        # Connect to the database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        
        # Create a cursor
        cursor = conn.cursor()
        
        # Read the migration file
        with open(MIGRATION_FILE, 'r') as f:
            migration_sql = f.read()
        
        # Execute the migration
        cursor.execute(migration_sql)
        
        # Commit the changes
        conn.commit()
        
        print("Migration successfully applied!")
        
        # Close the cursor and connection
        cursor.close()
        conn.close()
        
        return True
    
    except Exception as e:
        print(f"Error applying migration: {e}")
        return False

if __name__ == "__main__":
    success = apply_migration()
    sys.exit(0 if success else 1) 