import sqlite3

# Database connection
db_path = "pepsources.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

def add_vendor_count_column():
    """
    Adds a 'vendor_count' column to the Drugs table if it doesn't exist.
    """
    try:
        cursor.execute("ALTER TABLE Drugs ADD COLUMN vendor_count INTEGER DEFAULT 0")
        conn.commit()
        print("[INFO] Added 'vendor_count' column to Drugs table.")
    except sqlite3.OperationalError:
        print("[INFO] 'vendor_count' column already exists. Skipping addition.")

def update_vendor_counts():
    """
    Updates the 'vendor_count' column in Drugs based on linked Vendors.
    """
    # Get count of vendors per drug_id
    cursor.execute("""
        SELECT drug_id, COUNT(*) 
        FROM Vendors 
        GROUP BY drug_id
    """)
    vendor_counts = cursor.fetchall()

    # Update the Drugs table with new counts
    for drug_id, count in vendor_counts:
        cursor.execute("UPDATE Drugs SET vendor_count = ? WHERE id = ?", (count, drug_id))
        print(f"[INFO] Updated Drug ID {drug_id} with vendor count: {count}")

    conn.commit()
    print("[INFO] Vendor counts updated successfully.")

if __name__ == "__main__":
    add_vendor_count_column()  # Add column if missing
    update_vendor_counts()  # Populate vendor counts
    conn.close()
    print("[INFO] Database connection closed.")