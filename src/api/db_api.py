from flask import Flask, jsonify, request
import sqlite3

# Define the database file path
DB_FILE = "DB/articles.db"

# Initialize Flask app
app = Flask(__name__)

# -----------------------------------------
# ✅ Database Helper Function
# -----------------------------------------
def get_db_connection():
    """Establish a connection to the SQLite database and return the connection object."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row  # Enables accessing columns by name
    return conn

# -----------------------------------------
# 🔹 Route: Get All Unique Drugs
# -----------------------------------------
@app.route("/api/drugs", methods=["GET"])
def get_all_drugs():
    """
    Retrieve a list of all unique drug names stored in the database.
    
    Returns:
        JSON object containing a list of distinct drug names.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch distinct drug names
    cursor.execute("SELECT DISTINCT drug_name FROM drugs ORDER BY drug_name")
    drugs = [row["drug_name"] for row in cursor.fetchall()]
    
    conn.close()
    return jsonify({"drugs": drugs})

# -----------------------------------------
# 🔹 Route: Get All Articles for a Specific Drug
# -----------------------------------------
@app.route("/api/drug/<drug_name>/articles", methods=["GET"])
def get_articles_for_drug(drug_name):
    """
    Retrieve all articles associated with a given drug.
    
    Args:
        drug_name (str): The name of the drug to filter articles by.

    Returns:
        JSON object with the drug name and a list of linked articles.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # SQL query to fetch articles related to the given drug name
    cursor.execute("""
        SELECT a.id, a.title, a.article_url, a.pmid, a.doi, a.publication_date
        FROM articles a
        JOIN article_drugs ad ON a.id = ad.article_id
        JOIN drugs d ON ad.drug_id = d.id
        WHERE d.drug_name = ?
        ORDER BY a.publication_date DESC
    """, (drug_name,))
    
    # Format the response
    articles = [
        {
            "id": row["id"],
            "title": row["title"] or "Title Not Available",
            "url": row["article_url"],
            "citation": f"PMID: {row['pmid']}" if row["pmid"] else f"DOI: {row['doi']}" if row["doi"] else "No Citation Available",
            "date": row["publication_date"] or "Unknown Date",
            "summary": "Coming Soon...",  # Placeholder for AI-generated summary
            "results": "Coming Soon..."  # Placeholder for AI-generated results
        }
        for row in cursor.fetchall()
    ]
    
    conn.close()
    
    # Return formatted JSON response
    return jsonify({"drug_name": drug_name, "articles": articles})

# -----------------------------------------
# 🔹 Route: Get Details for a Specific Article
# -----------------------------------------
@app.route("/api/article/<int:article_id>", methods=["GET"])
def get_article_details(article_id):
    """
    Retrieve detailed information for a specific article by its ID.
    
    Args:
        article_id (int): The unique ID of the article.

    Returns:
        JSON object containing article details or a 404 error if not found.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch article details based on the given ID
    cursor.execute("""
        SELECT title, article_url, pmid, doi, publication_date
        FROM articles
        WHERE id = ?
    """, (article_id,))
    
    row = cursor.fetchone()
    conn.close()

    if row is None:
        return jsonify({"error": "Article not found"}), 404  # Return 404 if article is missing
    
    return jsonify({
        "id": article_id,
        "title": row["title"] or "Title Not Available",
        "url": row["article_url"],
        "citation": f"PMID: {row['pmid']}" if row["pmid"] else f"DOI: {row['doi']}" if row["doi"] else "No Citation Available",
        "date": row["publication_date"] or "Unknown Date",
        "summary": "Coming Soon...",  # Placeholder for AI-generated summary
        "results": "Coming Soon..."  # Placeholder for AI-generated results
    })

# -----------------------------------------
# ✅ Start the API Server
# -----------------------------------------
if __name__ == "__main__":
    """
    Starts the Flask server in debug mode.
    
    The server will run at http://127.0.0.1:5000 by default.
    """
    app.run(debug=True)
