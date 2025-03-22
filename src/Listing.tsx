import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import logo from "./assets/logo.png"; // Adjust the import path as needed
import Rating from 'react-rating';
import { supabase } from "../supabaseClient";
import VendorDetailsPanel from './VendorDetailsPanel'; // Use the integrated component
import SideEffectsTimelinePanel from './SideEffectsTimelinePanel'; // Replace DosingProtocolPanel
import axios from "axios";


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
  order: number | null;  // Using "order" directly as it appears in the DB

}

interface AiArticlesSectionProps {
  drugId: number;
  subscriptionStatus: boolean
}
const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

function AiArticlesSection({ drugId, subscriptionStatus }: AiArticlesSectionProps) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/articles?drug_id=${drugId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          // Sort articles by order if available
          const sortedArticles = [...data.articles].sort((a, b) => {
            // If both have order, sort by that
            if (a.order !== null && b.order !== null) {
              return a.order - b.order;
            }
            // If only one has order, prioritize the one with order
            if (a.order !== null) return -1;
            if (b.order !== null) return 1;
            
            // Fall back to id sorting if no order is available
            return a.id - b.id;
          });
          
          setArticles(sortedArticles);
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
  if (error) return <p className="text-center text-red-500">Error: {error}</p>;
  if (articles.length === 0) return <p className="text-center">No articles at this time.</p>;

  return (
    <div className="ai-articles-section mt-12">
      <h2 className="text-3xl font-bold mb-4">Summarized Articles</h2>
      {articles.map((article) => (
       <details key={article.id} className="border p-4 mb-4 rounded w-full">
       <summary className="font-normal cursor-pointer">
         <div className="font-bold">{article.ai_heading}</div>
         <div>{article.publication_date}</div>
         <div>Publication type: {article.publication_type}</div>
         <div>PMID: {article.pmid}</div>
       </summary>
     
       {subscriptionStatus ? (
         // Subscribed portion
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
       ) : (
         // Unsubscribed portion
         <div className="relative mt-2 w-full">
           {/* Blurred content (full width) */}
           <div className="filter blur-md w-full">
             <details className="mb-2 block w-full">
               <summary className="cursor-pointer font-light block w-full">
                Here you would see a dropdown allowing users to view our AI generated Key terms, background, and conclusion for this research paper. Our algorithim simply synthesizes these publicly available research articles into a format which is easily absorbed by the average person so that everyone has accessible access to quality information.
                Here you would see a dropdown allowing users to view our AI generated Key terms, background, and conclusion for this research paper. Our algorithim simply synthesizes these publicly available research articles into a format which is easily absorbed by the average person so that everyone has accessible access to quality information.
               </summary>
               
             </details>
           </div>
           {/* Overlay with Logo and Hyperlink */}
           <Link to="/subscription" className="absolute inset-0 flex items-center px-4">
             <div className="flex items-center justify-center space-x-2">
               <img src={logo} alt="Logo" className="w-48 h-24" />
               {/* Optionally, add text next to the logo */}
               {/* <span className="text-s font-semibold text-[#3294b4]">
                 Subscribe to view
               </span> */}
             </div>
           </Link>
         </div>
       )}
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
  //User
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userSubscription, setUserSubscription] = useState(false);
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
        return user;
      }
      return null;
    }
    async function fetchSubscriptionInfo() {
      const user = await fetchUser();
      const { data: info } = await axios.get(`${apiUrl}/user-subscription`, {
        params: { user_id: user?.id },
      });
      if (info?.info?.has_subscription) {
        setUserSubscription(true);
      }
    }
    fetchSubscriptionInfo(); 
  }, []);
  // Fetch price ratings when a vendor is selected
  useEffect(() => {
    if (selectedVendor) {
      setLoadingRatings(true);
      fetch(`${apiUrl}/api/vendor_price_ratings?name=${encodeURIComponent(selectedVendor.name)}`)
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
    fetch(`${apiUrl}/api/drug/${encodeURIComponent(fetchDrugName)}/vendors`)
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
      fetch(`${apiUrl}/api/reviews/drug/${drug.id}`)
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
      fetch(`${apiUrl}/api/reviews/vendor/${selectedVendor.id}`)
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
      const response = await fetch(`${apiUrl}/api/reviews/${reviewId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.status === "success") {
        if (targetType === "drug" && drug) {
          const res = await fetch(`${apiUrl}/api/reviews/drug/${drug.id}`);
          const refreshedData = await res.json();
          if (refreshedData.status === "success") setDrugReviews(refreshedData.reviews);
        } else if (targetType === "vendor" && selectedVendor) {
          const res = await fetch(`${apiUrl}/api/reviews/vendor/${selectedVendor.id}`);
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
      const response = await fetch(`${apiUrl}/api/reviews/${editingReviewId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === "success") {
        if (editingReviewTarget === "drug" && drug) {
          const res = await fetch(`${apiUrl}/api/reviews/drug/${drug.id}`);
          const refreshedData = await res.json();
          if (refreshedData.status === "success") setDrugReviews(refreshedData.reviews);
        } else if (editingReviewTarget === "vendor" && selectedVendor) {
          const res = await fetch(`${apiUrl}/api/reviews/vendor/${selectedVendor.id}`);
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
      const response = await fetch(`${apiUrl}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === "success") {
        const res = await fetch(`${apiUrl}/api/reviews/drug/${drug.id}`);
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
      const response = await fetch(`${apiUrl}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data.status === "success") {
        const res = await fetch(`${apiUrl}/api/reviews/vendor/${selectedVendor.id}`);
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
    <div>
      {loading && <p className="text-center">Loading drug details...</p>}
      {error && <p className="text-center text-red-500">Error: {error}</p>}
      {drug && (
        <div className="flex justify-center w-full min-h-full pt-20">
          <div className="flex bg-white shadow-lg rounded-lg w-[1500px] min-h-screen relative">
            {/* Left Column: Image */}
            <div className="w-[400px] p-6">
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
                  {allSizeOptions.map(option => (
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
            <div className="text-left">
              <p className="text-sm font-bold text-[#3294b4] mb-1">
                Price Efficiency Rating (10=best, 1=worst)
              </p>
              {!userSubscription && (
                <div className="relative">
                  {/* Blurred content with centered text */}
                  <div className="filter blur-md">
                    <p className="mb-1 text-center">
                      <span className="font-light">Price Efficiency Rating (10=best, 1=worst)</span>{" "}
                      <span className="text-gray-400">Price Efficiency Rating (10=best, 1=worst)</span>
                    </p>
                    <p className="text-center">
                      <span className="font-light">Price Efficiency Rating (10=best, 1=worst)</span>{" "}
                      <span className="text-gray-400">Price Efficiency Rating (10=best, 1=worst)</span>
                    </p>
                  </div>
                  {/* Overlay message centered over the blurred text */}
                  <Link
                    to="/subscription"
                    className="absolute inset-0 flex flex-col items-center justify-center"
                  >
                    <img src={logo} alt="Logo" className="w-24 h-12" />
                  
                  </Link>
                </div>
            )}
              {(priceRatings.small_order_rating !== null && userSubscription) && (
                <p className="mb-1">
                  <span className="font-medium">Small Orders:</span>{" "}
                  <span
                    className={
                      priceRatings.small_order_rating >= 7
                        ? "text-green-600 font-bold"
                        : priceRatings.small_order_rating >= 4
                        ? "text-yellow-600 font-bold"
                        : "text-red-600 font-bold"
                    }
                  >
                    {priceRatings.small_order_rating}/10
                  </span>
                </p>
              )}
              {(priceRatings.large_order_rating !== null && userSubscription) && (
                <p>
                  <span className="font-medium">Large Orders:</span>{" "}
                  <span
                    className={
                      priceRatings.large_order_rating >= 7
                        ? "text-green-600 font-bold"
                        : priceRatings.large_order_rating >= 4
                        ? "text-yellow-600 font-bold"
                        : "text-red-600 font-bold"
                    }
                  >
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
                    displayVendors.map(vendor => (
                      <div
                        key={vendor.id}
                        onClick={() => setSelectedVendor(vendor)}
                        className="cursor-pointer border p-2 rounded flex items-center hover:bg-gray-100"
                      >
                        <div className="flex-1">{vendor.name}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">{normalizeSize(vendor.size)}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">{vendor.price}</div>
                        <div className="flex-1 text-center bg-gray-100 p-1 mx-1">
                          $/mg {(() => {
                            const p = parseFloat(vendor.price.replace(/[^0-9.]/g, '')) || 0;
                            const s = parseFloat(vendor.size.replace(/[^0-9.]/g, '')) || 1;
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
              
              {/* Integrated Vendor Details Panel placed above the articles */}
              {selectedVendor && (
                <>
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-md">
                  <h3 className="text-xl font-bold text-blue-800 mb-2">Why Vendor Information Matters</h3>
                  <p className="text-gray-700">
                    When purchasing peptides for research, the quality of your vendor is critical. Unlike regulated pharmaceuticals, 
                    research peptides can vary dramatically in purity, potency, and safety. Our vendor comparison helps you identify 
                    which suppliers provide sterility testing, endotoxin reports, and third-party verification - essential factors that 
                    protect your research investment and ensure consistent results.
                  </p>
                </div>
                <div className="mt-6">
                  <VendorDetailsPanel vendorName={selectedVendor.name} subscriptionStatus={userSubscription} />
                </div>
                </>
              )}

              {drug && (
                <div className="mt-8">
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 rounded-md">
                    <h3 className="text-xl font-bold text-amber-800 mb-2">Understanding Effects & Timeline - Critical Knowledge</h3>
                    <p className="text-gray-700">
                      Research peptides can have complex effects that develop over different timeframes. Knowing what to expect - both 
                      positive outcomes and potential concerns - is essential for proper monitoring and evaluation. Our detailed breakdown 
                      of normal, concerning, and serious side effects along with a timeline of expected changes provides the framework 
                      needed for responsible research.
                    </p>
                  </div>
                  <SideEffectsTimelinePanel drugId={drug.id} subscriptionStatus={userSubscription} />
                </div>
              )}              
              <div className="mt-12">
                {drug ? <AiArticlesSection drugId={drug.id} subscriptionStatus={userSubscription} /> : <p>No drug selected.</p>}
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
                          {editingReviewId === review.id && editingReviewTarget === "drug" ? (
                            <div>
                              <Rating
                                initialRating={editingReviewRating}
                                onChange={setEditingReviewRating}
                                emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                                fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                              />
                              <textarea
                                value={editingReviewText}
                                onChange={(e) => setEditingReviewText(e.target.value)}
                                rows={3}
                                className="w-full border border-gray-300 rounded p-2 mt-2 bg-white"
                                />
                              <div className="mt-2">
                                <button
                                  onClick={submitEditReview}
                                  className="bg-green-500 text-white px-3 py-1 rounded mr-2"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingReviewId(null)}
                                  className="bg-gray-500 text-white px-3 py-1 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center">
                                <Rating
                                  initialRating={review.rating}
                                  readonly
                                  emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                                  fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                                />
                                <span className="ml-2 text-sm text-gray-600">
                                  {displayReviewerName(review)}
                                </span>
                                {review.account_id === currentUserId && (
                                  <>
                                    <span
                                      className="ml-2 text-xs text-blue-500 cursor-pointer"
                                      onClick={() => initiateEditReview(review, "drug")}
                                    >
                                      Edit
                                    </span>
                                    <span
                                      className="ml-2 text-xs text-red-500 cursor-pointer"
                                      onClick={() => handleDeleteReview(review.id, "drug", drug.id)}
                                    >
                                      Delete
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="mt-1">{review.review_text}</p>
                              <p className="mt-1 text-xs text-gray-500">
                                {new Date(review.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          )}
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
                      <form onSubmit={handleVendorReviewSubmit} className="border p-4 rounded shadow-md mb-4">
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
                          {editingReviewId === review.id && editingReviewTarget === "vendor" ? (
                            <div>
                              <Rating
                                initialRating={editingReviewRating}
                                onChange={setEditingReviewRating}
                                emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                                fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                              />
                              <textarea
                                value={editingReviewText}
                                onChange={(e) => setEditingReviewText(e.target.value)}
                                rows={3}
                                className="w-full border border-gray-300 rounded p-2 mt-2"
                              />
                              <div className="mt-2">
                                <button
                                  onClick={submitEditReview}
                                  className="bg-green-500 text-white px-3 py-1 rounded mr-2"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingReviewId(null)}
                                  className="bg-gray-500 text-white px-3 py-1 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center">
                                <Rating
                                  initialRating={review.rating}
                                  readonly
                                  emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                                  fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                                />
                                <span className="ml-2 text-sm text-gray-600">
                                  {displayReviewerName(review)}
                                </span>
                                {review.account_id === currentUserId && (
                                  <>
                                    <span
                                      className="ml-2 text-xs text-blue-500 cursor-pointer"
                                      onClick={() => initiateEditReview(review, "drug")}
                                    >
                                      Edit
                                    </span>
                                    <span
                                      className="ml-2 text-xs text-red-500 cursor-pointer"
                                      onClick={() => handleDeleteReview(review.id, "drug", drug.id)}
                                    >
                                      Delete
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="mt-1">{review.review_text}</p>
                              <p className="mt-1 text-xs text-gray-500">
                                {new Date(review.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          )}
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
                        {editingReviewId === review.id && editingReviewTarget === "drug" ? (
                          <div>
                            <Rating
                              initialRating={editingReviewRating}
                              onChange={setEditingReviewRating}
                              emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                              fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                            />
                            <textarea
                              value={editingReviewText}
                              onChange={(e) => setEditingReviewText(e.target.value)}
                              rows={3}
                              className="w-full border border-gray-300 rounded p-2 mt-2"
                            />
                            <div className="mt-2">
                              <button
                                onClick={submitEditReview}
                                className="bg-green-500 text-white px-3 py-1 rounded mr-2"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingReviewId(null)}
                                className="bg-gray-500 text-white px-3 py-1 rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center">
                              <Rating
                                initialRating={review.rating}
                                readonly
                                emptySymbol={<span className="text-2xl text-gray-300">☆</span>}
                                fullSymbol={<span className="text-2xl text-yellow-500">★</span>}
                              />
                              <span className="ml-2 text-sm text-gray-600">
                                {displayReviewerName(review)}
                              </span>
                              {review.account_id === currentUserId && (
                                <>
                                  <span
                                    className="ml-2 text-xs text-blue-500 cursor-pointer"
                                    onClick={() => initiateEditReview(review, "drug")}
                                  >
                                    Edit
                                  </span>
                                  <span
                                    className="ml-2 text-xs text-red-500 cursor-pointer"
                                    onClick={() => handleDeleteReview(review.id, "drug", drug.id)}
                                  >
                                    Delete
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="mt-1">{review.review_text}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {new Date(review.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Listing;