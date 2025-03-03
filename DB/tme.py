#!/usr/bin/env python3
import os
import sqlite3
import logging
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Configuration
DB_FILE = "DB/pepsources.db"

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("add_dosing_columns")

def add_dosing_columns():
    """
    Adds columns for different body type dosing advice to the Drugs table
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Get existing columns in the Drugs table
    cursor.execute("PRAGMA table_info(Drugs)")
    columns = [info[1] for info in cursor.fetchall()]
    
    # Columns to add
    new_columns = [
        "obese_dosing",
        "skinny_with_little_muscle_dosing",
        "muscular_dosing"
    ]
    
    # Add columns one by one if they don't already exist
    for column in new_columns:
        if column not in columns:
            try:
                cursor.execute(f"ALTER TABLE Drugs ADD COLUMN {column} TEXT DEFAULT NULL")
                logger.info(f"Added column '{column}' to Drugs table")
            except sqlite3.Error as e:
                logger.error(f"Error adding column '{column}': {e}")
        else:
            logger.info(f"Column '{column}' already exists in Drugs table")
    
    # Commit changes
    conn.commit()
    conn.close()
    logger.info("Completed adding dosing columns to Drugs table")

def update_from_dosing_advice_table():
    """
    This function transfers existing dosing advice from the drug_dosing_advice table
    to the new columns in the Drugs table, if the drug_dosing_advice table exists.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Check if the drug_dosing_advice table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='drug_dosing_advice'")
    if not cursor.fetchone():
        logger.info("drug_dosing_advice table does not exist. Skipping update.")
        conn.close()
        return
    
    # Get all dosing advice entries
    cursor.execute("SELECT drug_id, body_type, dosing_advice FROM drug_dosing_advice")
    dosing_entries = cursor.fetchall()
    
    if not dosing_entries:
        logger.info("No dosing advice entries found. Skipping update.")
        conn.close()
        return
    
    logger.info(f"Found {len(dosing_entries)} dosing advice entries to transfer")
    
    # Update each drug with its corresponding dosing advice
    for drug_id, body_type, dosing_advice in dosing_entries:
        try:
            column_name = f"{body_type}_dosing"
            cursor.execute(f"UPDATE Drugs SET {column_name} = ? WHERE id = ?", (dosing_advice, drug_id))
            logger.info(f"Updated drug ID {drug_id} with {body_type} dosing advice")
        except sqlite3.Error as e:
            logger.error(f"Error updating drug ID {drug_id} with {body_type} dosing advice: {e}")
    
    # Commit changes
    conn.commit()
    conn.close()
    logger.info("Completed transferring dosing advice to Drugs table")

if __name__ == "__main__":
    try:
        logger.info("Starting process to add dosing columns to Drugs table")
        add_dosing_columns()
        
        # Optionally transfer existing data if available
        update_from_dosing_advice_table()
        
        logger.info("Process completed successfully")
    except Exception as e:
        logger.error(f"Error during process: {e}")