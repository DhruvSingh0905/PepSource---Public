import sqlite3

# Connect to SQLite database
conn = sqlite3.connect("DB/pepsources.db")
cursor = conn.cursor()

# Create the 'users' table
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    pfp TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_in INTEGER
);
""")

# Create the 'user_preferences' table for storing multiple preferences per user
cursor.execute("""
CREATE TABLE IF NOT EXISTS user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    preference TEXT NOT NULL
);
""")

conn.commit()
conn.close()

print("Tables 'users' and 'user_preferences' created successfully!")