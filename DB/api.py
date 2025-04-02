from flask import Flask, jsonify, request, redirect
from flask_cors import CORS
import os
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
import requests
import random
import datetime as dt
import json
import traceback
from functools import lru_cache
import time
from openai import OpenAI
import stripe
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

app = Flask(__name__)
CORS(app)
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USER = os.getenv("EMAIL_USER", "your-email@example.com")  # Update in .env
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")  # Set this in .env file
CONTACT_RECIPIENT = os.getenv("CONTACT_RECIPIENT", "support@yourcompany.com")  # Email to receive contact form submissions
VENDOR_RECIPIENT = os.getenv("VENDOR_RECIPIENT", "vendors@yourcompany.com")  # Email to receive vendor form submissions


# Get Supabase credentials from environment variables.
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise Exception("Supabase credentials are not set in the environment.")

# Create the Supabase client.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Get frontend URL from environment variable
FRONTEND_URL = os.getenv("FRONTEND_URL")
if not FRONTEND_URL:
    FRONTEND_URL = "http://localhost:3000"  # Default fallback for local development
    print("Warning: FRONTEND_URL environment variable not set. Using default: http://localhost:3000")

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

PRICE_ID = os.getenv("STRIPE_PRICE_ID")         # e.g., "price_1Hxxxxxxxxxxxx" for $5/month.
WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")


@app.route("/api/contact/general", methods=["POST"])
def submit_contact_form():
    """
    Handle general contact form submissions
    """
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ["name", "email", "subject", "message"]
        if not all(field in data for field in required_fields):
            return jsonify({
                "status": "error",
                "message": "Missing required fields. Please provide name, email, subject, and message."
            }), 400
            
        # Basic email validation
        email = data.get("email", "")
        if not "@" in email or not "." in email:
            return jsonify({
                "status": "error", 
                "message": "Please provide a valid email address."
            }), 400
            
        # Format the email
        email_subject = f"Website Contact: {data['subject']}"
        email_body = f"""
        New contact form submission:
        
        Name: {data['name']}
        Email: {data['email']}
        Subject: {data['subject']}
        
        Message:
        {data['message']}
        
        This email was sent from your website contact form.
        """
        
        # Send the email
        success = send_email(
            recipient=CONTACT_RECIPIENT,
            subject=email_subject,
            body=email_body,
            reply_to=data['email']
        )
        
        if success:
            # Log the contact for records (optional)
            try:
                supabase.table("contact_submissions").insert({
                    "name": data['name'],
                    "email": data['email'],
                    "subject": data['subject'],
                    "message": data['message'],
                    "type": "general",
                    "created_at": datetime.now().isoformat()
                }).execute()
            except Exception as log_error:
                # Just log the error, don't fail the request if logging fails
                print(f"Error logging contact submission: {log_error}")
            
            return jsonify({
                "status": "success",
                "message": "Your message has been sent successfully. We'll be in touch soon!"
            })
        else:
            return jsonify({
                "status": "error",
                "message": "Failed to send your message. Please try again later or contact us directly."
            }), 500
            
    except Exception as e:
        print(f"Error in contact form submission: {e}")
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": "An unexpected error occurred. Please try again later."
        }), 500

@app.route("/api/contact/vendor", methods=["POST"])
def submit_vendor_form():
    """
    Handle vendor contact form submissions
    """
    try:
        data = request.json
        
        # Validate required fields
        required_fields = ["companyName", "contactName", "email", "requestType", "message"]
        if not all(field in data for field in required_fields):
            return jsonify({
                "status": "error",
                "message": "Missing required fields. Please complete all required fields."
            }), 400
            
        # Format the email
        email_subject = f"Vendor Request: {data['requestType']} - {data['companyName']}"
        
        # Build the email body
        email_body = f"""
        New vendor request submission:
        
        Company Name: {data['companyName']}
        Contact Name: {data['contactName']}
        Email: {data['email']}
        Phone: {data.get('phone', 'Not provided')}
        Website: {data.get('website', 'Not provided')}
        Request Type: {data['requestType']}
        
        Message:
        {data['message']}
        
        This email was sent from your website vendor contact form.
        """
        
        # Send the email
        success = send_email(
            recipient=VENDOR_RECIPIENT,
            subject=email_subject,
            body=email_body,
            reply_to=data['email']
        )
        
        if success:
            # Log the vendor contact for records (optional)
            try:
                supabase.table("contact_submissions").insert({
                    "company_name": data['companyName'],
                    "contact_name": data['contactName'],
                    "email": data['email'],
                    "phone": data.get('phone', ''),
                    "website": data.get('website', ''),
                    "request_type": data['requestType'],
                    "message": data['message'],
                    "type": "vendor",
                    "created_at": datetime.now().isoformat()
                }).execute()
            except Exception as log_error:
                # Just log the error, don't fail the request if logging fails
                print(f"Error logging vendor submission: {log_error}")
            
            return jsonify({
                "status": "success",
                "message": "Your request has been sent successfully. Our vendor support team will contact you shortly."
            })
        else:
            return jsonify({
                "status": "error",
                "message": "Failed to send your request. Please try again later or contact us directly."
            }), 500
            
    except Exception as e:
        print(f"Error in vendor form submission: {e}")
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": "An unexpected error occurred. Please try again later."
        }), 500

# =============== EMAIL HELPER FUNCTION =============== #
def send_email(recipient, subject, body, reply_to=None):
    """
    Send an email using SMTP
    
    Args:
        recipient (str): Email recipient
        subject (str): Email subject
        body (str): Email body text
        reply_to (str, optional): Reply-to email address
        
    Returns:
        bool: True if email was sent successfully, False otherwise
    """
    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = EMAIL_USER
        msg['To'] = recipient
        msg['Subject'] = subject
        
        # Add reply-to header if provided
        if reply_to:
            msg.add_header('Reply-To', reply_to)
            
        # Attach text body
        msg.attach(MIMEText(body, 'plain'))
        
        # Connect to SMTP server
        server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
        server.starttls()  # Secure the connection
        
        # Login and send
        server.login(EMAIL_USER, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        
        return True
        
    except Exception as e:
        print(f"Email sending error: {e}")
        traceback.print_exc()
        return False





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

        # Query the public schema's subscriptions table to find the subscription record linked to this user.
        sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
        
        if not subscription:
            # Create a Stripe customer
            customer = stripe.Customer.create(email=user_email)
            
            # Create a new subscription record for this user with AI search usage set to 0
            new_sub_response = supabase.table("subscriptions").insert({
                "uuid": f"{user_id}", 
                "email": f"{user_email}", 
                "stripe_id": f"{customer.id}",
                "ai_searches": 0  # Initialize AI search count to 0
            }).execute()
            
            subscription = new_sub_response.data[0] if new_sub_response.data else None
        
        # Return the mapping information
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
        user_id = data.get("user_id")  # Added user_id parameter

        if not price_id:
            return jsonify(error="Price ID not provided"), 400
        if not payment_method_id:
            return jsonify(error="Payment method ID not provided"), 400
        if not customer_id:
            return jsonify(error="Customer id not provided, this is internal server error"), 400
        if not user_id:
            return jsonify(error="User ID not provided"), 400

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
        
        # Reset AI searches to 0 when creating a new subscription
        # Update using 'uuid' column instead of 'user_id'
        supabase.table("subscriptions").update({
            "ai_searches": 0,
            "has_subscription": True,
            "paid": True,
            # Set expiration date to one month from now
            "expires_on": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        }).eq("uuid", user_id).execute()
        
        return jsonify(subscription)
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 400

@app.route("/api/getSubscriptionInfo", methods=["GET"])
def get_subscription_info():
    try:
        """Retrieve subscription details (next payment date, payment method, etc.) from Stripe."""
        user_id = request.args.get("id")  # your app's user ID
        if not user_id: 
            return jsonify({"status": "error", "message": "null userId"}), 400

        # Get subscription record from Supabase
        sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription_record = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
        
        # Check if subscription record exists
        if not subscription_record:
            return jsonify({"status": "inactive", "message": "No subscription record found"}), 404
            
        # Check if has_subscription is False
        if not subscription_record.get("has_subscription"):
            return jsonify({"status": "inactive", "message": "Subscription is not active"}), 200

        # Now that we know has_subscription is True, continue with Stripe check
        stripe_customer_id = subscription_record.get("stripe_id")
        if not stripe_customer_id:
            return jsonify({"status": "error", "message": "No Stripe customer ID found"}), 404

        # Retrieve the user's subscription from Stripe
        subscriptions = stripe.Subscription.list(customer=stripe_customer_id, limit=1)
        if not subscriptions.data:
            # Update Supabase record since Stripe doesn't have the subscription
            supabase.table("subscriptions").update({
                "has_subscription": False,
                "canceled": False,
                "canceled_at": None
            }).eq("uuid", user_id).execute()
            
            return jsonify({"status": "inactive", "message": "No active subscription found in Stripe"}), 200

        subscription = subscriptions.data[0]

        # Next payment date from subscription.current_period_end (Unix timestamp)
        import datetime
        next_payment_unix = subscription.current_period_end
        dt_utc = datetime.datetime.fromtimestamp(next_payment_unix, tz=datetime.timezone.utc)

        # Format it as needed
        next_payment_date_formatted = dt_utc.strftime('%Y-%m-%d %H:%M:%S')
        
        # Retrieve default payment method details, if any
        payment_method_id = subscription.default_payment_method
        payment_method_info = None
        if payment_method_id:
            pm = stripe.PaymentMethod.retrieve(payment_method_id)
            payment_method_info = {
                "brand": pm.card.brand,
                "last4": pm.card.last4,
                "exp_month": pm.card.exp_month,
                "exp_year": pm.card.exp_year,
            }

        # Check if the subscription has been canceled but is still active (cancel_at_period_end=True)
        is_canceled = subscription.get("cancel_at_period_end", False) or subscription_record.get("canceled", False)
        
        # Return subscription info as JSON
        response = {
            "status": "active",
            "subscriptionId": subscription.id,
            "nextPaymentDate": next_payment_date_formatted,
            "paymentMethod": payment_method_info
        }
        
        # Add cancellation info if the subscription is canceled but still active
        if is_canceled:
            response["isCanceled"] = True
            response["message"] = "Your subscription will remain active until the end of your current billing period."
            # Add the cancellation date if available
            if subscription_record.get("canceled_at"):
                response["canceledAt"] = subscription_record.get("canceled_at")
                
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error in getSubscriptionInfo: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    
# Add this to your Flask application

@app.route("/api/check-user-exists", methods=["POST"])
def check_user_exists():
    """
    Endpoint to check if a user exists by email
    Returns a simple boolean response without exposing sensitive information
    """
    try:
        data = request.json
        email = data.get("email")
        
        if not email:
            return jsonify({
                "status": "error",
                "message": "Email is required"
            }), 400
        
        # Basic email validation
        if not "@" in email or not "." in email:
            return jsonify({
                "status": "error",
                "message": "Invalid email format"
            }), 400
        
        # Query the profiles table to check if this email exists
        response = supabase.table("profiles").select("id").eq("email", email).limit(1).execute()
        
        # Check if we found any matching records
        user_exists = response.data is not None and len(response.data) > 0
        
        # Also check auth.users to be thorough (some users might be in auth but not profiles yet)
        # This requires admin privileges which the service key has
        auth_check = False
        try:
            # Check for the user in the auth.users table via Supabase admin API
            # Note: This is an internal method that may change
            auth_response = supabase.rpc(
                "get_user_by_email", 
                {"user_email": email}
            ).execute()
            
            auth_check = auth_response.data is not None and len(auth_response.data) > 0
        except Exception as e:
            # If this fails, we'll rely only on the profiles check
            print(f"Auth check error: {e}")
            pass
        
        # User exists if found in either profiles or auth
        exists = user_exists or auth_check
        
        return jsonify({
            "status": "success",
            "exists": exists
        })
        
    except Exception as e:
        print(f"Error checking if user exists: {e}")
        traceback.print_exc()
        
        # Always return a generic error to avoid leaking information
        return jsonify({
            "status": "error",
            "message": "An error occurred while checking user existence"
        }), 500
    
@app.route("/api/cancelSubscription", methods=["POST"])
def cancel_subscription():
    """
    Cancel the user's subscription on Stripe.
    The subscription remains active until the end of the current billing period.
    """
    data = request.json
    user_id = data.get("id")
    cancellation_reason = data.get("reason", "User initiated cancellation")

    # Get the user's subscription from Supabase
    sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
    subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
    
    if not subscription:
        return jsonify({"status": "error", "message": "No subscription found"}), 404
    
    stripe_customer_id = subscription["stripe_id"]

    # Retrieve the subscription from Stripe
    subscriptions = stripe.Subscription.list(customer=stripe_customer_id, limit=1)
    if not subscriptions.data:
        return jsonify({"status": "error", "message": "No active subscription found on Stripe"}), 404

    stripe_subscription = subscriptions.data[0]
    
    # Cancel the subscription on Stripe at period end (not immediately)
    canceled_sub = stripe.Subscription.modify(
        stripe_subscription.id,
        cancel_at_period_end=True,
        metadata={"cancellation_reason": cancellation_reason}
    )

    # Update Supabase - mark as canceled but keep has_subscription and paid as true
    # so the user maintains access until the end date
    supabase.table("subscriptions").update({
        "canceled": True,
        "canceled_at": datetime.now().isoformat(),
        # Keep has_subscription and paid as true until the expiration date
        # User still has premium access until the end of the billing period
    }).eq("uuid", user_id).execute()

    # Return success result with end date information
    return jsonify({
        "status": "success", 
        "subscription": canceled_sub,
        "message": "Your subscription has been canceled but will remain active until the end of the current billing period."
    }), 200

@app.route("/user-subscription", methods=["GET"])
def user_subscription():
    try:
        id = request.args.get("user_id")
        sub_response = supabase.table("subscriptions").select("*").eq("uuid", id).execute()
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
            # When payment fails, revoke access immediately since they didn't pay
            updateUserSubscription(event, hasSubscription=False, paid=False)
        
        elif event["type"] == "customer.subscription.deleted":
            # This fires when a subscription is fully terminated
            # Either because it was canceled and reached its end date, or was terminated immediately
            handleSubscriptionEnded(event)
            
        elif event["type"] == "customer.subscription.updated":
            # Check if this is a cancellation (cancel_at_period_end = true)
            handleSubscriptionUpdated(event)

    except Exception as e:
        print(e)
    
    return jsonify(success=True)


def handleSubscriptionUpdated(event):
    """Handle subscription updates, including cancellations and reactivations."""
    subscription = event["data"]["object"]
    customer_id = subscription["customer"]
    
    # Get current subscription record
    sub_response = supabase.table("subscriptions").select("*").eq("stripe_id", customer_id).execute()
    current_subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
    
    if not current_subscription:
        print(f"No subscription found for customer: {customer_id}")
        return False
    
    # Check if this update is a cancellation (cancel_at_period_end = true)
    if subscription.get("cancel_at_period_end") == True:
        # If not already marked as canceled in our database
        if not current_subscription.get("canceled"):
            # Mark as canceled but keep access active until period end
            supabase.table("subscriptions").update({
                "canceled": True,
                "canceled_at": datetime.now().isoformat(),
                # Do NOT change has_subscription or paid status yet
            }).eq("stripe_id", customer_id).execute()
            print(f"Marked subscription as canceled for customer: {customer_id}")
    
    # If a canceled subscription gets reactivated (cancel_at_period_end was set to false)
    elif subscription.get("cancel_at_period_end") == False:
        # Check if it was previously marked as canceled in our database
        if current_subscription.get("canceled"):
            # Reset all cancellation flags
            updated_data = {
                "canceled": False,
                "canceled_at": None,
                # Ensure subscription is marked as active
                "has_subscription": True,
                "paid": True
            }
            
            # Update the expiration date based on the new period end
            if subscription.get("current_period_end"):
                period_end_timestamp = subscription.get("current_period_end")
                period_end_date = datetime.fromtimestamp(period_end_timestamp).date().isoformat()
                updated_data["expires_on"] = period_end_date
            
            # Apply the updates
            supabase.table("subscriptions").update(updated_data).eq("stripe_id", customer_id).execute()
            
            print(f"Subscription reactivated for customer: {customer_id}")
    
    # If this is a renewal or other update (e.g., payment method change), ensure data is consistent
    else:
        # For any subscription update, make sure the expiration date is current
        if subscription.get("current_period_end"):
            period_end_timestamp = subscription.get("current_period_end")
            period_end_date = datetime.fromtimestamp(period_end_timestamp).date().isoformat()
            
            supabase.table("subscriptions").update({
                "expires_on": period_end_date
            }).eq("stripe_id", customer_id).execute()
    
    return True


def handleSubscriptionEnded(event):
    """Handle when a subscription fully ends."""
    subscription = event["data"]["object"]
    customer_id = subscription["customer"]
    
    # Always fully deactivate the subscription when it's deleted in Stripe
    supabase.table("subscriptions").update({
        "has_subscription": False,  
        "paid": False,
        "canceled": True,
        # Keep canceled_at if it exists, otherwise set it now
        "canceled_at": datetime.now().isoformat()
    }).eq("stripe_id", customer_id).execute()
    
    print(f"Subscription fully ended for customer: {customer_id}")
    return True


def updateUserSubscription(event, hasSubscription=False, paid=False) -> bool:
    invoice = event["data"]["object"]
    customer = invoice["customer"]

    sub_response = supabase.table("subscriptions").select("*").eq("stripe_id", customer).execute()
    subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None

    if subscription:
        # Get end of current billing period from Stripe
        stripe_sub_response = stripe.Subscription.list(customer=customer, limit=1)
        current_period_end = None
        
        if stripe_sub_response.data:
            # Convert Unix timestamp to ISO date string
            period_end_timestamp = stripe_sub_response.data[0].current_period_end
            period_end_date = datetime.fromtimestamp(period_end_timestamp).date().isoformat()
            current_period_end = period_end_date
        
        updated_data = {
            "has_subscription": hasSubscription,  
            "paid": paid
        }
        
        # If we have a valid period end date, update it
        if current_period_end:
            updated_data["expires_on"] = current_period_end
        
        # If this is a new subscription month, reset AI searches
        if hasSubscription and paid:
            updated_data["ai_searches"] = 0
            # Also make sure canceled is set to false for new payments
            updated_data["canceled"] = False
            updated_data["canceled_at"] = None
            
        # Use the update method with a filter to target the row by stripe_id
        supabase.table("subscriptions").update(updated_data).eq("stripe_id", customer).execute()
        print("Subscription update successful")
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

@app.route("/api/transaction-history", methods=["GET"])
def get_transaction_history():
    """
    Retrieve a user's transaction history from Stripe
    Returns a list of previous charges and invoices
    """
    try:
        user_id = request.args.get("user_id")
        
        if not user_id:
            return jsonify({"status": "error", "message": "User ID is required."}), 400
        
        # Verify that the provided user_id exists in profiles
        user_check = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if not user_check.data:
            return jsonify({"status": "error", "message": "Invalid user ID."}), 403
            
        # Get the subscription record to find the Stripe customer ID
        subscription = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        if not subscription.data or len(subscription.data) == 0:
            return jsonify({"status": "error", "message": "No subscription record found."}), 404
            
        stripe_customer_id = subscription.data[0].get("stripe_id")
        if not stripe_customer_id:
            return jsonify({"status": "error", "message": "No Stripe customer ID found."}), 404
        
        # Fetch invoices from Stripe
        invoices = stripe.Invoice.list(
            customer=stripe_customer_id,
            limit=10,  # Limit to the 10 most recent
            status="paid"  # Only get successful payments
        )
        
        # Format the transaction history
        transactions = []
        for invoice in invoices.data:
            # Convert timestamp to datetime
            created_date = datetime.fromtimestamp(invoice.created, tz=dt.timezone.utc)
            formatted_date = created_date.strftime('%Y-%m-%d %H:%M:%S')
            
            # Format the amount (Stripe stores amounts in cents)
            amount = invoice.amount_paid / 100
            
            transactions.append({
                "id": invoice.id,
                "date": formatted_date,
                "amount": amount,
                "currency": invoice.currency.upper(),
                "description": invoice.description or "Monthly subscription",
                "status": invoice.status,
                "receipt_url": invoice.hosted_invoice_url
            })
        
        return jsonify({
            "status": "success",
            "transactions": transactions
        })
        
    except Exception as e:
        print(f"Error fetching transaction history: {e}")
        traceback.print_exc()
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
    

# Enhance the existing search functionality
@app.route("/api/search/drugs", methods=["GET"])
def search_drugs():
    """
    Performs search on drug names using the existing fuzzy search logic
    Maintains compatibility with the current implementation
    """
    query = request.args.get("query")
    limit = request.args.get("limit", default=10, type=int)
    offset = request.args.get("offset", default=0, type=int)
    threshold = request.args.get("threshold", default=0.6, type=float)
    
    if not query:
        return jsonify({"status": "error", "message": "Search query is required."}), 400
    
    try:
        # Use the existing fuzzy search logic that works
        response = supabase.rpc(
            "fuzzy_match_drug_names", 
            {
                "search_term": query,
                "similarity_threshold": threshold,
                "max_results": limit
            }
        ).execute()
        
        drugs = response.data or []
        
        # If no results from vector search, fall back to basic substring matching
        # This is the same logic used in the existing function
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
        
        # Count total results for pagination (optional)
        total_count = len(drugs)
        
        return jsonify({
            "status": "success",
            "drugs": drugs,
            "total": total_count
        })
        
    except Exception as e:
        error_details = {
            "status": "error",
            "message": f"Error in search: {str(e)}",
            "details": str(e)
        }
        
        print(f"Search API error: {error_details}")
        return jsonify(error_details), 500


@app.route("/api/search/suggestions", methods=["GET"])
def get_search_suggestions():
    """
    Endpoint to get search suggestions based on a query string.
    Uses the same search logic as the main search function for consistency.
    """
    try:
        query = request.args.get("query", "")
        limit = request.args.get("limit", default=5, type=int)
        
        if not query.strip():
            return jsonify({"status": "error", "message": "Query parameter is required"}), 400
        
        # Use the same fuzzy search logic that works in the main search
        response = supabase.rpc(
            "fuzzy_match_drug_names", 
            {
                "search_term": query,
                "similarity_threshold": 0.4,  # Lower threshold for more suggestions
                "max_results": limit * 2  # Get more results to filter
            }
        ).execute()
        
        drugs = response.data or []
        
        # If no results, try simple substring matching
        if not drugs:
            fallback_response = supabase.table("drugs").select("proper_name,name").or_(
                f"name.ilike.%{query}%,proper_name.ilike.%{query}%"
            ).limit(limit * 2).execute()
            
            drugs = fallback_response.data
        
        # Extract unique proper names for suggestions
        suggestions = []
        seen = set()
        
        for drug in drugs:
            name = drug.get("proper_name") or drug.get("name")
            if name and name.lower() != query.lower() and name.lower() not in seen:
                suggestions.append(name)
                seen.add(name.lower())
                if len(suggestions) >= limit:
                    break
        
        return jsonify({
            "status": "success",
            "suggestions": suggestions[:limit]
        })
        
    except Exception as e:
        print(f"Search suggestions error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

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
    

@app.route("/api/drug_categories", methods=["GET"])
def get_drug_categories():
    """
    Endpoint to fetch all unique categories from alt_tag_1 and alt_tag_2 fields.
    Returns formatted category data for UI display.
    """
    try:
        # Query Supabase for unique categories
        response = supabase.table("drugs")\
            .select("alt_tag_1,alt_tag_2")\
            .execute()
        
        if not response.data:
            return jsonify({"status": "success", "categories": []}), 200
        
        # Extract unique tags from both columns
        categories = set()
        for drug in response.data:
            if drug.get("alt_tag_1") and drug.get("alt_tag_1").strip():
                categories.add(drug.get("alt_tag_1"))
            if drug.get("alt_tag_2") and drug.get("alt_tag_2").strip():
                categories.add(drug.get("alt_tag_2"))
        
        # Format categories for response
        formatted_categories = []
        for tag in sorted(categories):
            # Format category name (e.g., "muscle_growth" -> "Muscle Growth")
            category_name = tag.replace("_", " ").title()
            formatted_categories.append({
                "id": tag,
                "name": category_name
            })
        
        return jsonify({
            "status": "success",
            "categories": formatted_categories
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/drugs/by_category", methods=["GET"])
def get_drugs_by_category():
    """
    Endpoint to fetch drugs that match a specific category.
    Filters by alt_tag_1 or alt_tag_2 matching the provided category.
    """
    try:
        category = request.args.get("category")
        if not category:
            return jsonify({"status": "error", "message": "Category parameter is required"}), 400
            
        # Query drugs from Supabase based on category
        # First try alt_tag_1
        response1 = supabase.table("drugs")\
            .select("id,name,proper_name")\
            .eq("alt_tag_1", category)\
            .execute()
            
        # Then try alt_tag_2
        response2 = supabase.table("drugs")\
            .select("id,name,proper_name")\
            .eq("alt_tag_2", category)\
            .execute()
        
        # Combine and deduplicate results
        all_drugs = []
        seen_ids = set()
        
        for drug in response1.data + response2.data:
            if drug["id"] not in seen_ids:
                all_drugs.append({
                    "id": drug["id"],
                    "name": drug["name"],
                    "proper_name": drug["proper_name"]
                })
                seen_ids.add(drug["id"])
        
        return jsonify({
            "status": "success",
            "drugs": all_drugs
        })
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    


openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# =============== AI SEARCH ENDPOINTS =============== #
@app.route("/api/ai-search", methods=["POST"])
def ai_search():
    """
    Perform an AI-powered semantic search
    Only available to paid subscribers within their monthly limit
    Stores recent searches in the database
    """
    try:
        data = request.json
        query = data.get("query", "")
        user_id = data.get("user_id")
        
        if not query:
            return jsonify({"status": "error", "message": "Query is required."}), 400
        
        if not user_id:
            return jsonify({"status": "error", "message": "User ID is required."}), 400
        
        # Verify that the provided user_id exists in profiles
        user_check = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if not user_check.data:
            return jsonify({"status": "error", "message": "Invalid user ID."}), 403
        
        # Check if user can perform an AI search (without incrementing yet)
        # First get the subscription data
        subscription = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription_data = subscription.data[0] if subscription.data else None
        
        # Determine if the user can use AI search
        permission = check_user_ai_permission(subscription_data)
        
        if not permission["allowed"]:
            return jsonify({
                "status": "error",
                "message": permission["message"],
                "usage_info": permission
            }), 403
        
        # Step 1: Generate embedding for the search query
        embedding_response = client.embeddings.create(
            model="text-embedding-3-small",  # Cheaper model
            input=query
        )
        query_embedding = embedding_response.data[0].embedding
        
        # Step 2: Search for similar drugs in Supabase using our new AI-specific function
        response = supabase.rpc(
            "ai_semantic_search", 
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.6,
                "match_count": 10  # Increased for more results
            }
        ).execute()
        
        similar_drugs = response.data or []
        
        # If no results from vector search, fallback to keyword search
        if not similar_drugs:
            keyword_response = supabase.table("drugs").select("id, proper_name, what_it_does, how_it_works").or_(
                f"proper_name.ilike.%{query}%,what_it_does.ilike.%{query}%,how_it_works.ilike.%{query}%"
            ).limit(8).execute()
            similar_drugs = keyword_response.data or []
        
        if not similar_drugs:
            # No results, but still count as a search
            increment_search_count(user_id, subscription_data, permission["subscription_type"])
            
            updated_permission = check_user_ai_permission(
                supabase.table("subscriptions").select("*").eq("uuid", user_id).execute().data[0]
            )
            
            # Store empty recommendations for this query
            store_recent_search(user_id, query, [])
            
            return jsonify({
                "status": "success", 
                "recommendations": [],
                "usage_info": updated_permission
            })
        
        # Step 3: Construct context from the search results
        context = "Here are some relevant compounds from our database:\n\n"
        for drug in similar_drugs:
            context += f"Name: {drug['proper_name']}\n"
            context += f"ID: {drug['id']}\n"  # Include ID explicitly
            context += f"What it does: {drug.get('what_it_does', 'N/A')}\n"
            context += f"How it works: {drug.get('how_it_works', 'N/A')}\n\n"
        
        # Step 4: Use GPT to generate recommendations with detailed reasons
        system_prompt = """You are an AI assistant for a health supplement website. 
            Your task is to recommend products based on user queries about health goals.
            Be informative and detailed. Always mention the proper name of the compound.
            Focus only on the compounds provided in the context.
            For each recommendation, provide a 1-2 sentence detailed explanation of why it might be relevant to the user's query.
            Include specific mechanisms of action, benefits, or scientific principles when possible.
            
            Return a JSON object with the following structure:
            {
              "recommendations": [
                {
                  "proper_name": "Product Name",
                  "reason": "Detailed 1-2 sentence explanation of why this is relevant to the user's query",
                  "id": Product ID from the context (as a number)
                }
              ]
            }
            
            Include up to 5 of the most relevant recommendations, prioritizing quality over quantity.
            """
        
        user_prompt = f"USER QUERY: \"{query}\"\n\nCONTEXT:\n{context}"
        
        try:
            completion = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.4,  # Slightly increased for more diverse explanations
                max_tokens=800,   # Increased to allow for longer detailed responses
                response_format={"type": "json_object"}  # Force JSON format
            )
            
            response_content = completion.choices[0].message.content
            
            # Handle potential JSON parsing errors gracefully
            try:
                parsed_data = json.loads(response_content)
                
                # Extract recommendations
                if "recommendations" in parsed_data and isinstance(parsed_data["recommendations"], list):
                    recommendations = parsed_data["recommendations"]
                elif isinstance(parsed_data, list):
                    recommendations = parsed_data
                else:
                    # If unexpected format, build manually
                    recommendations = []
                    for i, drug in enumerate(similar_drugs[:5]):
                        recommendations.append({
                            "proper_name": drug["proper_name"],
                            "reason": f"This compound appears relevant to your search for '{query}' based on its properties and mechanisms of action.",
                            "id": drug.get("id")
                        })
                
            except json.JSONDecodeError as json_error:
                print(f"JSON parsing error: {json_error}")
                print(f"Raw response: {response_content}")
                
                # Fallback to manual recommendation creation
                recommendations = []
                for i, drug in enumerate(similar_drugs[:5]):
                    recommendations.append({
                        "proper_name": drug["proper_name"],
                        "reason": f"This compound matches your search for '{query}' based on its properties and effects.",
                        "id": drug.get("id")
                    })
                
        except Exception as llm_error:
            print(f"LLM processing error: {llm_error}")
            
            # Fallback to basic recommendations without LLM
            recommendations = []
            for i, drug in enumerate(similar_drugs[:5]):
                recommendations.append({
                    "proper_name": drug["proper_name"],
                    "reason": f"This compound appears to be relevant to your search query.",
                    "id": drug.get("id")
                })
        
        # Ensure all recommendations have proper ID formatting
        for rec in recommendations:
            # Make sure ID is an integer if present
            if "id" in rec and rec["id"] is not None:
                try:
                    rec["id"] = int(rec["id"])
                except (ValueError, TypeError):
                    # If ID conversion fails, find the matching drug and use its ID
                    matching_drug = next((d for d in similar_drugs if d["proper_name"] == rec["proper_name"]), None)
                    if matching_drug and "id" in matching_drug:
                        rec["id"] = matching_drug["id"]
        
        # NOW store the search with results - after recommendations have been created
        store_recent_search(user_id, query, recommendations)
        
        # Increment usage counter for this search
        increment_search_count(user_id, subscription_data, permission["subscription_type"])
        
        # Get updated permission info
        updated_permission = check_user_ai_permission(
            supabase.table("subscriptions").select("*").eq("uuid", user_id).execute().data[0]
        )
        
        return jsonify({
            "status": "success", 
            "recommendations": recommendations,
            "usage_info": updated_permission
        })
        
    except Exception as e:
        print(f"Error in AI search: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
    

@app.route("/api/ai-search/check-usage", methods=["POST"])
def check_ai_search_usage():
    """
    Check and optionally increment a user's AI search usage
    Returns detailed information about search limits based on subscription status
    """
    try:
        data = request.json
        user_id = data.get("user_id")
        
        if not user_id:
            return jsonify({"status": "error", "message": "User ID is required."}), 400
        
        # Verify that the provided user_id exists in profiles
        user_check = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if not user_check.data:
            return jsonify({"status": "error", "message": "Invalid user ID."}), 403
            
        # Get subscription data from Supabase
        subscription = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription_data = subscription.data[0] if subscription.data else None
        
        # Check permission
        permission = check_user_ai_permission(subscription_data)
        
        # If increment flag is set and user is allowed to search, increment the count
        increment = data.get("increment", False)
        if increment and permission["allowed"] and permission["subscription_type"] != "admin":
            increment_search_count(user_id, subscription_data, permission["subscription_type"])
            
            # Update permission info
            subscription = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
            subscription_data = subscription.data[0] if subscription.data else None
            permission = check_user_ai_permission(subscription_data)
            
        return jsonify({
            "status": "success",
            **permission
        })
        
    except Exception as e:
        print(f"Error checking AI search usage: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/ai-search/recent", methods=["GET"])
def get_recent_searches():
    """
    Get recent AI searches for a user
    """
    try:
        user_id = request.args.get("user_id")
        
        if not user_id:
            return jsonify({"status": "error", "message": "User ID is required."}), 400
        
        # Verify that the provided user_id exists in profiles
        user_check = supabase.table("profiles").select("id").eq("id", user_id).execute()
        if not user_check.data:
            return jsonify({"status": "error", "message": "Invalid user ID."}), 403
            
        # Get the 2 most recent searches for this user
        response = supabase.table("user_recent_searches")\
            .select("query, results")\
            .eq("user_id", user_id)\
            .order("created_at", desc=True)\
            .limit(2)\
            .execute()
            
        # Extract just the query strings and results
        recent_searches = []
        if response.data:
            for item in response.data:
                recent_searches.append({
                    "query": item["query"],
                    "results": item.get("results")  # Use get() to handle cases where results might be None
                })
            
        return jsonify({
            "status": "success",
            "recent_searches": recent_searches
        })
        
    except Exception as e:
        print(f"Error fetching recent searches: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

def check_user_ai_permission(subscription_data):
    """
    Check if a user can use AI search based on their subscription
    Returns permission info dictionary
    """
    # Check if admin (expires_on is NULL and has_subscription is TRUE)
    is_admin = (
        subscription_data and 
        subscription_data.get("expires_on") is None and 
        subscription_data.get("has_subscription") is True
    )
    
    # Check if paid user with active subscription
    is_paid = (
        subscription_data and
        subscription_data.get("has_subscription") is True and
        subscription_data.get("paid") is True and
        (
            # Either expiration date is in future or it's NULL (admin)
            subscription_data.get("expires_on") is None or
            (
                subscription_data.get("expires_on") and 
                dt.datetime.strptime(subscription_data.get("expires_on"), "%Y-%m-%d").date() > dt.datetime.now().date()
            )
        )
    )
    
    # Set monthly limit for paid users
    monthly_limit = 10
    
    # Determine result based on user type
    if is_admin:
        return {
            "allowed": True,
            "subscription_type": "admin",
            "searches_used": 0,
            "searches_remaining": "unlimited",
            "message": "Admin account with unlimited AI searches."
        }
    elif is_paid:
        # Paid user with monthly limit
        searches_used = subscription_data.get("ai_searches", 0) or 0
        remaining = max(0, monthly_limit - searches_used)
        
        return {
            "allowed": remaining > 0,
            "subscription_type": "paid",
            "searches_used": searches_used,
            "searches_remaining": remaining,
            "searches_limit": monthly_limit,
            "message": f"You have used {searches_used} of {monthly_limit} AI searches this subscription period."
        }
    else:
        # Free user or inactive subscription
        return {
            "allowed": False,
            "subscription_type": "free",
            "searches_used": 0,
            "searches_remaining": 0,
            "message": "AI search is only available for paid subscribers."
        }


def increment_search_count(user_id, subscription_data, subscription_type):
    """
    Increment a user's AI search count in the database
    Only increments for paid users, not for admins
    """
    if not subscription_data:
        # If no record exists, create one with defaults
        try:
            # Get user email from profile
            profile = supabase.table("profiles").select("email").eq("id", user_id).execute()
            email = profile.data[0]["email"] if profile.data else None
            
            # Insert new subscription record
            supabase.table("subscriptions").insert({
                "uuid": user_id,
                "email": email,
                "has_subscription": False,
                "paid": False,
                "ai_searches": 1
            }).execute()
        except Exception as e:
            print(f"Error creating new subscription record: {e}")
    elif subscription_type != "admin":
        # Only increment for non-admin paid users
        try:
            current_count = subscription_data.get("ai_searches", 0) or 0
            supabase.table("subscriptions").update({
                "ai_searches": current_count + 1
            }).eq("uuid", user_id).execute()
        except Exception as e:
            print(f"Error incrementing search count: {e}")


def store_recent_search(user_id, query, results=None):
    """
    Store a search query and its results in the user's recent searches
    Keeps only the 2 most recent searches per user
    """
    try:
        print(f"Storing search for user {user_id}, query: {query}, with results: {results is not None}")
        
        # First check if this search already exists for this user
        existing = supabase.table("user_recent_searches")\
            .select("id")\
            .eq("user_id", user_id)\
            .eq("query", query)\
            .execute()
            
        if existing.data:
            # If it exists, update the timestamp and results
            update_data = {"created_at": dt.datetime.now().isoformat()}
            
            # Only include results if they're provided
            if results is not None:
                update_data["results"] = results
                
            response = supabase.table("user_recent_searches")\
                .update(update_data)\
                .eq("id", existing.data[0]["id"])\
                .execute()
                
            print(f"Updated existing search: {response.status_code}")
                
        else:
            # Add the new search
            insert_data = {"user_id": user_id, "query": query}
            
            # Only include results if they're provided
            if results is not None:
                insert_data["results"] = results
                
            response = supabase.table("user_recent_searches")\
                .insert(insert_data)\
                .execute()
                
            print(f"Inserted new search: {response.status_code}")
                
            # Get count of recent searches for this user
            count_response = supabase.table("user_recent_searches")\
                .select("id", count="exact")\
                .eq("user_id", user_id)\
                .execute()
                
            count = count_response.count if hasattr(count_response, 'count') else 0
            print(f"User has {count} recent searches")
                
            # If more than 2 searches, delete the oldest ones
            if count > 2:
                # Get IDs of the oldest searches beyond the 2 most recent
                to_delete = supabase.table("user_recent_searches")\
                    .select("id")\
                    .eq("user_id", user_id)\
                    .order("created_at")\
                    .limit(count - 2)\
                    .execute()
                    
                if to_delete.data:
                    # Extract the IDs into a list
                    ids = [item["id"] for item in to_delete.data]
                    
                    # Delete the oldest searches
                    delete_response = supabase.table("user_recent_searches")\
                        .delete()\
                        .in_("id", ids)\
                        .execute()
                        
                    print(f"Deleted oldest searches: {delete_response.status_code}")
                        
    except Exception as e:
        print(f"Error storing recent search: {e}")
        traceback.print_exc()
        return False
        
    return True# =============== HELPER FUNCTIONS =============== #

def process_query_with_llm(query):
    """
    Process the user query with GPT-4o to expand it into relevant pharmacological concepts
    Uses a cost-effective approach with limited tokens
    """
    system_prompt = """You are an expert in pharmacology and medical research.
    Your task is to analyze a user's health or wellness-related query and convert it into a concise 
    list of relevant compounds, mechanisms of action, or keywords that would be useful for searching a 
    database of health supplements and compounds.
    
    Be specific, technical, and medically accurate. Focus on mechanisms, pathways, target receptors, 
    and specific compound classes rather than general terms.
    
    Return only the expanded search terms separated by commas, without explanation or additional text.
    Limit your response to 5-7 most relevant terms.
    """
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",  # Using GPT-4o-mini for better cost efficiency
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            temperature=0.3,
            max_tokens=100,  # Strict token limit to control costs
            presence_penalty=-0.5,  # Encourage concise, focused responses
        )
        
        # Combine original query with expanded terms
        expanded_terms = response.choices[0].message.content.strip()
        return f"{query}, {expanded_terms}"
    
    except Exception as e:
        print(f"Error in query processing: {e}")
        # Fallback to original query if LLM processing fails
        return query


def generate_embedding(text):
    """
    Generate an embedding vector for the given text using OpenAI's embedding model
    """
    try:
        response = openai_client.embeddings.create(
            model="text-embedding-3-small",  # Using the smaller, cheaper model
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding: {e}")
        raise


def search_by_vector_similarity(query_embedding, match_threshold=0.6, match_count=10):
    """
    Search for similar drugs in the database using vector similarity
    """
    try:
        response = supabase.rpc(
            "match_drugs_by_content", 
            {
                "query_embedding": query_embedding,
                "match_threshold": match_threshold,
                "match_count": match_count
            }
        ).execute()
        
        results = response.data or []
        
        # If vector search returns no results, fall back to keyword search
        if not results:
            keyword_response = supabase.table("drugs").select(
                "id, proper_name, what_it_does, how_it_works"
            ).or_(
                f"what_it_does.ilike.%{query_embedding[0:5]}%,how_it_works.ilike.%{query_embedding[0:5]}%"
            ).limit(5).execute()
            
            results = keyword_response.data
            
        return results
    except Exception as e:
        print(f"Error in vector search: {e}")
        return []


def rank_and_explain_results(vector_results, original_query):
    """
    Use GPT to rank and explain why each result matches the user's query
    Limited to 5 results maximum to control token usage
    """
    if not vector_results:
        return []
    
    try:
        # Prepare context for GPT with top 5 results only (limiting token usage)
        truncated_results = vector_results[:5]
        
        context = "Here are compounds that might match the user's query:\n\n"
        for idx, drug in enumerate(truncated_results):
            context += f"{idx+1}. Name: {drug['proper_name']}\n"
            
            # Truncate long descriptions to control token usage
            what_it_does = drug.get('what_it_does', 'N/A')
            how_it_works = drug.get('how_it_works', 'N/A')
            
            if what_it_does and len(what_it_does) > 300:
                what_it_does = what_it_does[:300] + "..."
                
            if how_it_works and len(how_it_works) > 300:
                how_it_works = how_it_works[:300] + "..."
                
            context += f"   What it does: {what_it_does}\n"
            context += f"   How it works: {how_it_works}\n\n"
        
        system_prompt = """You are an expert in pharmacology helping users find appropriate compounds.
            For each compound in the list, evaluate its relevance to the user's query.
            Explain in 1-2 short sentences why it matches and how it relates to the user's intent.
            Be specific about mechanisms of action and target pathways when possible.
            
            Format your response as a JSON array with the following structure:
            [
              {
                "id": <drug id>,
                "name": <drug proper_name>,
                "reason": <1-2 sentence explanation>,
                "what_it_does": <original what_it_does>,
                "how_it_works": <original how_it_works>
              }
            ]
            
            Include exactly the fields shown above for each result.
            """
        
        user_prompt = f"USER QUERY: \"{original_query}\"\n\nCONTEXT:\n{context}"
        
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",  # Using the more cost-effective model
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=800,  # Controlling token usage
            response_format={"type": "json_object"}  # Ensure JSON format
        )
        
        # Parse the ranked results
        response_content = completion.choices[0].message.content
        results_obj = json.loads(response_content)
        
        # Extract the results array
        if isinstance(results_obj, dict) and "results" in results_obj:
            ranked_results = results_obj["results"]
        elif isinstance(results_obj, list):
            ranked_results = results_obj
        else:
            # Handle unexpected structure
            ranked_results = []
            for drug in truncated_results:
                ranked_results.append({
                    "id": drug.get("id"),
                    "name": drug.get("proper_name"),
                    "reason": "This compound may be relevant to your search.",
                    "what_it_does": drug.get("what_it_does"),
                    "how_it_works": drug.get("how_it_works")
                })
        
        return ranked_results
        
    except Exception as e:
        print(f"Error ranking results: {e}")
        # Fallback to basic matching
        return [
            {
                "id": drug.get("id"),
                "name": drug.get("proper_name"),
                "reason": "This compound may be relevant to your search.",
                "what_it_does": drug.get("what_it_does", ""),
                "how_it_works": drug.get("how_it_works", "")
            } 
            for drug in vector_results[:5]  # Still limit to 5 results
        ]


# =============== USAGE TRACKING & CACHING =============== #



def record_ai_search_usage(user_id):
    """
    Record a user's AI search usage for the current month
    """
    try:
        # Get current month/year
        now = datetime.now()
        current_month = now.month
        current_year = now.year
        
        # Check if entry exists for this user/month/year
        response = supabase.table("ai_search_usage").select("id,count").eq("user_id", user_id).eq("month", current_month).eq("year", current_year).execute()
        
        if response.data and len(response.data) > 0:
            # Update existing record
            entry_id = response.data[0]["id"]
            current_count = response.data[0]["count"]
            
            update_response = supabase.table("ai_search_usage").update({
                "count": current_count + 1,
                "updated_at": now.isoformat()
            }).eq("id", entry_id).execute()
            
        else:
            # Create new record
            insert_response = supabase.table("ai_search_usage").insert({
                "user_id": user_id,
                "month": current_month,
                "year": current_year,
                "count": 1,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat()
            }).execute()
            
        return True
        
    except Exception as e:
        print(f"Error recording AI search usage: {e}")
        return False


def get_next_month_start():
    """
    Calculate the start date of the next month for limit reset display
    """
    now = datetime.now()
    month = now.month + 1
    year = now.year
    
    if month > 12:
        month = 1
        year += 1
        
    return f"{year}-{month:02d}-01"


@lru_cache(maxsize=100)
def get_cached_ai_search_results(query, user_id):
    """
    Cache key generator with 5-minute TTL (combine query + timestamp rounded to 5-min intervals)
    Includes user_id to avoid sharing results between users
    """
    timestamp = int(time.time() / 300)  # 300 seconds = 5 minutes
    return f"{user_id}_{query}_{timestamp}"
# Add a new route to check and increment AI search usage

# Update the store_recent_search function to also save results
def store_recent_search(user_id, query, results=None):
    """
    Store a search query and its results in the user's recent searches
    Keeps only the 2 most recent searches per user
    """
    try:
        # First check if this search already exists for this user
        existing = supabase.table("user_recent_searches")\
            .select("id")\
            .eq("user_id", user_id)\
            .eq("query", query)\
            .execute()
            
        if existing.data:
            # If it exists, update the timestamp and results to make it the most recent
            update_data = {"created_at": dt.datetime.now().isoformat()}
            if results is not None:
                update_data["results"] = results
                
            supabase.table("user_recent_searches")\
                .update(update_data)\
                .eq("id", existing.data[0]["id"])\
                .execute()
        else:
            # Add the new search with results
            insert_data = {"user_id": user_id, "query": query}
            if results is not None:
                insert_data["results"] = results
                
            supabase.table("user_recent_searches")\
                .insert(insert_data)\
                .execute()
                
            # Get count of recent searches for this user
            count = supabase.table("user_recent_searches")\
                .select("id", count="exact")\
                .eq("user_id", user_id)\
                .execute()
                
            # If more than 2 searches, delete the oldest ones
            if count.count > 2:
                # Get IDs of the oldest searches beyond the 2 most recent
                to_delete = supabase.table("user_recent_searches")\
                    .select("id")\
                    .eq("user_id", user_id)\
                    .order("created_at")\
                    .limit(count.count - 2)\
                    .execute()
                    
                if to_delete.data:
                    # Extract the IDs into a list
                    ids = [item["id"] for item in to_delete.data]
                    
                    # Delete the oldest searches
                    supabase.table("user_recent_searches")\
                        .delete()\
                        .in_("id", ids)\
                        .execute()
                        
    except Exception as e:
        print(f"Error storing recent search: {e}")
        traceback.print_exc()
        return False
        
    return True

@app.route("/api/reactivateSubscription", methods=["POST"])
def reactivate_subscription():
    """
    Reactivate a canceled subscription that hasn't yet expired.
    This essentially removes the cancel_at_period_end flag in Stripe.
    Checks for expired payment methods and handles them appropriately.
    """
    data = request.json
    user_id = data.get("id")

    if not user_id:
        return jsonify({"status": "error", "message": "User ID is required"}), 400

    # Get the user's subscription from Supabase
    sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
    subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
    
    if not subscription:
        return jsonify({"status": "error", "message": "No subscription found"}), 404
    
    # Check if the subscription is actually canceled
    if not subscription.get("canceled"):
        return jsonify({"status": "error", "message": "Subscription is not in canceled state"}), 400
    
    stripe_customer_id = subscription.get("stripe_id")
    if not stripe_customer_id:
        return jsonify({"status": "error", "message": "No Stripe customer ID found"}), 404

    # Retrieve the subscription from Stripe
    stripe_subscriptions = stripe.Subscription.list(customer=stripe_customer_id, limit=1)
    if not stripe_subscriptions.data:
        return jsonify({"status": "error", "message": "No subscription found in Stripe"}), 404

    stripe_subscription = stripe_subscriptions.data[0]
    
    # Check if the subscription is canceled at period end in Stripe
    if not stripe_subscription.get("cancel_at_period_end"):
        # Update our database to match Stripe's state
        supabase.table("subscriptions").update({
            "canceled": False,
            "canceled_at": None
        }).eq("uuid", user_id).execute()
        
        return jsonify({
            "status": "success",
            "message": "Subscription was already active in Stripe, local state updated"
        }), 200
    
    try:
        # Check the payment method for expiration
        payment_method_id = stripe_subscription.default_payment_method
        payment_method_expired = False
        payment_warning = None
        
        if payment_method_id:
            payment_method = stripe.PaymentMethod.retrieve(payment_method_id)
            if payment_method.type == 'card':
                # Get current date components
                current_date = datetime.now()
                current_month = current_date.month
                current_year = current_date.year
                
                # Check if card is expired
                card_expired = (payment_method.card.exp_year < current_year or 
                               (payment_method.card.exp_year == current_year and 
                                payment_method.card.exp_month < current_month))
                
                # Check if card will expire before next billing cycle
                next_period_end = datetime.fromtimestamp(stripe_subscription.current_period_end)
                card_expiration = datetime(
                    year=payment_method.card.exp_year,
                    month=payment_method.card.exp_month,
                    day=1
                ) + timedelta(days=32)  # Go to next month, then back to last day of expiration month
                card_expiration = card_expiration.replace(day=1) - timedelta(days=1)
                
                payment_method_expired = card_expired
                
                # Set warning if card expires soon
                if not card_expired and card_expiration < next_period_end:
                    payment_warning = f"Your payment card will expire before the next billing cycle. Please update your payment method before {card_expiration.strftime('%Y-%m-%d')}."
                elif card_expired:
                    payment_warning = "Your payment card has expired. Please update your payment method to avoid service interruption."
        
        # If payment method is expired, we can still reactivate but inform the user
        # Remove cancel_at_period_end flag in Stripe
        updated_subscription = stripe.Subscription.modify(
            stripe_subscription.id,
            cancel_at_period_end=False,
            metadata={"reactivated_at": datetime.now().isoformat()}
        )
        
        # Update our database to reflect the reactivation
        supabase.table("subscriptions").update({
            "canceled": False,
            "canceled_at": None,
            "has_subscription": True,
            "paid": True
        }).eq("uuid", user_id).execute()
        
        # Prepare response based on payment method status
        response = {
            "status": "success",
            "message": "Your subscription has been successfully reactivated.",
            "subscription": updated_subscription
        }
        
        if payment_method_expired:
            response["payment_method_expired"] = True
            response["warning"] = payment_warning
        elif payment_warning:
            response["payment_method_warning"] = True
            response["warning"] = payment_warning
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"Error reactivating subscription: {e}")
        traceback.print_exc()
        return jsonify({
            "status": "error", 
            "message": f"Failed to reactivate subscription: {str(e)}"
        }), 500

@app.route("/api/payment-methods", methods=["GET"])
def get_payment_methods():
    """
    Retrieve all payment methods for a user from Stripe.
    Returns a list of payment methods with their details.
    Deduplicates payment methods with the same card details.
    """
    try:
        user_id = request.args.get("user_id")
        if not user_id:
            return jsonify({"status": "error", "message": "User ID is required"}), 400
        
        # Get the user's subscription from Supabase
        sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
        
        if not subscription:
            return jsonify({"status": "error", "message": "No subscription found"}), 404
        
        stripe_customer_id = subscription.get("stripe_id")
        if not stripe_customer_id:
            return jsonify({"status": "error", "message": "No Stripe customer ID found"}), 404
        
        # Retrieve the customer to get the default payment method
        customer = stripe.Customer.retrieve(stripe_customer_id)
        default_payment_method = customer.get("invoice_settings", {}).get("default_payment_method")
        
        # Retrieve all payment methods for this customer
        payment_methods = stripe.PaymentMethod.list(
            customer=stripe_customer_id,
            type="card"
        )
        
        # Format the payment methods and deduplicate
        formatted_methods = []
        seen_cards = set()  # Track already seen cards by fingerprint or last4+brand+exp
        
        for method in payment_methods.data:
            # Create a unique fingerprint for this card
            card_key = f"{method.card.brand}_{method.card.last4}_{method.card.exp_month}_{method.card.exp_year}"
            
            # Skip if we've already seen this card
            if card_key in seen_cards:
                continue
                
            seen_cards.add(card_key)
            
            formatted_methods.append({
                "id": method.id,
                "brand": method.card.brand,
                "last4": method.card.last4,
                "exp_month": method.card.exp_month,
                "exp_year": method.card.exp_year,
                "isDefault": method.id == default_payment_method
            })
        
        return jsonify({
            "status": "success",
            "payment_methods": formatted_methods
        })
        
    except Exception as e:
        print(f"Error retrieving payment methods: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/update-payment-method", methods=["POST"])
def update_payment_method():
    """
    Add a new payment method to the customer's account.
    Optionally set it as the default payment method.
    """
    try:
        data = request.json
        user_id = data.get("user_id")
        payment_method_id = data.get("payment_method_id")
        set_as_default = data.get("set_as_default", False)
        
        if not user_id or not payment_method_id:
            return jsonify({
                "status": "error", 
                "message": "User ID and payment method ID are required"
            }), 400
        
        # Get the user's subscription from Supabase
        sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
        
        if not subscription:
            return jsonify({"status": "error", "message": "No subscription found"}), 404
        
        stripe_customer_id = subscription.get("stripe_id")
        if not stripe_customer_id:
            return jsonify({"status": "error", "message": "No Stripe customer ID found"}), 404
        
        # Attach the payment method to the customer
        stripe.PaymentMethod.attach(
            payment_method_id,
            customer=stripe_customer_id,
        )
        
        # If requested, set this payment method as the default
        if set_as_default:
            stripe.Customer.modify(
                stripe_customer_id,
                invoice_settings={"default_payment_method": payment_method_id},
            )
            
            # If there's an active subscription, update its default payment method too
            subscriptions = stripe.Subscription.list(customer=stripe_customer_id, limit=1)
            if subscriptions.data:
                stripe.Subscription.modify(
                    subscriptions.data[0].id,
                    default_payment_method=payment_method_id
                )
        
        return jsonify({
            "status": "success",
            "message": "Payment method updated successfully"
        })
        
    except Exception as e:
        print(f"Error updating payment method: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/set-default-payment-method", methods=["POST"])
def set_default_payment_method():
    """
    Set an existing payment method as the default for a customer.
    """
    try:
        data = request.json
        user_id = data.get("user_id")
        payment_method_id = data.get("payment_method_id")
        
        if not user_id or not payment_method_id:
            return jsonify({
                "status": "error", 
                "message": "User ID and payment method ID are required"
            }), 400
        
        # Get the user's subscription from Supabase
        sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
        
        if not subscription:
            return jsonify({"status": "error", "message": "No subscription found"}), 404
        
        stripe_customer_id = subscription.get("stripe_id")
        if not stripe_customer_id:
            return jsonify({"status": "error", "message": "No Stripe customer ID found"}), 404
        
        # Set this payment method as the default for the customer
        stripe.Customer.modify(
            stripe_customer_id,
            invoice_settings={"default_payment_method": payment_method_id},
        )
        
        # If there's an active subscription, update its default payment method too
        subscriptions = stripe.Subscription.list(customer=stripe_customer_id, limit=1)
        if subscriptions.data:
            stripe.Subscription.modify(
                subscriptions.data[0].id,
                default_payment_method=payment_method_id
            )
        
        return jsonify({
            "status": "success",
            "message": "Default payment method updated successfully"
        })
        
    except Exception as e:
        print(f"Error setting default payment method: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/delete-payment-method", methods=["POST"])
def delete_payment_method():
    """
    Delete a payment method from a customer's account.
    Cannot delete the default payment method used for subscriptions.
    """
    try:
        data = request.json
        user_id = data.get("user_id")
        payment_method_id = data.get("payment_method_id")
        
        if not user_id or not payment_method_id:
            return jsonify({
                "status": "error", 
                "message": "User ID and payment method ID are required"
            }), 400
        
        # Get the user's subscription from Supabase
        sub_response = supabase.table("subscriptions").select("*").eq("uuid", user_id).execute()
        subscription = sub_response.data[0] if sub_response.data and len(sub_response.data) > 0 else None
        
        if not subscription:
            return jsonify({"status": "error", "message": "No subscription found"}), 404
        
        stripe_customer_id = subscription.get("stripe_id")
        if not stripe_customer_id:
            return jsonify({"status": "error", "message": "No Stripe customer ID found"}), 404
        
        # Check if this is the default payment method
        customer = stripe.Customer.retrieve(stripe_customer_id)
        default_payment_method = customer.get("invoice_settings", {}).get("default_payment_method")
        
        if payment_method_id == default_payment_method:
            return jsonify({
                "status": "error",
                "message": "Cannot delete the default payment method. Set another payment method as default first."
            }), 400
        
        # Detach the payment method
        stripe.PaymentMethod.detach(payment_method_id)
        
        return jsonify({
            "status": "success",
            "message": "Payment method deleted successfully"
        })
        
    except Exception as e:
        print(f"Error deleting payment method: {e}")
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    # Get host and port from environment variables or use defaults
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    debug_mode = os.getenv("API_DEBUG", "True").lower() == "true"
    
    print(f"Starting Flask server on {host}:{port}")
    app.run(
        host=host, 
        port=port, 
        debug=debug_mode, 
        use_reloader=debug_mode
    )