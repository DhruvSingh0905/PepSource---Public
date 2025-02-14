import sqlite3
import re

DB_PATH = "DB/pepsources.db"

def migrate_proper_name():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Add the new column 'proper_name' if it doesn't exist.
    try:
        cur.execute("ALTER TABLE Drugs ADD COLUMN proper_name TEXT;")
        print("Added 'proper_name' column.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("'proper_name' column already exists.")
        else:
            raise

    # Fetch all rows from the Drugs table.
    cur.execute("SELECT id, name, what_it_does FROM Drugs")
    rows = cur.fetchall()

    if not rows:
        print("No rows found in the Drugs table.")
    else:
        for row in rows:
            drug_id, name, what_it_does = row

            if name is None:
                print(f"Skipping drug id {drug_id}: name is None")
                continue

            name_str = name.strip()
            what_it_does_str = what_it_does.strip() if what_it_does else ""

            # Extract the first token (word) from what_it_does.
            match = re.match(r"([^\s]+)", what_it_does_str)
            if match:
                extracted = match.group(1)
                # Remove any trailing commas from the extracted token.
                extracted = extracted.rstrip(',')
            else:
                extracted = name_str

            # Check if name is found in what_it_does (ignoring case).
            if what_it_does and name_str.lower() in what_it_does_str.lower():
                proper_name = extracted
                print(f"Drug id {drug_id}: '{name_str}' found in 'what_it_does'; setting proper_name = '{proper_name}'")
            else:
                proper_name = name_str
                print(f"Drug id {drug_id}: '{name_str}' NOT found in 'what_it_does'; setting proper_name = '{proper_name}'")
            
            cur.execute("UPDATE Drugs SET proper_name = ? WHERE id = ?", (proper_name, drug_id))
        
        conn.commit()
        print("Updated proper_name for all drugs.")

    conn.close()

if __name__ == "__main__":
    migrate_proper_name()