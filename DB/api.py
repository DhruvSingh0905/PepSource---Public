from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import random

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
DB_PATH = "DB/pepsources.db"

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

if __name__ == "__main__":
    app.run(debug=True, port=8000)