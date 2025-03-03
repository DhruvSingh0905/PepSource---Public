#!/usr/bin/env python3
import os
import sqlite3
import logging
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables from .env
load_dotenv()

# Configuration
DB_FILE = "DB/pepsources.db"
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("supabase_to_sqlite_sync")

def connect_to_supabase():
    """
    Connect to Supabase using environment variables.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise Exception("Supabase credentials are not set in environment variables.")
    
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        logger.info("Successfully connected to Supabase.")
        return supabase
    except Exception as e:
        logger.error(f"Error connecting to Supabase: {e}")
        raise

def backup_local_db():
    """
    Create a backup of the local database before making changes.
    """
    import shutil
    from datetime import datetime
    
    backup_dir = "DB/backups"
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = f"{backup_dir}/pepsources_backup_{timestamp}.db"
    
    try:
        shutil.copy2(DB_FILE, backup_file)
        logger.info(f"Created backup of local database at {backup_file}")
        return backup_file
    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        raise

def get_research_chem_vendor_ids():
    """
    Get the IDs of all ResearchChem vendor entries in the local database.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT id FROM Vendors WHERE name = 'ResearchChem'")
        research_chem_ids = [row[0] for row in cursor.fetchall()]
        logger.info(f"Found {len(research_chem_ids)} ResearchChem vendor entries in local database.")
        return research_chem_ids
    except sqlite3.Error as e:
        logger.error(f"Error fetching ResearchChem vendor IDs: {e}")
        raise
    finally:
        conn.close()

def save_research_chem_vendors():
    """
    Save a copy of all ResearchChem vendor rows from the local database.
    """
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        cursor.execute("SELECT * FROM Vendors WHERE name = 'ResearchChem'")
        research_chem_vendors = [dict(row) for row in cursor.fetchall()]
        logger.info(f"Saved {len(research_chem_vendors)} ResearchChem vendor entries.")
        return research_chem_vendors
    except sqlite3.Error as e:
        logger.error(f"Error saving ResearchChem vendor entries: {e}")
        raise
    finally:
        conn.close()

def sync_drugs_table(supabase):
    """
    Replace all data in the local Drugs table with data from Supabase.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # Get schema information to recreate the table
        cursor.execute("PRAGMA table_info(Drugs)")
        columns_info = cursor.fetchall()
        
        # Generate column definitions
        column_defs = []
        for col in columns_info:
            # col structure: (id, name, type, notnull, default_value, pk)
            col_name = col[1]
            col_type = col[2]
            not_null = "NOT NULL" if col[3] else ""
            default = f"DEFAULT {col[4]}" if col[4] is not None else ""
            primary_key = "PRIMARY KEY" if col[5] else ""
            
            column_defs.append(f"{col_name} {col_type} {not_null} {default} {primary_key}".strip())
        
        # Begin transaction
        cursor.execute("BEGIN TRANSACTION")
        
        # Drop the existing Drugs table
        cursor.execute("DROP TABLE IF EXISTS Drugs_temp")
        
        # Create a new temporary table with the same schema
        create_table_sql = f"CREATE TABLE Drugs_temp ({', '.join(column_defs)})"
        cursor.execute(create_table_sql)
        
        # Fetch all drugs from Supabase
        response = supabase.table("drugs").select("*").execute()
        supabase_drugs = response.data
        
        if not supabase_drugs:
            logger.error("No drug data found in Supabase.")
            raise Exception("No drug data found in Supabase.")
        
        logger.info(f"Retrieved {len(supabase_drugs)} drugs from Supabase.")
        
        # Prepare column names and placeholders for INSERT statement
        columns = [col[1] for col in columns_info]
        placeholders = ["?" for _ in columns]
        
        # Insert records into the temporary table
        insert_sql = f"INSERT INTO Drugs_temp ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
        
        for drug in supabase_drugs:
            # Prepare values in the same order as columns
            values = [drug.get(col, None) for col in columns]
            cursor.execute(insert_sql, values)
        
        # Replace the old table with the new one
        cursor.execute("DROP TABLE Drugs")
        cursor.execute("ALTER TABLE Drugs_temp RENAME TO Drugs")
        
        # Commit transaction
        cursor.execute("COMMIT")
        
        logger.info(f"Successfully imported {len(supabase_drugs)} drugs from Supabase to local database.")
    except Exception as e:
        cursor.execute("ROLLBACK")
        logger.error(f"Error syncing Drugs table: {e}")
        raise
    finally:
        conn.close()

def sync_vendors_table(supabase, research_chem_vendors):
    """
    Replace data in the local Vendors table with data from Supabase,
    while preserving ResearchChem vendor entries.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # Get schema information to recreate the table
        cursor.execute("PRAGMA table_info(Vendors)")
        columns_info = cursor.fetchall()
        
        # Generate column definitions
        column_defs = []
        for col in columns_info:
            # col structure: (id, name, type, notnull, default_value, pk)
            col_name = col[1]
            col_type = col[2]
            not_null = "NOT NULL" if col[3] else ""
            default = f"DEFAULT {col[4]}" if col[4] is not None else ""
            primary_key = "PRIMARY KEY" if col[5] else ""
            
            column_defs.append(f"{col_name} {col_type} {not_null} {default} {primary_key}".strip())
        
        # Begin transaction
        cursor.execute("BEGIN TRANSACTION")
        
        # Drop the existing Vendors table
        cursor.execute("DROP TABLE IF EXISTS Vendors_temp")
        
        # Create a new temporary table with the same schema
        create_table_sql = f"CREATE TABLE Vendors_temp ({', '.join(column_defs)})"
        cursor.execute(create_table_sql)
        
        # Fetch all vendors from Supabase
        response = supabase.table("vendors").select("*").execute()
        supabase_vendors = response.data
        
        if not supabase_vendors:
            logger.warning("No vendor data found in Supabase. Only ResearchChem vendors will be preserved.")
        else:
            logger.info(f"Retrieved {len(supabase_vendors)} vendors from Supabase.")
        
        # Prepare column names and placeholders for INSERT statement
        columns = [col[1] for col in columns_info]
        placeholders = ["?" for _ in columns]
        
        # Insert records from Supabase into the temporary table
        insert_sql = f"INSERT INTO Vendors_temp ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
        
        for vendor in supabase_vendors:
            # Prepare values in the same order as columns
            values = [vendor.get(col, None) for col in columns]
            cursor.execute(insert_sql, values)
        
        # Insert ResearchChem vendors from local database
        for vendor in research_chem_vendors:
            values = [vendor.get(col, None) for col in columns]
            cursor.execute(insert_sql, values)
        
        # Replace the old table with the new one
        cursor.execute("DROP TABLE Vendors")
        cursor.execute("ALTER TABLE Vendors_temp RENAME TO Vendors")
        
        # Commit transaction
        cursor.execute("COMMIT")
        
        logger.info(f"Successfully imported {len(supabase_vendors)} vendors from Supabase to local database.")
        logger.info(f"Preserved {len(research_chem_vendors)} ResearchChem vendor entries in local database.")
    except Exception as e:
        cursor.execute("ROLLBACK")
        logger.error(f"Error syncing Vendors table: {e}")
        raise
    finally:
        conn.close()

def update_auto_increment_sequences():
    """
    Update SQLite auto-increment sequences after bulk import.
    """
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    try:
        # Update auto-increment for Drugs table
        cursor.execute("SELECT MAX(id) FROM Drugs")
        max_drug_id = cursor.fetchone()[0] or 0
        cursor.execute(f"UPDATE sqlite_sequence SET seq = {max_drug_id} WHERE name = 'Drugs'")
        
        # Update auto-increment for Vendors table
        cursor.execute("SELECT MAX(id) FROM Vendors")
        max_vendor_id = cursor.fetchone()[0] or 0
        cursor.execute(f"UPDATE sqlite_sequence SET seq = {max_vendor_id} WHERE name = 'Vendors'")
        
        conn.commit()
        logger.info("Updated auto-increment sequences.")
    except sqlite3.Error as e:
        logger.error(f"Error updating auto-increment sequences: {e}")
    finally:
        conn.close()

def main():
    try:
        logger.info("Starting Supabase to SQLite sync process...")
        
        # Create a backup of the local database
        backup_file = backup_local_db()
        
        # Save ResearchChem vendor entries
        research_chem_vendors = save_research_chem_vendors()
        
        # Connect to Supabase
        supabase = connect_to_supabase()
        
        # Sync Drugs table
        sync_drugs_table(supabase)
        
        # Sync Vendors table (preserving ResearchChem vendors)
        sync_vendors_table(supabase, research_chem_vendors)
        
        # Update auto-increment sequences
        update_auto_increment_sequences()
        
        logger.info(f"Sync completed successfully. Database backup is at {backup_file}")
        
    except Exception as e:
        logger.error(f"Sync process failed: {e}")
        logger.info("You may need to restore from the backup.")

if __name__ == "__main__":
    main()