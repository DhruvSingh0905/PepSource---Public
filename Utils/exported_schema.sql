-- Table: Vendors
CREATE TABLE Vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    product_name TEXT,
    product_link TEXT,
    product_image TEXT,
    price TEXT,
    size TEXT,
    drug_id INTEGER, test_certificate TEXT, endotoxin_report TEXT, sterility_report TEXT, cloudinary_product_image TEXT, cloudinary_test_certificate TEXT, cloudinary_endotoxin_report TEXT, cloudinary_sterility_report TEXT, in_supabase BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (drug_id) REFERENCES Drugs (id)
);

-- Table: Drugs
CREATE TABLE Drugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            alt_name TEXT
        , what_it_does TEXT, how_it_works TEXT, alt_tag_1 TEXT, alt_tag_2 TEXT, vendor_count INTEGER DEFAULT 0, proper_name TEXT, last_checked TEXT, in_supabase BOOLEAN DEFAULT TRUE);

-- Table: Reviews
CREATE TABLE Reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,         -- ID of the user who wrote the review
    target_type TEXT NOT NULL,    -- 'drug' or 'vendor'
    target_id INTEGER NOT NULL,   -- ID of the drug or vendor being reviewed
    rating INTEGER NOT NULL,      -- e.g., 1 to 5 stars
    review_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Table: articles
CREATE TABLE articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_url TEXT UNIQUE,
            pmid TEXT,
            doi TEXT,
            title TEXT,
            background TEXT,
            methods TEXT,
            results TEXT,
            conclusions TEXT,
            sponsor TEXT,
            publication_date TEXT
        , drug_id TEXT, "publication_type" TEXT, ai_heading TEXT, ai_background TEXT, ai_conclusion TEXT, key_terms TEXT, in_supabase BOOLEAN DEFAULT TRUE, "is_relevant" TEXT, order_num INTEGER);

-- Table: users
CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            pfp TEXT,
            access_token TEXT,
            refresh_token TEXT,
            expires_in INTEGER
        );

-- Table: user_preferences
CREATE TABLE user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            preference TEXT NOT NULL
        );

-- Table: VendorDetails
CREATE TABLE "VendorDetails" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL,
    internal_coa TEXT,                   -- URL or NULL if not provided
    external_coa TEXT,                   -- URL or NULL if not provided
    latest_batch_test_date TEXT,         -- ISO 8601 date string (or NULL)
    endotoxin_test TEXT,                -- URL or NULL if not provided
    sterility_test TEXT,                -- URL or NULL if not provided
    years_in_business INTEGER,          
    external_COA_provider TEXT,         -- Provider for the external COA
    contact TEXT,                       -- Contact information
    Refund TEXT,                        -- TRUE if refunds are available, else FALSE
    Reimburse_Test TEXT,                -- Details on testing reimbursement, if any
    "comission" TEXT, shipping TEXT, Test_rating INTEGER, "Pros_Cons" TEXT, `Region` TEXT, small_order_rating REAL, `large_order_rating` REAL, `ai_rating` TEXT, `ai_rating_number` REAL,                   -- Commission rate as text (e.g., "5", "10", etc.)
    FOREIGN KEY (vendor_id) REFERENCES Vendors(id)
);

