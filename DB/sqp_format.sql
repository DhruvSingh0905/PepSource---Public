CREATE TABLE sqlite_sequence(name,seq);

CREATE TABLE Vendors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    product_name TEXT,
    product_link TEXT,
    product_image TEXT,
    price TEXT,
    size TEXT,
    drug_id INTEGER, test_certificate TEXT, endotoxin_report TEXT, sterility_report TEXT, cloudinary_product_image TEXT, cloudinary_test_certificate TEXT, cloudinary_endotoxin_report TEXT, cloudinary_sterility_report TEXT,
    FOREIGN KEY (drug_id) REFERENCES Drugs (id)
);

CREATE TABLE Drugs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            alt_name TEXT
        , what_it_does TEXT, how_it_works TEXT, alt_tag_1 TEXT, alt_tag_2 TEXT, vendor_count INTEGER DEFAULT 0);

