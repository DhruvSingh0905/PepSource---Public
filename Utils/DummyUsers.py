import sqlite3

# Connect to the SQLite database (adjust path if necessary)
conn = sqlite3.connect("DB/pepsources.db")
cursor = conn.cursor()

# Define some dummy users (name, email, profile picture URL, access token, refresh token, expires_in)
dummy_users = [
    ("Alice Johnson", "alice@example.com", "https://example.com/images/alice.png", "dummy_access_token_1", "dummy_refresh_token_1", 3600),
    ("Bob Smith", "bob@example.com", "https://example.com/images/bob.png", "dummy_access_token_2", "dummy_refresh_token_2", 3600),
    ("Charlie Brown", "charlie@example.com", "https://example.com/images/charlie.png", "dummy_access_token_3", "dummy_refresh_token_3", 3600)
]

# Insert dummy users, skipping any that already exist based on unique email constraint.
for user in dummy_users:
    try:
        cursor.execute("""
            INSERT INTO users (name, email, pfp, access_token, refresh_token, expires_in)
            VALUES (?, ?, ?, ?, ?, ?)
        """, user)
        print(f"Inserted user: {user[0]} ({user[1]})")
    except sqlite3.IntegrityError:
        print(f"User with email {user[1]} already exists. Skipping.")

conn.commit()
conn.close()

print("Dummy users inserted successfully!")