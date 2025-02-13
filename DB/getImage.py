import requests
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

API_KEY = os.getenv("GOOGLE_API_KEY")
CX = os.getenv("GOOGLE_CX")

# drugName = "glucagon"
# keyword = f"{drugName} drug picture"

def get_first_image(keyword):
    search_url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "q": keyword,
        "cx": CX,
        "key": API_KEY,
        "searchType": "image",
        "num": 1
    }
    response = requests.get(search_url, params=params)
    data = response.json()
    
    if "items" in data:
        return data["items"][0]["link"]
    else:
        return "No image found."
