from flask import Flask, jsonify, request, redirect
from flask_cors import CORS
import os
from supabase import create_client, Client
from dotenv import load_dotenv
import requests
import random
import datetime as dt
import json
import uuid
# Load environment variables from .env
load_dotenv()

app = Flask(__name__)
CORS(app)

# Get Supabase credentials from environment variables.
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("VITE_SUPABASE_SERVICE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise Exception("Supabase credentials are not set in the environment.")

# Create the Supabase client.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:8000")
def check_user_exists(account_id):
    """Check if the given account_id exists in Supabase auth.users."""
    # Note: We assume the client sends a valid UUID for account_id.
    # Using supabase.auth.getUser() on the client side is recommended.
    response = supabase.table("auth.users").select("id").eq("id", account_id).execute()
    return response.data and len(response.data) > 0

@app.route("/finishLogin", methods=["GET"])
def finish_login():
    code = request.args.get("code")
    if not code:
        return jsonify({"status": "error", "message": "Authorization code is required"}), 400

    redirect_uri = "http://127.0.0.1:8000/finishLogin"
    client_id = os.getenv("VITE_GOOGLE_CLIENT_ID")
    client_secret = os.getenv("VITE_GOOGLE_CLIENT_SECRET")

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
    refresh_token = token_json.get("refresh_token")
    expires_in = token_json.get("expires_in")
    if not access_token:
        return jsonify({"status": "error", "message": "Access token not received"}), 400

    user_info_response = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    user_info = user_info_response.json()
    if "error" in user_info:
        return jsonify({"status": "error", "message": "Failed to fetch user info"}), 400

    # Upsert the user data into Supabase's auth.users table.
    createOrUpdateUser(
        user_info.get("name"),
        user_info.get("email"),
        user_info.get("picture"),
        access_token,
        refresh_token,
        expires_in
    )
    return redirect(f"{FRONTEND_URL}?name={user_info['name']}&email={user_info['email']}")

def createOrUpdateUser(name, email, pfp, access_token, refresh_token, expires_in):
    data = {
        "name": name,
        "email": email,
        "pfp": pfp,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": expires_in,
    }
    response = supabase.table("auth.users").upsert(data, on_conflict="email").execute()
    if response.get("error"):
        print("Error upserting user:", response["error"])
    else:
        print("User upserted successfully.")

@app.route("/api/getUser", methods=["GET"])
def get_user():
    email = request.args.get("email")
    name = request.args.get("name")
    user_data = get_user_info_and_preferences(email, name)
    return jsonify(user_data)

def get_user_info_and_preferences(email, name):
    response = supabase.table("auth.users").select("*").eq("email", email).eq("name", name).execute()
    user = response.data[0] if response.data else None
    pref_response = supabase.table("user_preferences").select("*").eq("user_id", user["id"] if user else None).execute()
    preferences = pref_response.data if pref_response.data else "No preferences set for this user."
    return {"user_info": user, "user_preferences": preferences}

@app.route("/api/drugs/names", methods=["GET"])
def fetch_drug_names():
    try:
        offset = 0
        limit = 1000  # Adjust as needed.
        response = supabase.table("drugs")\
            .select("id, name, proper_name")\
            .range(offset, offset + limit - 1)\
            .execute()
        data = response.data
        if data:
            return jsonify({"status": "success", "drugs": data})
        else:
            return jsonify({"status": "error", "message": "No drugs found."}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

def get_drug_by_name(drug_name):
    response = supabase.table("drugs").select("id, name, proper_name, what_it_does, how_it_works")\
        .ilike("name", f"%{drug_name}%")\
        .execute()
    data = response.data
    if data and len(data) > 0:
        return data[0]
    return None

def get_vendors_by_drug_id(drug_id):
    response = supabase.table("vendors").select("*").eq("drug_id", drug_id).execute()
    return response.data if response.data else []

@app.route("/api/drug/<string:drug_name>/vendors", methods=["GET"])
def fetch_vendors_by_drug_name(drug_name):
    try:
        drug = get_drug_by_name(drug_name)
        if not drug:
            return jsonify({"status": "error", "message": f"No drug found with name '{drug_name}'."}), 404
        vendors = get_vendors_by_drug_id(drug["id"])
        random_image = None
        if vendors:
            valid_images = [v.get("cloudinary_product_image") or v.get("product_image") for v in vendors if (v.get("cloudinary_product_image") or v.get("product_image"))]
            if valid_images:
                random_image = random.choice(valid_images)
        return jsonify({
            "status": "success",
            "drug": drug,
            "vendors": vendors,
            "random_vendor_image": random_image,
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/drug/<string:drug_name>/random-image", methods=["GET"])
def fetch_random_vendor_image(drug_name):
    try:
        drug = get_drug_by_name(drug_name)
        if not drug:
            return jsonify({"status": "error", "message": f"No drug found with name '{drug_name}'."}), 404
        vendors = get_vendors_by_drug_id(drug["id"])
        random_image = None
        if vendors:
            valid_images = [v.get("cloudinary_product_image") or v.get("product_image") for v in vendors if (v.get("cloudinary_product_image") or v.get("product_image"))]
            if valid_images:
                random_image = random.choice(valid_images)
        return jsonify({"status": "success", "drug": drug, "random_vendor_image": random_image})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
def check_account_id(account_id):
    try:
        # Ensure account_id is a string
        account_id_str = str(account_id)
        # Validate it as a UUID
        uuid.UUID(account_id_str)
        return True
    except ValueError:
        return False

# Instead of checking via table queries, we omit the check_user_exists step.
@app.route("/api/reviews", methods=["POST"])
def post_review():
    data = request.get_json()
    required_fields = ["account_id", "target_type", "target_id", "rating", "review_text"]
    if not all(field in data for field in required_fields):
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    # Convert account_id to string before validating as a UUID.
    account_id = str(data["account_id"])

    try:
        # Validate that account_id is a proper UUID.
        uuid.UUID(account_id)
    except ValueError:
        return jsonify({"status": "error", "message": "Invalid account ID format. Must be a UUID."}), 400

    # Ensure the user exists in auth.users
    if not check_user_exists(account_id):
        return jsonify({"status": "error", "message": "User not found."}), 404

    try:
        created_at = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        review_data = {
            "account_id": account_id,
            "target_type": data["target_type"],
            "target_id": data["target_id"],
            "rating": data["rating"],
            "review_text": data["review_text"],
            "created_at": created_at
        }
        response = supabase.table("reviews").insert(review_data).execute()
        if response.get("error"):
            return jsonify({"status": "error", "message": response["error"]["message"]}), 500
        return jsonify({"status": "success", "review_id": response.data[0]["id"]}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
            
@app.route("/api/reviews/drug/<int:drug_id>", methods=["GET"])
def get_drug_reviews(drug_id):
    try:
        response = supabase.table("reviews")\
            .select("*")\
            .eq("target_type", "drug")\
            .eq("target_id", drug_id)\
            .order("created_at", desc=True)\
            .execute()
        return jsonify({"status": "success", "reviews": response.data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/reviews/vendor/<int:vendor_id>", methods=["GET"])
def get_vendor_reviews(vendor_id):
    try:
        response = supabase.table("reviews")\
            .select("*")\
            .eq("target_type", "vendor")\
            .eq("target_id", vendor_id)\
            .order("created_at", desc=True)\
            .execute()
        return jsonify({"status": "success", "reviews": response.data})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/log", methods=["POST"])
def log_request_body():
    try:
        data = request.get_json(force=True)
        with open("logs.txt", "a", encoding="utf-8") as f:
            f.write(json.dumps(data) + "\n")
        return jsonify({"status": "success", "message": "Log saved."}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=8000, use_reloader=False)@app.route("/api/reviews", methods=["POST"])
def post_review():
    data = request.get_json()
    required_fields = ["account_id", "target_type", "target_id", "rating", "review_text"]
    if not all(field in data for field in required_fields):
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    # For testing, we remove the check_user_exists call.
    # In production, you should validate the user's session (e.g. via JWT).
    try:
        created_at = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        review_data = {
            "account_id": data["account_id"],
            "target_type": data["target_type"],
            "target_id": data["target_id"],
            "rating": data["rating"],
            "review_text": data["review_text"],
            "created_at": created_at
        }
        response = supabase.table("reviews").insert(review_data).execute()
        if response.get("error"):
            return jsonify({"status": "error", "message": response["error"]["message"]}), 500
        return jsonify({"status": "success", "review_id": response.data[0]["id"]}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500