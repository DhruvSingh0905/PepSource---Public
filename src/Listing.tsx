import { useState, useEffect } from 'react';
import SearchBar from './SearchBar';
import { useLocation } from "react-router-dom";
import Rating from 'react-rating';

interface Vendor {
  id: number;
  name: string;
  price: string;
  size: string;
  product_link: string;
  cloudinary_product_image: string;
}

interface DrugDetails {
  id: number;
  name: string;         // matching (lowercase)
  proper_name: string;  // display (capitalized)
  what_it_does: string;
  how_it_works: string;
}

interface Review {
  id: number;
  account_id: number;
  rating: number;
  review_text: string;
  created_at: string;
}

const normalizeSize = (size: string) =>
  size.trim().toLowerCase().replace(/\s/g, '');

function Listing() {
  const location = useLocation();
  const { name: passedDrugName, description, img: passedImg } = location.state || {};

  const [drug, setDrug] = useState<DrugDetails | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedSize, setSelectedSize] = useState<string>("Best Price");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Reviews state
  const [drugReviews, setDrugReviews] = useState<Review[]>([]);
  const [vendorReviews, setVendorReviews] = useState<Review[]>([]);
  // Separate state for drug review form
  const [drugNewRating, setDrugNewRating] = useState<number>(0);
  const [drugNewReviewText, setDrugNewReviewText] = useState<string>("");
  // Separate state for vendor review form
  const [vendorNewRating, setVendorNewRating] = useState<number>(0);
  const [vendorNewReviewText, setVendorNewReviewText] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  // Fetch drug details and vendors
  useEffect(() => {
    if (!passedDrugName) {
      setError("No drug name provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(passedDrugName)}/vendors`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setDrug(data.drug);
          setVendors(data.vendors);
          setSelectedSize("Best Price");
          setSelectedVendor(null);
        } else {
          setError(data.message || "Error fetching drug details.");
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.toString());
        setLoading(false);
      });
  }, [passedDrugName]);

  // Fetch drug reviews when drug details are available.
  useEffect(() => {
    if (drug) {
      fetch(`http://127.0.0.1:8000/api/reviews/drug/${drug.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === "success") {
            setDrugReviews(data.reviews);
          }
        })
        .catch(err => console.error("Error fetching drug reviews:", err));
    }
  }, [drug]);

  // Fetch vendor reviews when a vendor is selected.
  useEffect(() => {
    if (selectedVendor) {
      fetch(`http://127.0.0.1:8000/api/reviews/vendor/${selectedVendor.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === "success") {
            setVendorReviews(data.reviews);
          }
        })
        .catch(err => console.error("Error fetching vendor reviews:", err));
    } else {
      setVendorReviews([]);
    }
  }, [selectedVendor]);

  // Derive unique size options from vendors.
  const sizeOptions = Array.from(new Set(vendors.map(v => normalizeSize(v.size)).filter(Boolean)));
  sizeOptions.sort((a, b) => parseFloat(a) - parseFloat(b));
  const allSizeOptions = ["Best Price", ...sizeOptions];

  // Filter vendors based on selected size.
  const filteredVendors = selectedSize === "Best Price" 
    ? vendors 
    : vendors.filter(vendor => normalizeSize(vendor.size) === selectedSize);

  // For "Best Price", aggregate vendors by name (lowest $/mg).
  const bestVendorMap: { [key: string]: Vendor & { costPerMg: number } } = {};
  if (selectedSize === "Best Price") {
    filteredVendors.forEach(vendor => {
      const vName = vendor.name;
      const price = parseFloat(vendor.price.replace(/[^0-9.]/g, '')) || 0;
      const size = parseFloat(vendor.size.replace(/[^0-9.]/g, '')) || 1;
      const costPerMg = price / size;
      if (!bestVendorMap[vName] || costPerMg < bestVendorMap[vName].costPerMg) {
        bestVendorMap[vName] = { ...vendor, costPerMg };
      }
    });
  }
  const displayVendors = selectedSize === "Best Price" ? Object.values(bestVendorMap) : filteredVendors;

  // Handler for submitting a drug review.
  const handleDrugReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReview(true);
    const payload = {
      account_id: 1, // Dummy account id.
      target_type: "drug",
      target_id: drug!.id,
      rating: drugNewRating,
      review_text: drugNewReviewText,
    };
    fetch("http://127.0.0.1:8000/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          fetch(`http://127.0.0.1:8000/api/reviews/drug/${drug!.id}`)
            .then(res => res.json())
            .then(data => {
              if (data.status === "success") setDrugReviews(data.reviews);
            })
            .catch(err => console.error("Error re-fetching drug reviews:", err));
          setDrugNewRating(0);
          setDrugNewReviewText("");
        } else {
          alert(data.message || "Error submitting review");
        }
        setSubmittingReview(false);
      })
      .catch(err => {
        console.error("Error submitting review:", err);
        setSubmittingReview(false);
      });
  };

  // Handler for submitting a vendor review.
  const handleVendorReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor) return;
    setSubmittingReview(true);
    const payload = {
      account_id: 1, // Dummy account id.
      target_type: "vendor",
      target_id: selectedVendor.id,
      rating: vendorNewRating,
      review_text: vendorNewReviewText,
    };
    fetch("http://127.0.0.1:8000/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          fetch(`http://127.0.0.1:8000/api/reviews/vendor/${selectedVendor.id}`)
            .then(res => res.json())
            .then(data => {
              if (data.status === "success") setVendorReviews(data.reviews);
            })
            .catch(err => console.error("Error re-fetching vendor reviews:", err));
          setVendorNewRating(0);
          setVendorNewReviewText("");
        } else {
          alert(data.message || "Error submitting review");
        }
        setSubmittingReview(false);
      })
      .catch(err => {
        console.error("Error submitting review:", err);
        setSubmittingReview(false);
      });
  };

  return (
    <div>
      <div className="pl-[20px] pb-[20px]">
        <SearchBar />
      </div>
      {loading && <p className="text-center">Loading drug details...</p>}
      {error && <p className="text-center text-red-500">Error: {error}</p>}
      {drug && (
        <div className="flex justify-center w-full min-h-full">
          <div className="flex bg-white shadow-lg rounded-lg w-[1500px] min-h-screen relative">
            {/* Left Column: Image */}
            <div className="w-[400px] p-6">
              <img
                src={selectedVendor?.cloudinary_product_image || passedImg}
                alt={drug.proper_name}
                className="w-full h-[400px] object-contain rounded-lg"
              />
            </div>
            {/* Right Column: Details, Sizing, Price, Vendors, and Reviews */}
            <div className="flex-1 p-6 flex flex-col space-y-6 bg-white">
              {/* Drug Details */}
              <div>
                <h2 className="text-[50px] font-semibold pb-[20px]">{drug.proper_name}</h2>
                <p className="mb-4"><strong>What it does:</strong> {drug.what_it_does}</p>
                <p className="mb-4"><strong>How it works:</strong> {drug.how_it_works}</p>
                {description && <p className="mb-4">{description}</p>}
              </div>
              {/* Sizing Options */}
              <div>
                <h3 className="text-xl font-semibold mb-2">Sizes</h3>
                <div className="flex gap-2 mb-4">
                  {allSizeOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => {
                        setSelectedSize(option);
                        setSelectedVendor(null); // Reset vendor selection when size changes.
                      }}
                      className={`border rounded px-3 py-1 text-sm transition-colors ${
                        selectedSize === option
                          ? "bg-blue-500 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              {/* Price & Button Section */}
              {selectedVendor && (
                <div className="my-4 border rounded bg-gray-50 inline-block p-2">
                  <p className="text-lg font-semibold m-0">Price: {selectedVendor.price}</p>
                  <a
                    href={selectedVendor.product_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition mt-2"
                  >
                    Go to {selectedVendor.name}
                  </a>
                </div>
              )}
              {/* Vendors List */}
              <div>
                <h3 className="text-xl font-semibold mb-2">Vendors</h3>
                <div className="flex flex-col gap-2">
                  {displayVendors.length > 0 ? (
                    displayVendors.map(vendor => (
                      <div
                        key={vendor.id}
                        onClick={() => setSelectedVendor(vendor)}
                        className="cursor-pointer border p-2 rounded flex items-center hover:bg-gray-100"
                      >
                        <div className="flex-1">{vendor.name}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">{vendor.price}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">{normalizeSize(vendor.size)}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">
                          $/mg {(() => {
                            const p = parseFloat(vendor.price.replace(/[^0-9.]/g, '')) || 0;
                            const s = parseFloat(vendor.size.replace(/[^0-9.]/g, '')) || 1;
                            return (p / s).toFixed(2);
                          })()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>No vendors found for this drug.</p>
                  )}
                </div>
              </div>
              {/* Reviews Section */}
              <div className="mt-6 border-t pt-6">
                {selectedVendor ? (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Left Column: Drug Reviews */}
                    <div>
                      <h3 className="text-2xl font-semibold mb-2">{drug.proper_name} Reviews</h3>
                      <div className="mb-2">
                        <span>
                          Average Rating:{" "}
                          {drugReviews.length
                            ? (drugReviews.reduce((sum, r) => sum + r.rating, 0) / drugReviews.length).toFixed(1)
                            : "N/A"}
                        </span>
                        <span className="ml-2">({drugReviews.length} reviews)</span>
                      </div>
                      <form onSubmit={handleDrugReviewSubmit} className="border p-4 rounded shadow-md mb-4">
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Rating:</label>
                          <Rating
                            initialRating={drugNewRating}
                            onChange={setDrugNewRating}
                            emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                            fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Review:</label>
                          <textarea
                            value={drugNewReviewText}
                            onChange={(e) => setDrugNewReviewText(e.target.value)}
                            rows={4}
                            className="w-full border border-gray-300 rounded p-2 bg-white"
                            placeholder="Type your review here..."
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={submittingReview || drugNewRating === 0 || drugNewReviewText.trim() === ""}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
                        >
                          {submittingReview ? "Submitting..." : "Submit Review"}
                        </button>
                      </form>
                      {drugReviews.map(review => (
                        <div key={review.id} className="border p-2 rounded mb-2">
                          <div className="flex items-center">
                            <Rating
                              initialRating={review.rating}
                              readonly
                              emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                              fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                            />
                            <span className="ml-2 text-sm text-gray-600">({review.rating} stars)</span>
                          </div>
                          <p className="mt-1">{review.review_text}</p>
                          <p className="mt-1 text-xs text-gray-500">{new Date(review.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                    {/* Right Column: Vendor Reviews */}
                    <div>
                      <h3 className="text-2xl font-semibold mb-2">{selectedVendor.name} Reviews</h3>
                      <div className="mb-2">
                        <span>
                          Average Rating:{" "}
                          {vendorReviews.length
                            ? (vendorReviews.reduce((sum, r) => sum + r.rating, 0) / vendorReviews.length).toFixed(1)
                            : "N/A"}
                        </span>
                        <span className="ml-2">({vendorReviews.length} reviews)</span>
                      </div>
                      <form onSubmit={(e) => handleVendorReviewSubmit(e)} className="border p-4 rounded shadow-md mb-4">
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Rating:</label>
                          <Rating
                            initialRating={vendorNewRating}
                            onChange={setVendorNewRating}
                            emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                            fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Review:</label>
                          <textarea
                            value={vendorNewReviewText}
                            onChange={(e) => setVendorNewReviewText(e.target.value)}
                            rows={4}
                            className="w-full border border-gray-300 rounded p-2 bg-white"
                            placeholder="Type your review here..."
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={submittingReview || vendorNewRating === 0 || vendorNewReviewText.trim() === ""}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
                        >
                          {submittingReview ? "Submitting..." : "Submit Review"}
                        </button>
                      </form>
                      {vendorReviews.map(review => (
                        <div key={review.id} className="border p-2 rounded mb-2">
                          <div className="flex items-center">
                            <Rating
                              initialRating={review.rating}
                              readonly
                              emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                              fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                            />
                            <span className="ml-2 text-sm text-gray-600">({review.rating} stars)</span>
                          </div>
                          <p className="mt-1">{review.review_text}</p>
                          <p className="mt-1 text-xs text-gray-500">{new Date(review.created_at).toLocaleDateString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-2xl font-semibold mb-2">{drug.proper_name} Reviews</h3>
                    <div className="mb-2">
                      <span>
                        Average Rating:{" "}
                        {drugReviews.length
                          ? (drugReviews.reduce((sum, r) => sum + r.rating, 0) / drugReviews.length).toFixed(1)
                          : "N/A"}
                      </span>
                      <span className="ml-2">({drugReviews.length} reviews)</span>
                    </div>
                    <form onSubmit={(e) => handleDrugReviewSubmit(e)} className="border p-4 rounded shadow-md mb-4">
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Rating:</label>
                        <Rating
                          initialRating={drugNewRating}
                          onChange={setDrugNewRating}
                          emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                          fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                        />
                      </div>
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Review:</label>
                        <textarea
                          value={drugNewReviewText}
                          onChange={(e) => setDrugNewReviewText(e.target.value)}
                          rows={4}
                          className="w-full border border-gray-300 rounded p-2 bg-white"
                          placeholder="Type your review here..."
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={submittingReview || drugNewRating === 0 || drugNewReviewText.trim() === ""}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
                      >
                        {submittingReview ? "Submitting..." : "Submit Review"}
                      </button>
                    </form>
                    {drugReviews.map(review => (
                      <div key={review.id} className="border p-2 rounded mb-2">
                        <div className="flex items-center">
                          <Rating
                            initialRating={review.rating}
                            readonly
                            emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                            fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                          />
                          <span className="ml-2 text-sm text-gray-600">({review.rating} stars)</span>
                        </div>
                        <p className="mt-1">{review.review_text}</p>
                        <p className="mt-1 text-xs text-gray-500">{new Date(review.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Recent News Section */}
            <div className="absolute bottom-4 left-4">
              <h2 className="text-[35px] font-semibold text-gray-800">Recent News</h2>
              <p className="pl-[3px]">News entered here</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Listing;