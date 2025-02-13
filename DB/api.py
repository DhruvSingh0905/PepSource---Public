from flask import Flask, jsonify, request
import sqlite3

app = Flask(__name__)
DB_PATH = "DB/pepsources.db"

def get_all_drugs():
    """Fetch all drugs (id and name) from the Drugs table."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM Drugs")
    rows = cur.fetchall()
    conn.close()
    drugs = [dict(row) for row in rows]
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
    Given a drug name, return the drug row (id and name) from the Drugs table.
    The search is case-insensitive.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM Drugs WHERE lower(name) = ?", (drug_name.lower(),))
    row = cur.fetchone()
    conn.close()
    if row:
        return dict(row)
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
        return jsonify({
            "status": "success",
            "drug": drug,
            "vendors": vendors
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

if __name__ == "__main__":
    # Running on port 5173 as specified.
    app.run(debug=True, port=5000)