from flask import Flask, jsonify, request, redirect
from flask_cors import CORS
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime
import requests
import random
import datetime as dt
import json
import traceback
from functools import lru_cache
import time
from openai import OpenAI
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

PRICE_ID = os.getenv("STRIPE_PRICE_ID")         # e.g., "price_1Hxxxxxxxxxxxx" for $5/month.
WEBHOOK_SECRET = os.getenv("")  #TODO: For webhook verification. Configure this in Stripe and put it in the env
@app.route("/map-user-subscription", methods=["POST"])
def map_user_subscription():
    try:
        data = request.json
        user_email = data.get("user_email")
        user_id = data.get("user_id")

        if not user_email:
            return jsonify(error="user_email not provided"), 400
        if not user_id:
            return jsonify(error="user_id not provided"), 400

        # Query the auth schema's users table for the user.
        # Note: The auth.users table is in the protected schema.

        # Query the public schema's subscriptions table to find the subscription record linked to this user.
        sub_response = supabase.table("subscriptions").select("*").eq("user_id", user_id).execute()
        subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
        
        if not subscription:
            customer = stripe.Customer.create(email=user_email)
            # Create a new subscription record for this user.
            new_sub_response = supabase.table("subscriptions").insert({"user_id": f"{user_id}", "email": f"{user_email}" , "stripe_id": f"{customer.id}"}).execute()
            subscription = new_sub_response.data[0] if new_sub_response.data else None
        # Return the mapping information.

        return jsonify({
            "user_id": user_id,
            "subscription": subscription
        })
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 400

@app.route("/create-subscription", methods=["POST"])
def create_subscription():
    try:
        data = request.json
        # Get details from the payload.
        customer_id = data.get("customerId")
        price_id = data.get("priceId") or PRICE_ID
        payment_method_id = data.get("payment_method_id")

        if not price_id:
            return jsonify(error="Price ID not provided"), 400
        if not payment_method_id:
            return jsonify(error="Payment method ID not provided"), 400
        if not customer_id:
            return jsonify(error="Customer id not provided, this is internal server error"), 400

        # Attach the PaymentMethod to the customer.
        stripe.PaymentMethod.attach(
            payment_method_id,
            customer=customer_id,
        )

        # Create the subscription and attach the payment method as the default.
        subscription = stripe.Subscription.create(
            customer=customer_id,
            items=[{"price": price_id}],
            default_payment_method=payment_method_id,
            expand=["latest_invoice.payment_intent"],
        )
        #print(subscription)
        return jsonify(subscription)
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 400
    
@app.route("/user-subscription", methods=["GET"])
def user_subscription():
    try:
        id = request.args.get("user_id")
        sub_response = supabase.table("subscriptions").select("*").eq("user_id", id).execute()
        subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None

        return jsonify({"info": subscription})
    except Exception as e:
        print(e) 

@app.route("/webhook", methods=["POST"]) 
def stripe_webhook():
    try:
        payload = request.data
        sig_header = request.headers.get("Stripe-Signature")
        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, WEBHOOK_SECRET
            )
        except Exception as e:
            traceback.print_exc()
            return jsonify(error=str(e)), 400

        # Handle various webhook events.
        if event["type"] == "invoice.payment_succeeded":
            updateUserSubscription(event, hasSubscription=True, paid=True)

        elif event["type"] == "invoice.payment_failed":
            updateUserSubscription(event, hasSubscription=False, paid=False) #Revoke users subscription if they fail to pay
            # TODO: Notify the user of a failed payment and update the subscription status.
        
        elif event["type"] == "customer.subscription.deleted":
            updateUserSubscription(event, hasSubscription=False, paid=False)
            # TODO: Send email notifying email cancellation

    except Exception as e:
        print(e)
    # Add more event types as needed.

    return jsonify(success=True)

def updateUserSubscription(event, hasSubscription=False, paid=False) -> bool:
    invoice = event["data"]["object"]
    customer = invoice["customer"]

    sub_response = supabase.table("subscriptions").select("*").eq("stripe_id", customer).execute()
    subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None

    if subscription:
        updated_data = {  # Define the fields you want to update
            "has_subscription": hasSubscription,  
            "paid": paid
        }
        # Use the update method with a filter to target the row by stripe_id
        supabase.table("subscriptions").update(updated_data).eq("stripe_id", customer).execute()
        print("Update successful")
        return True
    else:
        print("No subscription found for stripe_id:", customer)
        return False

@app.route("/finishLogin", methods=["GET"])
def finish_login():
    # Retrieve the current user from Supabase Auth.
    auth_response = supabase.auth.getUser()
    if auth_response.data is None or auth_response.data.get("user") is None:
        return jsonify({"status": "error", "message": "Failed to retrieve user info from Supabase Auth."}), 400

    user = auth_response.data["user"]
    # Use the name from user_metadata if available; otherwise fallback to the email.
    name = (user.get("user_metadata") or {}).get("name") or user.get("email")
    email = user.get("email")

    # Check if a profile row already exists in the public.profiles table.
    profile_response = supabase.table("profiles").select("*").eq("id", user["id"]).execute()
    if not profile_response.data or len(profile_response.data) == 0:
        # Create a new profile row if it doesn't exist.
        profile_data = {
            "id": user["id"],  # Use the user's UUID.
            "display_name": name,
            "email": email,
            "embedding": None,
            "updated_at": None
        }
        upsert_response = supabase.table("profiles").upsert(profile_data, on_conflict="id").execute()
        if upsert_response.get("error"):
            return jsonify({
                "status": "error",
                "message": "Failed to create profile: " + upsert_response["error"]["message"]
            }), 500

    # Redirect to the frontend with the user's name and email.
    return redirect(f"{FRONTEND_URL}?name={name}&email={email}")

# These helper functions are now empty since we removed the logic.

def check_user_exists(account_id: str) -> bool:
    response = supabase.table("profiles").select("id").eq("id", account_id).execute()
    with open("account_id_log.txt", "a", encoding="utf-8") as log_file:
        log_file.write(f"{dt.datetime.now()}: Check for account_id {account_id} -> {response}\n")
    return response.data is not None and len(response.data) > 0

@app.route("/api/getUser", methods=["GET"])
def get_user():
    try:
        id = request.args.get("id")
        if id:
            user_data = get_user_info_and_preferences(id)
        else: return jsonify(None)
        return jsonify(user_data)
    except Exception as e:
        print(e)
        return jsonify(None), 500

def get_user_info_and_preferences(id):
    response = supabase.table("profiles").select("*").eq("id", id).execute()
    user = response.data[0] if response.data else None
    return {"user_info": user}

@app.route("/api/setPreferences", methods=["POST"])
def setPreferences():
    try:
        data = request.json
        id = data.get("id")
        preferences = list(data.get("preferences"))
        user = get_user_info_and_preferences(id)
        new_preferences = preferences
        print(user)
        if user["user_info"]["preferences"]:
            new_preferences = user.preferences + preferences

        response = supabase.table("profiles").update({"preferences": new_preferences}).eq("id", id).execute()
        return {"status": "success"}
    except Exception as e:
        traceback.print_exc()
        return {"status": "failure"}, 500

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

@app.route("/api/vendor_price_ratings", methods=["GET"])
def get_vendor_price_ratings():
    vendor_name = request.args.get("name")
    if not vendor_name:
        return jsonify({"status": "error", "message": "Vendor name is required."}), 400
    
    try:
        # Query vendordetails by vendor name, but only select the price rating fields
        response = supabase.table("vendordetails").select("small_order_rating, large_order_rating").eq("name", vendor_name).execute()
        data = response.data
        
        if data and len(data) > 0:
            ratings = {
                "small_order_rating": data[0].get("small_order_rating"),
                "large_order_rating": data[0].get("large_order_rating")
            }
            return jsonify({"status": "success", "ratings": ratings})
        else:
            return jsonify({"status": "error", "message": "Vendor price ratings not found."}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

@lru_cache(maxsize=100)
def get_cached_search_results(query):
    # Hash with timestamp rounded to 15-minute intervals to auto-expire
    timestamp = int(time.time() / 900)  # 900 seconds = 15 minutes
    return f"{query}_{timestamp}"

@app.route("/api/ai-search", methods=["POST"])
def ai_search():
    try:
        data = request.json
        query = data.get("query", "")
        
        if not query:
            return jsonify({"status": "error", "message": "Query is required."}), 400
        
        # Check cache first
        cache_key = get_cached_search_results(query)
        if hasattr(get_cached_search_results, "cache_dict") and cache_key in get_cached_search_results.cache_dict:
            return jsonify({"status": "success", "recommendations": get_cached_search_results.cache_dict[cache_key]})
        
        # Step 1: Generate embedding for the search query
        embedding_response = client.embeddings.create(
            model="text-embedding-3-small",  # Cheaper model
            input=query
        )
        query_embedding = embedding_response.data[0].embedding
        
        # Step 2: Search for similar drugs in Supabase
        response = supabase.rpc(
            "match_drugs", 
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.6,
                "match_count": 5
            }
        ).execute()
        
        similar_drugs = response.data
        
        # If no results from vector search, fallback to keyword search
        if not similar_drugs:
            keyword_response = supabase.table("drugs").select("id, proper_name, what_it_does, how_it_works").or_(
                f"proper_name.ilike.%{query}%,what_it_does.ilike.%{query}%,how_it_works.ilike.%{query}%"
            ).limit(5).execute()
            similar_drugs = keyword_response.data
        
        if not similar_drugs:
            return jsonify({
                "status": "success", 
                "recommendations": []
            })
        
        # Step 3: Construct context from the search results
        context = "Here are some relevant compounds from our database:\n\n"
        for drug in similar_drugs:
            context += f"Name: {drug['proper_name']}\n"
            context += f"What it does: {drug.get('what_it_does', 'N/A')}\n"
            context += f"How it works: {drug.get('how_it_works', 'N/A')}\n\n"
        
        # Step 4: Use a cheaper LLM to generate recommendations
        system_prompt = """You are an AI assistant for a health supplement website. 
            Your task is to recommend products based on user queries about health goals.
            Be informative but concise. Always mention the proper name of the compound.
            Focus only on the compounds provided in the context.
            For each recommendation, explain why it might be relevant to the user's query.
            Return exactly 3 recommended compounds maximum.
            
            Format your response as a JSON array of objects with the following structure:
            [{"proper_name": "Product Name", "reason": "Reason for recommendation"}]
            """
        
        user_prompt = f"USER QUERY: \"{query}\"\n\nCONTEXT:\n{context}"
        
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo",  # Much cheaper than GPT-4
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,  # Lower temperature for more consistent results
            max_tokens=500,   # Limit token usage
            response_format={"type": "json_object"}  # Force JSON format
        )
        
        response_content = completion.choices[0].message.content
        recommendations = json.loads(response_content).get("recommendations", [])
        
        # Cache the results
        if not hasattr(get_cached_search_results, "cache_dict"):
            get_cached_search_results.cache_dict = {}
        get_cached_search_results.cache_dict[cache_key] = recommendations
        
        return jsonify({
            "status": "success", 
            "recommendations": recommendations
        })
        
    except Exception as e:
        print(f"Error in AI search: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    



@app.route("/api/drug/form/<drug_name>", methods=["GET"])
def get_drug_form(drug_name):
    """
    Retrieves the form classification for a drug by name.
    
    Returns:
        JSON response with the form classification or an error message.
    """
    if not drug_name:
        return jsonify({"status": "error", "message": "Drug name is required."}), 400
    
    try:
        # First, try to find the drug ID
        response = supabase.table("drugs").select("id").eq("name", drug_name).execute()
        
        if not response.data:
            # Try search with lowercase and trimmed spaces
            normalized_name = drug_name.lower().strip()
            response = supabase.table("drugs").select("id").ilike("name", f"%{normalized_name}%").execute()
        
        if not response.data:
            return jsonify({"status": "error", "message": f"Drug '{drug_name}' not found."}), 404
        
        drug_id = response.data[0]["id"]
        
        # Get the vendor with this drug_id that has a form classification
        vendor_response = supabase.table("vendors").select("form").eq("drug_id", drug_id).not_.is_("form", "null").execute()
        
        if not vendor_response.data:
            return jsonify({
                "status": "success", 
                "drug_name": drug_name,
                "form": None,
                "message": "Form classification not available for this drug."
            })
        
        # Return the form from the first vendor (assuming most vendors of the same drug have the same form)
        return jsonify({
            "status": "success",
            "drug_name": drug_name,
            "form": vendor_response.data[0]["form"]
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": f"Error retrieving form: {str(e)}"}), 500
    

@app.route("/api/search/drugs", methods=["GET"])
def fuzzy_search_drugs():
    """
    Performs fuzzy search on drug names using vector similarity and text matching
    """
    query = request.args.get("query")
    limit = request.args.get("limit", default=10, type=int)
    threshold = request.args.get("threshold", default=0.6, type=float)
    
    if not query:
        return jsonify({"status": "error", "message": "Search query is required."}), 400
    
    try:
        # Call the fuzzy_match_drug_names function in Supabase
        response = supabase.rpc(
            "fuzzy_match_drug_names", 
            {
                "search_term": query,
                "similarity_threshold": threshold,
                "max_results": limit
            }
        ).execute()
        
        drugs = response.data
        
        # If no results from vector search, fall back to basic substring matching
        if not drugs:
            fallback_response = supabase.table("drugs").select("id,name,proper_name,what_it_does,how_it_works").or_(
                f"name.ilike.%{query}%,proper_name.ilike.%{query}%"
            ).limit(limit).execute()
            
            drugs = fallback_response.data
            
            # Add similarity scores to fallback results
            for drug in drugs:
                # Simple substring match gets 0.7 similarity
                drug["similarity"] = 0.7
        
        # For each drug, get a random vendor image if available
        for drug in drugs:
            try:
                img_response = supabase.table("vendors").select("cloudinary_product_image").eq("drug_id", drug["id"]).limit(1).execute()
                if img_response.data and img_response.data[0].get("cloudinary_product_image"):
                    drug["img"] = img_response.data[0]["cloudinary_product_image"]
                else:
                    drug["img"] = None
            except Exception:
                drug["img"] = None
        
        return jsonify({
            "status": "success",
            "drugs": drugs
        })
        
    except Exception as e:
        error_details = {
            "status": "error",
            "message": f"Error in fuzzy search: {str(e)}",
            "error_type": type(e).__name__,
            "details": str(e),
            "query_params": {
                "query": query,
                "limit": limit,
                "threshold": threshold
            }
        }
        
        app.logger.error(f"Search API error: {error_details}")
        return jsonify(error_details), 500
    




@app.route("/api/drug/<int:drug_id>/effects_info", methods=["GET"])
def get_drug_effects_info(drug_id):
    """
    Endpoint to fetch side effect profiles and timeline information for a drug.
    Returns data in a structured format ready for display in the UI.
    """
    try:
        # Query the drug from Supabase
        response = supabase.table("drugs")\
            .select("id,name,proper_name,side_effects_normal,side_effects_worrying,side_effects_stop_asap,effects_timeline")\
            .eq("id", drug_id)\
            .execute()
        
        if not response.data:
            return jsonify({"status": "error", "message": "Drug not found"}), 404
        
        drug_data = response.data[0]
        
        # Process side effects data if available
        side_effects = None
        if any([drug_data.get("side_effects_normal"), drug_data.get("side_effects_worrying"), drug_data.get("side_effects_stop_asap")]):
            try:
                side_effects = {
                    "normal": json.loads(drug_data.get("side_effects_normal") or "[]"),
                    "worrying": json.loads(drug_data.get("side_effects_worrying") or "[]"),
                    "stop_asap": json.loads(drug_data.get("side_effects_stop_asap") or "[]")
                }
            except json.JSONDecodeError:
                # Handle case where the data might not be valid JSON
                side_effects = {
                    "normal": [],
                    "worrying": [],
                    "stop_asap": []
                }
        
        # Process timeline data if available
        effects_timeline = None
        if drug_data.get("effects_timeline"):
            try:
                effects_timeline = json.loads(drug_data.get("effects_timeline"))
            except json.JSONDecodeError:
                effects_timeline = None
        
        return jsonify({
            "status": "success",
            "drug_name": drug_data.get("proper_name") or drug_data.get("name"),
            "side_effects": side_effects,
            "effects_timeline": effects_timeline
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
    
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000,debug=True, use_reloader=True)
    #app.run(debug=True, port=8000, use_reloader=True)