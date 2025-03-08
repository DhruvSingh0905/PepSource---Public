import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Rating from 'react-rating';
import { supabase } from "../supabaseClient";
import VendorDetailsPanel from './VendorDetailsPanel'; // Use the integrated component
import DosingProtocolPanel from './DosingProtocolPanel.tsx';


interface Vendor {
  id: number;
  name: string;
  price: string;
  size: string;
  product_link: string;
  cloudinary_product_image: string;
  form?: string; // Add the optional form field

}
interface VendorPriceRatings {
  small_order_rating: number | null;
  large_order_rating: number | null;
}
interface DrugDetails {
  id: number;
  name: string;
  proper_name: string;
  what_it_does: string;
  how_it_works: string;
}

interface Review {
  id: number;
  account_id: string;
  rating: number;
  review_text: string;
  created_at: string;
  profiles?: {
    display_name?: string;
    email?: string;
  };
  user_name?: string;
}

const normalizeSize = (size: string) =>
  size.trim().toLowerCase().replace(/\s/g, '');

interface Article {
  id: number;
  article_url: string;
  pmid: string;
  doi: string;
  title: string;
  background: string;
  methods: string;
  results: string;
  conclusions: string;
  sponsor: string;
  publication_date: string;
  drug_id: number;
  publication_type: string;
  ai_heading: string;
  ai_background: string;
  ai_conclusion: string;
  key_terms: string;
}

interface AiArticlesSectionProps {
  drugId: number;
}

function AiArticlesSection({ drugId }: AiArticlesSectionProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/articles?drug_id=${drugId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          setArticles(data.articles);
        } else {
          setError(data.message || "Error fetching articles");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.toString());
        setLoading(false);
      });
  }, [drugId]);

  if (loading) return <p className="text-center">Loading AI articles...</p>;
  if (error && articles.length === 0) return <p className="text-center text-red-500">Error: {error}</p>;
  if (articles.length === 0) return <p className="text-center">No articles at this time.</p>;

  return (
    <div className="ai-articles-section mt-12">
      <h2 className="text-3xl font-bold mb-4">Summarized Articles</h2>
      {articles.map((article) => (
        <details key={article.id} className="border p-4 mb-4 rounded">
          <summary className="font-normal cursor-pointer">
            <div className="font-bold">{article.title}</div>
            <div>{article.publication_date}</div>
            <div>Publication type: {article.publication_type}</div>
            <div>PMID: {article.pmid}</div>
          </summary>
          <div className="ml-4 mt-2">
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Key Terms</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.key_terms}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Heading</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.ai_heading}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Background</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.ai_background}</div>
            </details>
            <details className="mb-2">
              <summary className="cursor-pointer font-semibold">Conclusion</summary>
              <div className="ml-4 whitespace-pre-wrap">{article.ai_conclusion}</div>
            </details>
          </div>
        </details>
      ))}
    </div>
  );
}

function Listing() {
  const location = useLocation();
  const navigate = useNavigate();
  const { name: passedDrugName, description, img: passedImg } = location.state || {};
// Use useParams to get the drug name from the URL
  const { drugName } = useParams<{ drugName: string }>();
  const [drug, setDrug] = useState<DrugDetails | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedSize, setSelectedSize] = useState<string>("Best Price");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [priceRatings, setPriceRatings] = useState<VendorPriceRatings | null>(null);
  const [loadingRatings, setLoadingRatings] = useState<boolean>(false);
  // Reviews state
  const [drugReviews, setDrugReviews] = useState<Review[]>([]);
  const [vendorReviews, setVendorReviews] = useState<Review[]>([]);
  const [drugNewRating, setDrugNewRating] = useState<number>(0);
  const [drugNewReviewText, setDrugNewReviewText] = useState<string>("");
  const [vendorNewRating, setVendorNewRating] = useState<number>(0);
  const [vendorNewReviewText, setVendorNewReviewText] = useState<string>("");
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Inline editing state for reviews
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [editingReviewText, setEditingReviewText] = useState<string>("");
  const [editingReviewRating, setEditingReviewRating] = useState<number>(0);
  const [editingReviewTarget, setEditingReviewTarget] = useState<'drug' | 'vendor' | null>(null);

  // Fetch current user from Supabase Auth on mount
  useEffect(() => {
    async function fetchUser() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error);
      } else if (user) {
        setCurrentUserId(user.id);
      }
    }
    fetchUser();
  }, []);
  // Fetch price ratings when a vendor is selected
  useEffect(() => {
    if (selectedVendor) {
      setLoadingRatings(true);
      fetch(`http://127.0.0.1:8000/api/vendor_price_ratings?name=${encodeURIComponent(selectedVendor.name)}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === "success") {
            setPriceRatings(data.ratings);
          } else {
            console.error("Error fetching price ratings:", data.message);
            setPriceRatings(null);
          }
        })
        .catch(err => {
          console.error("Error fetching price ratings:", err);
          setPriceRatings(null);
        })
        .finally(() => {
          setLoadingRatings(false);
        });
    } else {
      setPriceRatings(null);
    }
  }, [selectedVendor]);
  // Fetch drug details and vendors
  useEffect(() => {
    const fetchDrugName = drugName || (location.state && location.state.name);
    console.log("URL parameter drugName:", drugName);
    console.log("State name:", location.state?.name);
    console.log("Using fetch name:", fetchDrugName);
    if (!fetchDrugName) {
      setError("No drug name provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(fetchDrugName)}/vendors`)
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
  }, [drugName,location.state]);

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
  const filteredVendors =
    selectedSize === "Best Price"
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

  // Review handlers (delete, edit, submit) remain unchanged…
  const handleDeleteReview = async (reviewId: number, targetType: 'drug' | 'vendor', targetId: number) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/reviews/${reviewId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.status === "success") {
        if (targetType === "drug" && drug) {
          const res = await fetch(`http://127.0.0.1:8000/api/reviews/drug/${drug.id}`);
          const refreshedData = await res.json();
          if (refreshedData.status === "success") setDrugReviews(refreshedData.reviews);
        } else if (targetType === "vendor" && selectedVendor) {
          const res = await fetch(`http://127.0.0.1:8000/api/reviews/vendor/${selectedVendor.id}`);
          const refreshedData = await res.json();
          if (refreshedData.status === "success") setVendorReviews(refreshedData.reviews);
        }
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error("Error deleting review:", err);
    }
  };

  const initiateEditReview = (review: Review, target: 'drug' | 'vendor') => {
    setEditingReviewId(review.id);
    setEditingReviewText(review.review_text);
    setEditingReviewRating(review.rating);
    setEditingReviewTarget(target);
  };

  const submitEditReview = async () => {
    if (!editingReviewId || !editingReviewTarget || !currentUserId) return;
    const payload = {
      account_id: currentUserId,
      rating: editingReviewRating,
      review_text: editingReviewText
    };
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/reviews/${editingReviewId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === "success") {
        if (editingReviewTarget === "drug" && drug) {
          const res = await fetch(`http://127.0.0.1:8000/api/reviews/drug/${drug.id}`);
          const refreshedData = await res.json();
          if (refreshedData.status === "success") setDrugReviews(refreshedData.reviews);
        } else if (editingReviewTarget === "vendor" && selectedVendor) {
          const res = await fetch(`http://127.0.0.1:8000/api/reviews/vendor/${selectedVendor.id}`);
          const refreshedData = await res.json();
          if (refreshedData.status === "success") setVendorReviews(refreshedData.reviews);
        }
        setEditingReviewId(null);
        setEditingReviewTarget(null);
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error("Error editing review:", err);
    }
  };

  const handleDrugReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drug || !currentUserId) {
      alert("User not logged in or drug not loaded.");
      return;
    }
    setSubmittingReview(true);
    const payload = {
      account_id: currentUserId,
      target_type: "drug",
      target_id: drug.id,
      rating: drugNewRating,
      review_text: drugNewReviewText,
    };
    try {
      const response = await fetch("http://127.0.0.1:8000/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === "success") {
        const res = await fetch(`http://127.0.0.1:8000/api/reviews/drug/${drug.id}`);
        const refreshedData = await res.json();
        if (refreshedData.status === "success") {
          setDrugReviews(refreshedData.reviews);
        }
        setDrugNewRating(0);
        setDrugNewReviewText("");
      } else {
        alert(data.message || "Error submitting review");
      }
    } catch (err) {
      console.error("Error submitting review:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleVendorReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor || !currentUserId) return;
    setSubmittingReview(true);
    const payload = {
      account_id: currentUserId,
      target_type: "vendor",
      target_id: selectedVendor.id,
      rating: vendorNewRating,
      review_text: vendorNewReviewText,
    };
    try {
      const response = await fetch("http://127.0.0.1:8000/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === "success") {
        const res = await fetch(`http://127.0.0.1:8000/api/reviews/vendor/${selectedVendor.id}`);
        const refreshedData = await res.json();
        if (refreshedData.status === "success") {
          setVendorReviews(refreshedData.reviews);
        }
        setVendorNewRating(0);
        setVendorNewReviewText("");
      } else {
        alert(data.message || "Error submitting review");
      }
    } catch (err) {
      console.error("Error submitting review:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const displayReviewerName = (review: Review) => {
    if (review.profiles) {
      return review.profiles.display_name || review.profiles.email || (review.user_name || review.account_id);
    }
    return review.user_name || review.account_id;
  };

  return (
    <div className="pt-[100px] w-full px-4">
      {loading && <p className="text-center">Loading drug details...</p>}
      {(error && !drug) && <p className="text-center text-red-500">Error: {error}</p>}
      {drug && (
        <div className="min-h-full">
          {/* The card container: full width, retains existing styling */}
          <div className="flex w-full bg-white shadow-lg rounded-lg min-h-screen relative">
            {/* Left Column: Image */}
            <div className="">
              <img
                src={selectedVendor?.cloudinary_product_image || passedImg}
                alt={drug.proper_name}
                className="w-full h-[400px] object-contain rounded-lg"
              />
            </div>
            {/* Right Column: Details, Sizing, Vendors, and Reviews */}
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
                  {allSizeOptions.map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setSelectedSize(option);
                        setSelectedVendor(null);
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
                  <p className="text-md m-0">
                    Form: {selectedVendor.form 
                      ? (selectedVendor.form.charAt(0).toUpperCase() + selectedVendor.form.slice(1))
                      : "Not specified"}
                  </p>
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

{/* Price Ratings Display */}
{loadingRatings ? (
  <p className="text-sm italic">Loading price ratings...</p>
) : priceRatings ? (
  <div className="text-right">
    <p className="text-sm text-gray-600 mb-1">Price Efficiency Rating (10=best, 1=worst)</p>
    {priceRatings.small_order_rating !== null && (
      <p className="mb-1">
        <span className="font-medium">Small Orders:</span>{" "}
        <span className={priceRatings.small_order_rating >= 7 ? "text-green-600 font-bold" : 
              priceRatings.small_order_rating >= 4 ? "text-yellow-600 font-bold" : "text-red-600 font-bold"}>
          {priceRatings.small_order_rating}/10
        </span>
      </p>
    )}
    {priceRatings.large_order_rating !== null && (
      <p>
        <span className="font-medium">Large Orders:</span>{" "}
        <span className={priceRatings.large_order_rating >= 7 ? "text-green-600 font-bold" : 
              priceRatings.large_order_rating >= 4 ? "text-yellow-600 font-bold" : "text-red-600 font-bold"}>
          {priceRatings.large_order_rating}/10
        </span>
      </p>
    )}
  </div>
) : null}
              {/* Vendors List */}
              <div>
                <h3 className="text-xl font-semibold mb-2">Vendors</h3>
                <div className="flex flex-col gap-2">
                  {displayVendors.length > 0 ? (
                    displayVendors.map((vendor) => (
                      <div
                        key={vendor.id}
                        onClick={() => setSelectedVendor(vendor)}
                        className="cursor-pointer border p-2 rounded flex items-center hover:bg-gray-100"
                      >
                        <div className="flex-1">{vendor.name}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">{normalizeSize(vendor.size)}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">{vendor.price}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">
                          $/mg{" "}
                          {(() => {
                            const p = parseFloat(vendor.price.replace(/[^0-9.]/g, "")) || 0;
                            const s = parseFloat(vendor.size.replace(/[^0-9.]/g, "")) || 1;
                            return (p / s).toFixed(2);
                          })()}
                        </div>
                        <div className="flex-1 text-center bg-gray-50 p-1 mx-1 italic">
                        {vendor.form ? (vendor.form.charAt(0).toUpperCase() + vendor.form.slice(1)) : "—"}
                      </div>

                      </div>
                    ))
                  ) : (
                    <p>No vendors found for this drug.</p>
                  )}
                </div>
              </div>
              {/* Integrated Vendor Details Panel */}
              {selectedVendor && (
                <div className="mt-6">
                  <VendorDetailsPanel vendorName={selectedVendor.name} />
                </div>
              )}
              {/* Reviews Section */}
              <div className="mt-6 border-t pt-6">
                {/* ... (all existing review code remains unchanged) ... */}
              </div>
              {/* AI-Generated Articles Section */}
              <div className="mt-12">
                {drug ? <AiArticlesSection drugId={drug.id} /> : <p>No drug selected.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
  </div>
  );
}

export default Listing;