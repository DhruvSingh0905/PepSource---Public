from flask import Flask, jsonify, request, redirect
from flask_cors import CORS
import sqlite3
import random
import logging
import os
import requests

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
DB_PATH = "DB/pepsources.db"
DB_FILE = DB_PATH
frontEndUrl = "http://localhost:5173/"

#!TODO: Check if there is any vulnerabilities for sql injections
@app.route("/finishLogin", methods=["GET"])
def finish_login():
    """Handle the callback from Google OAuth after the user has authorized the app."""
    code = request.args.get("code")  # Use .get() to avoid errors if "code" is missing
    if not code:
        return jsonify({"status": "error", "message": "Authorization code is required"}), 400

    redirect_uri = "http://127.0.0.1:8000/finishLogin"
    client_id = os.getenv("VITE_GOOGLE_CLIENT_ID")
    client_secret = os.getenv("VITE_GOOGLE_CLIENT_SECRET")

    # Step 1: Exchange the authorization code for an access token & refresh token
    token_data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }
    token_response = requests.post("https://oauth2.googleapis.com/token", data=token_data)
    token_json = token_response.json()
    if "error" in token_json:
        return jsonify({"status": "error", "message": token_json.get("error_description", "Failed to get token")}), 400

    access_token = token_json.get("access_token")
    refresh_token = token_json.get("refresh_token")  # This is where you correctly obtain the refresh token
    expires_in = token_json.get("expires_in")
    if not access_token:
        return jsonify({"status": "error", "message": "Access token not received"}), 400

    # Step 2: Retrieve user's profile information
    user_info_response = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    user_info = user_info_response.json()

    if "error" in user_info:
        return jsonify({"status": "error", "message": "Failed to fetch user info"}), 400

    # Step 3: Update the user's information in the database
    createOrUpdateUser(
        user_info.get("name"),
        user_info.get("email"),
        user_info.get("picture"),
        access_token,
        refresh_token,  # Save the refresh token if available
        expires_in
    )
    return redirect(f"{frontEndUrl}?name={user_info['name']}&email={user_info['email']}") 
    # return jsonify({
    #     "status": "success",
    #     "message": "Login successful!",
    #     "user": user_info
    # }), 200

def createOrUpdateUser(name, email, pfp, access_token, refresh_token, expires_in):
    """Create a new user if they don't exist, or update their info if they do."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    # Check if the user already exists
    cur.execute("SELECT * FROM Users WHERE email = ?", (email,))
    existing_user = cur.fetchone()

    if existing_user:
        # Update existing user info
        cur.execute("""
            UPDATE Users
            SET name = ?, email = ?, pfp = ?, access_token = ?, refresh_token = ?, expires_in = ?
            WHERE email = ?
        """, (name, email, pfp, access_token, refresh_token, expires_in, email))
        conn.commit()
        conn.close()
        return jsonify({
            "status": "success",
            "message": "User info updated successfully."
        }), 200  # HTTP 200 OK

    # Insert new user
    cur.execute("INSERT INTO Users (name, email, pfp, access_token, refresh_token, expires_in) VALUES (?, ?, ?, ?, ?, ?)", (name, email, pfp, access_token, refresh_token, expires_in))
    conn.commit()
    conn.close()

    return jsonify({
        "status": "success",
        "message": "User created successfully."
    }), 201  # HTTP 201 Created

@app.route("/api/getUser", methods=["GET"])
def get_user():
    email = request.args.get("email")
    name = request.args.get("name")

    return jsonify(get_user_info_and_preferences(email, name))

def get_user_info_and_preferences(email, name):
    # Connect to the SQLite database
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Step 1: Find the user's id based on the provided email
    cur.execute("SELECT id FROM Users WHERE email = ? AND name = ?", (email, name))
    user_id = cur.fetchone()

    # If user_id is None, the email doesn't exist in the Users table
    if user_id is None:
        print("User with the provided email doesn't exist.")
        return None
    
    user_id = user_id[0]  # Extract the id from the result tuple

    # Step 2: Retrieve the user's information from the Users table
    cur.execute("SELECT * FROM Users WHERE id = ?", (user_id,))
    user_info = cur.fetchone()

    # Step 3: Retrieve the user's preferences from the user_preferences table using the user_id
    cur.execute("SELECT * FROM user_preferences WHERE user_id = ?", (user_id,))
    user_preferences = cur.fetchone()

    # If user_preferences is None, it means there are no preferences for the user
    if user_preferences is None:
        user_preferences = "No preferences set for this user."

    # Close the connection
    conn.close()

    # Return the user's information along with their preferences
    return {
        'user_info': user_info,
        'user_preferences': user_preferences
    }

def get_all_drugs():
    """Fetch all drugs (id, name, proper_name) from the Drugs table."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, name, proper_name FROM Drugs")
    rows = cur.fetchall()
    conn.close()
    drugs = [dict(row) for row in rows]
    # For matching, force the 'name' field to be lowercase.
    for drug in drugs:
        if drug.get("name"):
            drug["name"] = drug["name"].lower()
    return drugs

@app.route("/api/drugs/names", methods=["GET"])
def fetch_drug_names():
    try:
        drugs = get_all_drugs()
        if drugs:
            return jsonify({
                "status": "success",
                "drugs": drugs
            })
        else:
            return jsonify({
                "status": "error",
                "message": "No drugs found."
            }), 404
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

def get_drug_by_name(drug_name):
    """
    Given a drug name, return the drug row (id, name, proper_name, what_it_does, how_it_works)
    from the Drugs table. The search is case-insensitive and matches if the provided name equals either
    the lowercase 'name' or the lowercase 'proper_name'.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, proper_name, what_it_does, how_it_works FROM Drugs WHERE lower(name) = ? OR lower(proper_name) = ?",
        (drug_name.lower(), drug_name.lower())
    )
    row = cur.fetchone()
    conn.close()
    if row:
        drug = dict(row)
        if drug.get("name"):
            drug["name"] = drug["name"].lower()  # For matching
        return drug
    else:
        return None

def get_vendors_by_drug_id(drug_id):
    """
    Fetch all vendors from the Vendors table that are associated with the given drug_id.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    query = """
        SELECT 
            id, 
            name, 
            product_name, 
            product_link,
            product_image, 
            price, 
            size, 
            drug_id,
            test_certificate, 
            endotoxin_report, 
            sterility_report,
            cloudinary_product_image, 
            cloudinary_test_certificate,
            cloudinary_endotoxin_report, 
            cloudinary_sterility_report
        FROM Vendors
        WHERE drug_id = ?
    """
    cur.execute(query, (drug_id,))
    rows = cur.fetchall()
    conn.close()
    vendors = [dict(row) for row in rows]
    return vendors

@app.route("/api/drug/<string:drug_name>/vendors", methods=["GET"])
def fetch_vendors_by_drug_name(drug_name):
    try:
        drug = get_drug_by_name(drug_name)
        if not drug:
            return jsonify({
                "status": "error",
                "message": f"No drug found with name '{drug_name}'."
            }), 404
        vendors = get_vendors_by_drug_id(drug["id"])
        # Choose a random vendor image from those that have an image available
        random_image = None
        if vendors:
            valid_images = [
                v.get("cloudinary_product_image") or v.get("product_image")
                for v in vendors if (v.get("cloudinary_product_image") or v.get("product_image"))
            ]
            if valid_images:
                random_image = random.choice(valid_images)
        return jsonify({
            "status": "success",
            "drug": drug,
            "vendors": vendors,
            "random_vendor_image": random_image,
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# New Endpoint: Return just the random vendor image for a given drug.
@app.route("/api/drug/<string:drug_name>/random-image", methods=["GET"])
def fetch_random_vendor_image(drug_name):
    try:
        drug = get_drug_by_name(drug_name)
        if not drug:
            return jsonify({
                "status": "error",
                "message": f"No drug found with name '{drug_name}'."
            }), 404
        vendors = get_vendors_by_drug_id(drug["id"])
        random_image = None
        if vendors:
            valid_images = [
                v.get("cloudinary_product_image") or v.get("product_image")
                for v in vendors if (v.get("cloudinary_product_image") or v.get("product_image"))
            ]
            if valid_images:
                random_image = random.choice(valid_images)
        return jsonify({
            "status": "success",
            "drug": drug,
            "random_vendor_image": random_image
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

# Endpoint to post a review
@app.route("/api/reviews", methods=["POST"])
def post_review():
    data = request.get_json()
    required_fields = ["account_id", "target_type", "target_id", "rating", "review_text"]
    if not all(field in data for field in required_fields):
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    account_id = data["account_id"]
    target_type = data["target_type"]
    target_id = data["target_id"]
    rating = data["rating"]
    review_text = data["review_text"]
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO Reviews (account_id, target_type, target_id, rating, review_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (account_id, target_type, target_id, rating, review_text, created_at))
        conn.commit()
        review_id = cursor.lastrowid
        conn.close()
        return jsonify({"status": "success", "review_id": review_id}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Endpoint to get reviews for a drug
@app.route("/api/reviews/drug/<int:drug_id>", methods=["GET"])
def get_drug_reviews(drug_id):
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM Reviews 
            WHERE target_type = 'drug' AND target_id = ?
            ORDER BY created_at DESC
        """, (drug_id,))
        reviews = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify({"status": "success", "reviews": reviews})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# Endpoint to get reviews for a vendor
@app.route("/api/reviews/vendor/<int:vendor_id>", methods=["GET"])
def get_vendor_reviews(vendor_id):
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM Reviews 
            WHERE target_type = 'vendor' AND target_id = ?
            ORDER BY created_at DESC
        """, (vendor_id,))
        reviews = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return jsonify({"status": "success", "reviews": reviews})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=8000, use_reloader=False)