import sqlite3
import threading
import os
import re
import torch
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from transformers import (
    AutoTokenizer,
    AutoModelForTokenClassification,
    pipeline
)
from bs4 import BeautifulSoup
import logging
import time
import random
from fake_useragent import UserAgent

# Configure logging
logging.basicConfig(
    filename="test_scraper.log",
    filemode="w",
    format="%(asctime)s - %(message)s",
    level=logging.INFO,
)

# Test database file
TEST_DB_FILE = "test_scraped_data.db"

# Pre-defined article links for testing
ARTICLE_LINKS = [
    "https://pubmed.ncbi.nlm.nih.gov/33567185/",
    "https://pubmed.ncbi.nlm.nih.gov/39169732/"
]

###############################################################################
#    SciBERT model fine-tuned for NER (jsylee/scibert_scivocab_uncased-finetuned-ner)
###############################################################################
model_name = "jsylee/scibert_scivocab_uncased-finetuned-ner"

# This model has 5 labels: {0: 'O', 1: 'B-DRUG', 2: 'I-DRUG', 3: 'B-EFFECT', 4: 'I-EFFECT'}
id2label_map = {0: 'O', 1: 'B-DRUG', 2: 'I-DRUG', 3: 'B-EFFECT', 4: 'I-EFFECT'}

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device set to use {device}")

# Load the tokenizer and model
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForTokenClassification.from_pretrained(
    model_name,
    num_labels=5,
    id2label=id2label_map
).to(device)
model.eval()

# Initialize the pipeline for NER with simple aggregation
nlp_pipeline = pipeline(
    task="ner",
    model=model,
    tokenizer=tokenizer,
    device=0 if torch.cuda.is_available() else -1,
    aggregation_strategy="simple"
)

# Warm-up inference so the model is fully loaded before real tasks
logging.info("Warming up the pipeline with a dummy inference...")
_ = nlp_pipeline("WARMUP PASS - forcing model to load")
logging.info("Warm-up complete. Model is now fully loaded and ready for inference.")

# Configure Selenium
def configure_selenium():
    ua = UserAgent()
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument(f"user-agent={ua.random}")
    driver = webdriver.Chrome(options=options)
    return driver

# Initialize (or update) the SQLite database with PMID and DOI columns
def init_test_db():
    conn = sqlite3.connect(TEST_DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pmid TEXT,
            doi TEXT,
            title TEXT,
            background TEXT,
            methods TEXT,
            results TEXT,
            conclusions TEXT,
            sponsor TEXT,
            identified_drugs TEXT
        )
    """)
    conn.commit()
    conn.close()

# Save data to SQLite
def save_to_test_db(data):
    conn = sqlite3.connect(TEST_DB_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO articles (pmid, doi, title, background, methods, results, conclusions, sponsor, identified_drugs)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data["pmid"],
        data["doi"],
        data["title"],
        data["background"],
        data["methods"],
        data["results"],
        data["conclusions"],
        data["sponsor"],
        data["identified_drugs"],
    ))
    conn.commit()
    conn.close()

# Truncate lengthy text for better readability and to respect token limits
def truncate_text_for_model(text, max_length=512):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=max_length,
        padding="max_length",
    )
    return tokenizer.decode(inputs["input_ids"][0], skip_special_tokens=True)

# Fallback NER approach over title + first 2 paragraphs
def extract_entities_with_scibert(text):
    truncated_text = truncate_text_for_model(text, max_length=512)
    entities = nlp_pipeline(truncated_text)
    drugs = set()
    # The pipeline merges B-DRUG/I-DRUG into entity_group "DRUG"
    for entity in entities:
        if entity["entity_group"] == "DRUG":
            drugs.add(entity["word"])
    return drugs

def fallback_identify_drugs(title_text, background_text, methods_text):
    """
    Fallback approach if the substances <div> is not found.
    We run NER on title, background, methods, and return the combined set.
    """
    all_drugs = set()
    all_drugs.update(extract_entities_with_scibert(title_text))
    all_drugs.update(extract_entities_with_scibert(background_text))
    all_drugs.update(extract_entities_with_scibert(methods_text))
    return all_drugs

def extract_article_data(driver, url):
    driver.get(url)
    soup = BeautifulSoup(driver.page_source, "html.parser")

    print("Page Title:", soup.title.string if soup.title else "No title found")

    # --------------------------------
    # Extract PMID and DOI if present
    # --------------------------------
    pmid = None
    doi = None

    identifiers_ul = soup.find("ul", {"class": "identifiers", "id": "full-view-identifiers"})
    if identifiers_ul:
        # PMID
        pmid_strong = identifiers_ul.select_one("span.identifier.pubmed strong.current-id")
        if pmid_strong:
            pmid = pmid_strong.get_text(strip=True)

        # DOI
        doi_link = identifiers_ul.select_one("span.identifier.doi a.id-link")
        if doi_link:
            doi = doi_link.get_text(strip=True)

    # Extract Title
    title_div = soup.find("h1", class_="heading-title")
    title_text = title_div.get_text(strip=True) if title_div else ""

    # Extract first 2 paragraphs (Background + Methods)
    abstract_div = soup.find("div", id="abstract")
    abstract_parts = abstract_div.find_all("p") if abstract_div else []
    background_text = abstract_parts[0].get_text(strip=True) if len(abstract_parts) > 0 else ""
    methods_text = abstract_parts[1].get_text(strip=True) if len(abstract_parts) > 1 else ""

    # Optionally parse "Results" and "Conclusions" if they exist
    sections = {"Results": "", "Conclusions": ""}
    for part in abstract_parts[2:]:
        sub_title = part.find("strong", class_="sub-title")
        if sub_title:
            section_name = sub_title.get_text(strip=True).rstrip(":")
            text_content = part.get_text(strip=True).replace(sub_title.get_text(strip=True), "").strip()
            if section_name in sections:
                sections[section_name] = text_content

    # Attempt to find <div id="substances" class="substances keywords-section">
    substances_div = soup.find("div", {"id": "substances", "class": "substances keywords-section"})
    if substances_div:
        # If found, extract all <li> -> <button class="keyword-actions-trigger ...">
        substance_lis = substances_div.find_all("li")
        extracted_substances = set()
        for li in substance_lis:
            button = li.find("button", class_="keyword-actions-trigger trigger keyword-link")
            if button:
                substance_name = button.get_text(strip=True)
                if substance_name:
                    extracted_substances.add(substance_name)
        identified_drugs = sorted(extracted_substances)
        print(f"Found {len(identified_drugs)} substances in substances section: {identified_drugs}")
    else:
        # Fallback approach: use NER on title + background + methods
        print("No substances section found. Falling back to NER approach...")
        all_drugs = fallback_identify_drugs(title_text, background_text, methods_text)
        identified_drugs = sorted(all_drugs)

    # Extract sponsor info from "Conclusions"
    sponsor_match = re.search(r"(Funded by|Sponsored by)\s(.+?)(\.|;|$)", sections["Conclusions"])
    sponsor = sponsor_match.group(2).strip() if sponsor_match else "Not explicitly mentioned"

    return {
        "pmid": pmid,
        "doi": doi,
        "title": title_text,
        "background": background_text,
        "methods": methods_text,
        "results": sections["Results"],
        "conclusions": sections["Conclusions"],
        "sponsor": sponsor,
        "identified_drugs": ", ".join(identified_drugs),
    }

def scrape_article(url):
    driver = configure_selenium()
    try:
        article_data = extract_article_data(driver, url)
        if article_data:
            save_to_test_db(article_data)
        time.sleep(random.uniform(1, 3))
    finally:
        driver.quit()

def main():
    init_test_db()

    threads = []
    for url in ARTICLE_LINKS:
        thread = threading.Thread(target=scrape_article, args=(url,))
        threads.append(thread)
        thread.start()

    for thread in threads:
        thread.join()

    # Show final results
    conn = sqlite3.connect(TEST_DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM articles")
    rows = cursor.fetchall()
    conn.close()

    print("\nStored Results:")
    for row in rows:
        print(row)

    # Cleanup: remove test DB and logs
    for handler in logging.root.handlers[:]:
        logging.root.removeHandler(handler)
    logging.shutdown()
    os.remove(TEST_DB_FILE)
    os.remove("test_scraper.log")

if __name__ == "__main__":
    main()
