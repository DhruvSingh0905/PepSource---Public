from flask import Flask, jsonify, request, redirect
from flask_cors import CORS
import os
from supabase import create_client, Client
from dotenv import load_dotenv
import requests
import random
import datetime as dt
import json
import traceback
import stripe

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

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

@app.route("/create-payment-intent", methods=["POST"])
def create_payment():
    try:
        data = request.json
        amount = data.get("amount", 1000)  # Default to $10 (amount in cents)
        currency = "usd"

        # Create a PaymentIntent with Stripe
        intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency
        )

        return jsonify({
            "clientSecret": intent.client_secret
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 400
    
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

    # Upsert the user data into Supabase's auth.users table if needed.
    createOrUpdateUser(
        user_info.get("name"),
        user_info.get("email"),
        user_info.get("picture"),
        access_token,
        refresh_token,
        expires_in
    )

    # Now, fetch the current user from Supabase Auth.
    auth_response = supabase.auth.getUser()
    if auth_response.data is None or auth_response.data.get("user") is None:
        return jsonify({"status": "error", "message": "Failed to retrieve user info from Supabase Auth."}), 400

    user = auth_response.data["user"]

    # Upsert the user's profile data into the public.profiles table.
    createOrUpdateProfile(user)

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
    # Upsert into auth.users – adjust this call as needed if you manage your auth separately.
    response = supabase.table("auth.users").upsert(data, on_conflict="email").execute()
    if not response.data:
        print("Error upserting user into auth.users:", response)
    else:
        print("User upserted into auth.users successfully.")

def createOrUpdateProfile(user):
    # Prepare profile data using the current user's info.
    # Use user_metadata.name if available; otherwise fallback to email.
    display_name = (user.get("user_metadata") or {}).get("name") or user.get("email")
    profile_data = {
        "id": user["id"],  # This is a UUID string.
        "display_name": display_name,
        "email": user.get("email")
    }
    response = supabase.table("profiles").upsert(profile_data, on_conflict="id").execute()
    if not response.data:
        print("Error upserting profile:", response)
    else:
        print("Profile upserted successfully.")

def check_user_exists(account_id: str) -> bool:
    """
    Check if a user with the given account_id exists in the public profiles table.
    """
    response = supabase.table("profiles").select("id").eq("id", account_id).execute()
    with open("account_id_log.txt", "a", encoding="utf-8") as log_file:
        log_file.write(f"{dt.datetime.now()}: Check for account_id {account_id} -> {response}\n")
    return response.data is not None and len(response.data) > 0

@app.route("/api/getUser", methods=["GET"])
def get_user():
    email = request.args.get("email")
    name = request.args.get("name")
    user_data = get_user_info_and_preferences(email, name)
    return jsonify(user_data)

def get_user_info_and_preferences(email, name):
    response = supabase.table("profiles").select("*").eq("email", email).execute()
    user = response.data[0] if response.data else None
    pref_response = supabase.table("user_preferences").select("*").eq("user_id", user["id"] if user else None).execute()
    preferences = pref_response.data if pref_response.data else "No preferences set for this user."
    return {"user_info": user, "user_preferences": preferences}

@app.route("/api/drugs/totalcount", methods=["GET"])
def fetch_drug_count():
    response = supabase.table("drugs").select("id", count="exact").execute()

    return jsonify({"total": response.count})

@app.route("/api/drugs/names", methods=["GET"])
def fetch_drug_names():
    try:
        # Get limit and offset if provided, otherwise default to None.
        limit = request.args.get("limit", default=None, type=int)
        offset = request.args.get("offset", default=None, type=int)
        
        # Start building the query.
        query = supabase.table("drugs").select("id, name, proper_name")
        
        # Only apply range if both limit and offset are provided.
        if limit is not None and offset is not None:
            query = query.range(offset, offset + limit - 1)
        
        response = query.execute()
        data = response.data
        
        if data:
            return jsonify({"status": "success", "drugs": data})
        else:
            return jsonify({"status": "error", "message": "No drugs found."}), 404
    except Exception as e:
        print(e)
        return jsonify({"status": "error", "message": str(e)}), 500

def get_drug_by_name(drug_name):
    # Build the OR condition to match either 'name' or 'proper_name'
    condition = f"name.ilike.%{drug_name}%," f"proper_name.ilike.%{drug_name}%"
    response = supabase.table("drugs")\
        .select("id, name, proper_name, what_it_does, how_it_works")\
        .or_(condition)\
        .execute()
    data = response.data
    if data and len(data) > 0:
        return data[0]
    return None

def get_vendors_by_drug_id(drug_id):
    try:
        response = supabase.table("vendors").select("*").eq("drug_id", drug_id).execute()
        return response.data if response.data else None
    except Exception as e:
        #print(f"getVendorsByDrugId error: {e}")
        return None

@app.route("/api/drug/<path:drug_name>/vendors", methods=["GET"])
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

@app.route("/api/drug/<string:drug_id>/random-image", methods=["GET"])
def fetch_random_vendor_image(drug_id):
    drug = ""
    vendors = ""
    try:
        def retryFunc(func, arg, maxRetries=5):
            retryCounter = 0
            treasure = None
            while treasure == None and retryCounter < maxRetries:
                treasure = func(arg)
                retryCounter += 1
                if treasure: return treasure

        # drug = retryFunc(get_drug_by_name, drug_name)
        # if not drug:
        #     print(f"No drug found with name '{drug_name}'.")
        #     return jsonify({"status": "error", "message": f"No drug found with name '{drug_name}'."}), 404
        
        vendors = retryFunc(get_vendors_by_drug_id, drug_id)
        if not vendors:
            #print(f"No vendors found for drug with id '{drug_id}'.")
            return jsonify({"status": "error", "message": f"No vendors found for drug with id '{drug_id}'."}), 404
        else:
            random_image = []
            for v in vendors:
                if v.get("cloudinary_product_image") or v.get("product_image"):
                    random_image.append(v.get("cloudinary_product_image") or v.get("product_image"))
            #print(f"\n\nName: {drug_name}{random_image}\n\n")
            return jsonify({"status": "success", "drug": drug, "random_vendor_image": random_image[0]})
    except Exception as e:
        print(e)
        print(f"\n\nError: {e}: | DRUG: {drug} | Vendor: {vendors} | ID: {drug_id}\n\n")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/reviews", methods=["POST"])
def post_review():
    data = request.get_json()
    required_fields = ["account_id", "target_type", "target_id", "rating", "review_text"]
    if not all(field in data for field in required_fields):
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    # account_id is expected to be a UUID string
    account_id = str(data["account_id"])
    print(f"Received account_id: {account_id}")

    # Check if the user exists in the profiles table.
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
        if not response.data:
            return jsonify({"status": "error", "message": "Failed to insert review."}), 500
        return jsonify({"status": "success", "review_id": response.data[0]["id"]}), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/reviews/drug/<int:drug_id>", methods=["GET"])
def get_drug_reviews(drug_id):
    try:
        response = supabase.table("reviews")\
            .select("*, profiles(*)")\
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
            .select("*, profiles(*)")\
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
    
@app.route("/api/reviews/<int:review_id>", methods=["PUT"])
def edit_review(review_id):
    data = request.get_json()
    required_fields = ["account_id", "rating", "review_text"]
    if not all(field in data for field in required_fields):
        return jsonify({"status": "error", "message": "Missing required fields."}), 400

    # Fetch the review to verify its existence and ownership.
    review_resp = supabase.table("reviews").select("*").eq("id", review_id).execute()
    if not review_resp.data:
        return jsonify({"status": "error", "message": "Review not found."}), 404

    review = review_resp.data[0]
    if str(review["account_id"]) != str(data["account_id"]):
        return jsonify({"status": "error", "message": "Unauthorized: You can only edit your own reviews."}), 403

    try:
        update_resp = supabase.table("reviews").update({
            "rating": data["rating"],
            "review_text": data["review_text"]
        }).eq("id", review_id).execute()
        if not update_resp.data:
            return jsonify({"status": "error", "message": "Failed to update review."}), 500
        return jsonify({"status": "success", "message": "Review updated successfully."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
DB_FILE = os.path.join("DB", "pepsources.db")


@app.route("/api/articles", methods=["GET"])
def get_articles():
    """
    Fetch all articles with AI-generated fields from Supabase.
    Optionally, filter by drug_id if provided as a query parameter.
    Only articles with a non-empty ai_heading are returned.
    """
    drug_id = request.args.get("drug_id")
    try:
        table = supabase.table("articles")
        if drug_id:
            response = table.select("*").eq("drug_id", drug_id).execute()
        else:
            response = table.select("*").execute()
        
        articles = response.data if response.data else []
        # Filter out articles without an AI-generated heading.
        articles = [a for a in articles if a.get("ai_heading") and a.get("ai_heading").strip() != ""]
        
        return jsonify({"status": "success", "articles": articles})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/vendor_details", methods=["GET"])
def get_vendor_details():
    vendor_name = request.args.get("name")
    if not vendor_name:
        return jsonify({"status": "error", "message": "Vendor name is required."}), 400
    try:
        # Query vendordetails by vendor name
        response = supabase.table("vendordetails").select("*").eq("name", vendor_name).execute()
        data = response.data
        if data and len(data) > 0:
            vendor = data[0]
            return jsonify({"status": "success", "vendor": vendor})
        else:
            return jsonify({"status": "error", "message": "Vendor details not found."}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=8000, use_reloader=False)