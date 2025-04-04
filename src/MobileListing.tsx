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
  publication_source?: string;
  ai_heading: string;
  ai_background: string;
  ai_conclusion: string;
  key_terms: string;
  order: number | null;  // Using "order" directly as it appears in the DB
}

interface AiArticlesSectionProps {
  drugId: number;
  subscriptionStatus: boolean;
}

const apiUrl: string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

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

  if (loading) return <p className="text-center py-6 text-gray-500 text-sm">Loading research articles...</p>;
  if (error) return <p className="text-center py-6 text-red-500 text-sm">Error: {error}</p>;
  if (articles.length === 0) return <p className="text-center py-6 text-gray-500 text-sm">No research articles available at this time.</p>;

  return (
    <div className="ai-articles-section mt-4">
      {/* Section explanation banner - simplified for mobile */}
      <div className="bg-indigo-50 border-l-4 border-indigo-500 p-3 mb-3 rounded-md">
        <h3 className="text-base font-bold text-indigo-800 mb-1">Research Summaries</h3>
        <p className="text-gray-700 text-xs leading-relaxed">
          AI-powered summaries of peer-reviewed research on compounds you're interested in.
        </p>
      </div>
      
      <h2 className="text-lg font-bold mb-3 text-gray-800 border-b pb-2">Research Articles</h2>
      
      <div className="space-y-3">
        {articles.map((article) => (
          <details key={article.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden group">
            <summary className="cursor-pointer p-3 flex flex-col text-gray-800 hover:bg-gray-50 transition-colors outline-none">
              <div className="flex-grow">
                <div className="font-bold text-sm text-[#3294b4]">{article.ai_heading}</div>
                <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-1">
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full text-xs">
                    {article.publication_date}
                  </span>
                  <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full text-xs">
                    {article.publication_type}
                  </span>
                  {article.publication_source && (
                    <span className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full text-xs">
                      {article.publication_source}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center">
                <span className="inline-flex items-center text-gray-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700 hidden group-open:block" viewBox="0 0 20 20" fill="currentColor">
                    {/* Chevron up icon */}
                    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-700 block group-open:hidden" viewBox="0 0 20 20" fill="currentColor">
                    {/* Chevron down icon */}
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>
            </summary>
          
            {subscriptionStatus ? (
              // Subscribed content - optimized for mobile
              <div className="p-2 border-t border-gray-200 bg-gray-50">
                <div className="space-y-2">
                  {/* Key Terms - always visible for subscribers */}
                  <div className="mb-2 bg-white p-2 rounded shadow-sm text-xs">
                    <div className="font-semibold text-[#3294b4] mb-1">Key Terms</div>
                    <div className="whitespace-pre-wrap text-xs text-gray-700 leading-relaxed break-words">
                      {article.key_terms.split('\n\n').map((paragraph, index, array) => (
                        <p key={index} className={index === array.length - 1 ? '' : 'mb-2'}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>    
                  
                  {/* Collapsible sections for better mobile viewing */}
                  <details className="bg-white p-2 rounded shadow-sm group">
                    <summary className="cursor-pointer font-semibold text-[#3294b4] flex items-center justify-between text-xs">
                      <span>Background</span>
                      <span className="inline-flex items-center text-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-700 hidden group-open:block" viewBox="0 0 20 20" fill="currentColor">
                          {/* Chevron up icon */}
                          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-700 block group-open:hidden" viewBox="0 0 20 20" fill="currentColor">
                          {/* Chevron down icon */}
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </summary>
                    <div className="mt-1 whitespace-pre-wrap text-xs text-gray-700 leading-relaxed break-words">
                      {article.ai_background.split('\n\n').map((paragraph, index, array) => (
                        <p key={index} className={index === array.length - 1 ? '' : 'mb-2'}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </details>
                  
                  <details className="bg-white p-2 rounded shadow-sm group">
                    <summary className="cursor-pointer font-semibold text-[#3294b4] flex items-center justify-between text-xs">
                      <span>Conclusion</span>
                      <span className="inline-flex items-center text-gray-700">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-700 hidden group-open:block" viewBox="0 0 20 20" fill="currentColor">
                          {/* Chevron up icon */}
                          <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-700 block group-open:hidden" viewBox="0 0 20 20" fill="currentColor">
                          {/* Chevron down icon */}
                          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </summary>
                    <div className="mt-1 whitespace-pre-wrap text-xs text-gray-700 leading-relaxed break-words">
                      {article.ai_conclusion.split('\n\n').map((paragraph, index, array) => (
                        <p key={index} className={index === array.length - 1 ? '' : 'mb-2'}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </details>
                </div>
                
                {article.doi && (
                  <div className="mt-2 text-right">
                    <a 
                      href={`https://doi.org/${article.doi}`} 
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs flex items-center justify-end"
                    >
                      <span>View Original Paper</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            ) : (
              // The non-subscribed blurred content - optimized for mobile
              <div className="relative p-2 border-t border-gray-200">
                {/* Simplified blurred content for better mobile display */}
                <div className="filter blur-sm p-2">
                  <div className="space-y-2">
                    <div className="mb-2 bg-white p-2 rounded shadow-sm">
                      <div className="font-semibold text-xs">Key Terms</div>
                      <div className="mt-1 text-xs bg-gray-100 h-2 rounded w-3/4"></div>
                      <div className="mt-1 text-xs bg-gray-100 h-2 rounded w-1/2"></div>
                    </div>
                    <div className="mb-2 bg-white p-2 rounded shadow-sm">
                      <div className="font-semibold text-xs">Research Summary</div>
                      <div className="mt-1 text-xs bg-gray-100 h-2 rounded w-full"></div>
                      <div className="mt-1 text-xs bg-gray-100 h-2 rounded w-4/5"></div>
                      <div className="mt-1 text-xs bg-gray-100 h-2 rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
                
                {/* Mobile-optimized subscription CTA */}
                <Link 
                  to="/subscription" 
                  className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-90"
                >
                  <div className="text-center px-3">
                    <img src={logo} alt="Logo" className="w-16 h-8 mx-auto mb-1" />
                    <h3 className="text-sm font-bold text-[#3294b4] mb-1">Unlock Research</h3>
                    <p className="text-gray-700 mb-2 text-xs">
                      Subscribe for AI research summaries.
                    </p>
                    <button className="bg-[#3294b4] text-white px-3 py-1 rounded-full text-xs hover:bg-blue-600 transition-colors">
                      Upgrade
                    </button>
                  </div>
                </Link>
              </div>
            )}
          </details>
        ))}      
      </div>
    </div>
  );
}

function MobileListing() {
    const location = useLocation();
    const navigate = useNavigate();
    const { description, img: passedImg } = location.state || {};
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
    // User
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [userSubscription, setUserSubscription] = useState(false);
    // Inline editing state for reviews
    const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
    const [editingReviewText, setEditingReviewText] = useState<string>("");
    const [editingReviewRating, setEditingReviewRating] = useState<number>(0);
    const [editingReviewTarget, setEditingReviewTarget] = useState<'drug' | 'vendor' | null>(null);
    // Mobile-specific states
    const [showReviewForm, setShowReviewForm] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<'details' | 'vendors' | 'research' | 'reviews'>('details');
  
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
    }, [drugName, location.state]);
  
    // Fetch drug reviews when drug details are available
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
  
    // Fetch vendor reviews when a vendor is selected
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
  
    // Derive unique size options from vendors
    const sizeOptions = Array.from(new Set(vendors.map(v => normalizeSize(v.size)).filter(Boolean)));
    sizeOptions.sort((a, b) => parseFloat(a) - parseFloat(b));
    const allSizeOptions = ["Best Price", ...sizeOptions];
  
    // Filter vendors based on selected size
    const filteredVendors =
      selectedSize === "Best Price"
        ? vendors
        : vendors.filter(vendor => normalizeSize(vendor.size) === selectedSize);
  
    // For "Best Price", aggregate vendors by name (lowest $/mg)
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
  
    // Review handlers
    const handleDeleteReview = async (reviewId: number, targetType: 'drug' | 'vendor', targetId: number) => {
      try {
        const response = await fetch(`${apiUrl}/api/reviews/${reviewId}`, {
          method: 'DELETE'
        });
        const data = await response.json();
        if (data.status === "success") {
          if (targetType === "drug" && drug) {
            const res = await fetch(`${apiUrl}/api/reviews/drug/${targetId}`);
            const refreshedData = await res.json();
            if (refreshedData.status === "success") setDrugReviews(refreshedData.reviews);
          } else if (targetType === "vendor" && selectedVendor) {
            const res = await fetch(`${apiUrl}/api/reviews/vendor/${targetId}`);
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
          setShowReviewForm(false);
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
          setShowReviewForm(false);
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
  
    if (loading) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#3294b4] mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading drug details...</p>
          </div>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="p-4 mt-16">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-red-700">Error: {error}</p>
                <button 
                  onClick={() => navigate(-1)} 
                  className="mt-2 text-red-600 underline"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  
    if (!drug) {
      return (
        <div className="p-4 mt-16 text-center">
          <p>No drug information available.</p>
          <button 
            onClick={() => navigate(-1)} 
            className="mt-2 text-blue-600 underline"
          >
            Go Back
          </button>
        </div>
      );
    }
  
    return (
      <div className="bg-gray-50 min-h-screen pb-16 pt-16">
        {/* Top image and drug name */}
        <div className="relative">
          <div className="w-full h-64 flex items-center justify-center bg-white">
            <img
              src={selectedVendor?.cloudinary_product_image || passedImg}
              alt={drug.proper_name}
              className="max-h-full max-w-full object-contain px-4 py-2"
            />
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-white to-transparent p-4 pt-8">
            <h1 className="text-2xl font-bold text-gray-800">{drug.proper_name}</h1>
          </div>
        </div>
  
        {/* Navigation tabs */}
        <div className="sticky top-0 bg-white z-10 border-b shadow-sm">
          <div className="flex overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 py-3 flex-1 text-center text-sm font-medium whitespace-nowrap ${
                activeTab === 'details' ? 'text-[#3294b4] border-b-2 border-[#3294b4]' : 'text-gray-500'
              }`}
            >
              Details
            </button>
            <button
              onClick={() => setActiveTab('vendors')}
              className={`px-4 py-3 flex-1 text-center text-sm font-medium whitespace-nowrap ${
                activeTab === 'vendors' ? 'text-[#3294b4] border-b-2 border-[#3294b4]' : 'text-gray-500'
              }`}
            >
              Vendors
            </button>
            <button
              onClick={() => setActiveTab('research')}
              className={`px-4 py-3 flex-1 text-center text-sm font-medium whitespace-nowrap ${
                activeTab === 'research' ? 'text-[#3294b4] border-b-2 border-[#3294b4]' : 'text-gray-500'
              }`}
            >
              Research
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`px-4 py-3 flex-1 text-center text-sm font-medium whitespace-nowrap ${
                activeTab === 'reviews' ? 'text-[#3294b4] border-b-2 border-[#3294b4]' : 'text-gray-500'
              }`}
            >
              Reviews
            </button>
          </div>
        </div>
  
        <div className="p-4">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* What it does card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <h2 className="text-base font-semibold text-gray-800 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    What It Does
                  </h2>
                </div>
                <div className="p-3 prose max-w-none">
                  <p className="text-gray-700 text-sm leading-relaxed">{drug.what_it_does}</p>
                </div>
              </div>
              
              {/* How it works card */}
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <h2 className="text-base font-semibold text-gray-800 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    How It Works
                  </h2>
                </div>
                <div className="p-3 prose max-w-none">
                  <p className="text-gray-700 text-sm leading-relaxed">{drug.how_it_works}</p>
                </div>
              </div>
              
              {/* Additional description if available */}
              {description && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                    <h2 className="text-base font-semibold text-gray-800 flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Additional Information
                    </h2>
                  </div>
                  <div className="p-3 prose max-w-none">
                    <p className="text-gray-700 text-sm leading-relaxed">{description}</p>
                  </div>
                </div>
              )}
            </div>
          )}
  
          {/* Vendors Tab */}
          {activeTab === 'vendors' && (
            <div className="space-y-4">
              {/* Sizing Options */}
              <div className="mb-4">
                <h3 className="text-base font-semibold mb-2 text-gray-800 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Available Sizes
                </h3>
                
                <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex flex-wrap gap-2">
                    {allSizeOptions.map(option => (
                      <button
                        key={option}
                        onClick={() => {
                          setSelectedSize(option);
                          setSelectedVendor(null);
                        }}
                        className={`relative px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                          selectedSize === option
                            ? "bg-[#3294b4] text-white shadow-sm" 
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {option === "Best Price" ? (
                          <div className="flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {option}
                          </div>
                        ) : (
                          option
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
  
{/* Selected Vendor Details */}
{selectedVendor && (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-4">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <h3 className="text-base font-semibold text-gray-800 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    {selectedVendor.name} Details
                  </h3>
                </div>
                
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {/* Price Card */}
                    <div className="bg-gray-50 rounded-lg p-2 flex flex-col items-center justify-center">
                      <div className="text-xs text-gray-500 mb-1">Price</div>
                      <div className="text-base font-bold text-gray-800">{selectedVendor.price}</div>
                    </div>
                    
                    {/* Size Card */}
                    <div className="bg-gray-50 rounded-lg p-2 flex flex-col items-center justify-center">
                      <div className="text-xs text-gray-500 mb-1">Size</div>
                      <div className="text-base font-bold text-gray-800">{selectedVendor.size}</div>
                    </div>
                    
                    {/* Form Card */}
                    <div className="bg-gray-50 rounded-lg p-2 flex flex-col items-center justify-center">
                      <div className="text-xs text-gray-500 mb-1">Form</div>
                      <div className="text-sm font-medium text-gray-800 text-center">
                        {selectedVendor.form 
                          ? (selectedVendor.form.charAt(0).toUpperCase() + selectedVendor.form.slice(1))
                          : "Not specified"}
                      </div>
                    </div>
                  </div>
                  
                  {/* Purchase Button */}
                  <a
                    href={selectedVendor.product_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full bg-[#3294b4] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                    Purchase from Vendor
                  </a>
                </div>
              </div>
            )}

            {/* Price Ratings Display */}
            {loadingRatings ? (
              <p className="text-xs italic text-center py-2">Loading price ratings...</p>
            ) : (priceRatings && selectedVendor) ? (
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 mb-4">
                <p className="text-xs font-bold text-[#3294b4] mb-2 flex items-center">
                  Price Efficiency Rating
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </p>
                
                {!userSubscription ? (
                  <Link
                    to="/subscription"
                    className="flex flex-col items-center justify-center py-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <img src={logo} alt="Logo" className="w-20 h-10 mb-1" />
                    <p className="text-xs text-gray-600">Subscribe to view price efficiency ratings</p>
                  </Link>
                ) : (
                  <div className="space-y-2">
                    {priceRatings.small_order_rating !== null && (
                      <p className="text-xs flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span className="font-medium">Small Orders:</span>{" "}
                        <span
                          className={
                            priceRatings.small_order_rating >= 3.5
                              ? "text-green-600 font-bold"
                              : priceRatings.small_order_rating >= 2
                              ? "text-yellow-600 font-bold"
                              : "text-red-600 font-bold"
                          }
                        >
                          {priceRatings.small_order_rating}/5
                        </span>
                      </p>
                    )}
                    
                    {priceRatings.large_order_rating !== null && (
                      <p className="text-xs flex items-center justify-between bg-gray-50 p-2 rounded">
                        <span className="font-medium">Large Orders:</span>{" "}
                        <span
                          className={
                            priceRatings.large_order_rating >= 3.5
                              ? "text-green-600 font-bold"
                              : priceRatings.large_order_rating >= 2
                              ? "text-yellow-600 font-bold"
                              : "text-red-600 font-bold"
                          }
                        >
                          {priceRatings.large_order_rating}/5
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* Vendors List */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  Available Vendors
                </h3>
              </div>
              
              {displayVendors.length > 0 ? (
                <div>
                  {/* Small note about pricing */}
                  <div className="px-3 py-2 text-xs text-gray-500 italic border-b border-gray-200">
                    Prices may not reflect current promotions. Check vendor sites for current pricing.
                  </div>

                  {/* Vendor rows - for mobile we'll use a card layout instead of a table */}
                  <div className="divide-y divide-gray-200">
                    {displayVendors.map(vendor => (
                      <div
                        key={vendor.id}
                        onClick={() => setSelectedVendor(vendor)}
                        className={`p-3 cursor-pointer hover:bg-blue-50 transition-colors duration-150 ${
                          selectedVendor?.id === vendor.id ? 'bg-blue-50 border-l-4 border-[#3294b4]' : ''
                        }`}
                      >
                        <div className="font-medium text-gray-800 mb-1">{vendor.name}</div>
                        <div className="grid grid-cols-3 gap-1 text-xs">
                          <div className="text-gray-600">
                            <span className="font-medium">Size:</span> {normalizeSize(vendor.size)}
                          </div>
                          <div className="text-gray-600">
                            <span className="font-medium">Price:</span> {vendor.price}
                          </div>
                          <div className="text-gray-600">
                            <span className="font-medium">$/mg:</span> ${(() => {
                              const p = parseFloat(vendor.price.replace(/[^0-9.]/g, '')) || 0;
                              const s = parseFloat(vendor.size.replace(/[^0-9.]/g, '')) || 1;
                              return (p / s).toFixed(2);
                            })()}
                          </div>
                        </div>
                        {vendor.form && (
                          <div className="text-xs text-gray-600 mt-1">
                            <span className="font-medium">Form:</span> {vendor.form.charAt(0).toUpperCase() + vendor.form.slice(1)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-sm font-medium">No vendors found for this drug.</p>
                  <p className="mt-1 text-xs">Try selecting a different size option or check back later.</p>
                </div>
              )}
            </div>

            {/* Vendor Details Panel */}
            {selectedVendor && (
              <div className="mt-4">
                <div className="bg-blue-50 border-l-4 border-blue-500 p-3 mb-4 rounded-md">
                  <h3 className="text-base font-bold text-blue-800 mb-1">Why Vendor Information Matters</h3>
                  <p className="text-gray-700 text-xs">
                    When purchasing peptides for research, the quality of your vendor is critical. Our vendor comparison helps you identify 
                    which suppliers provide sterility testing, endotoxin reports, and third-party verification.
                  </p>
                </div>
                <VendorDetailsPanel vendorName={selectedVendor.name} subscriptionStatus={userSubscription} />
              </div>
            )}
          </div>
        )}

        {/* Research Tab */}
        {activeTab === 'research' && (
          <div className="space-y-4">
            {/* Side Effects Timeline Panel */}
            <div className="mb-4">
              <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded-md">
                <h3 className="text-base font-bold text-amber-800 mb-1">Understanding Effects & Timeline</h3>
                <p className="text-gray-700 text-xs">
                  Research peptides can have complex effects that develop over different timeframes. Our detailed breakdown 
                  provides information on normal, concerning, and serious side effects with expected timelines.
                </p>
              </div>
              <SideEffectsTimelinePanel drugId={drug.id} subscriptionStatus={userSubscription} />
            </div>
            
            {/* AI Articles Section */}
            <div className="mt-6">
              <AiArticlesSection drugId={drug.id} subscriptionStatus={userSubscription} />
            </div>
          </div>
        )}

{/* Reviews Tab */}
{activeTab === 'reviews' && (
          <div>
            {/* Toggle for Drug/Vendor Reviews */}
            {selectedVendor ? (
              <div className="flex mb-4 border rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowReviewForm(false)}
                  className={`flex-1 py-2 text-center text-sm font-medium ${
                    !showReviewForm ? 'bg-[#3294b4] text-white' : 'bg-white text-gray-700'
                  }`}
                >
                  View Reviews
                </button>
                <button
                  onClick={() => setShowReviewForm(true)}
                  className={`flex-1 py-2 text-center text-sm font-medium ${
                    showReviewForm ? 'bg-[#3294b4] text-white' : 'bg-white text-gray-700'
                  }`}
                >
                  Write Review
                </button>
              </div>
            ) : (
              <div className="flex mb-4 border rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowReviewForm(false)}
                  className={`flex-1 py-2 text-center text-sm font-medium ${
                    !showReviewForm ? 'bg-[#3294b4] text-white' : 'bg-white text-gray-700'
                  }`}
                >
                  View Reviews
                </button>
                <button
                  onClick={() => setShowReviewForm(true)}
                  className={`flex-1 py-2 text-center text-sm font-medium ${
                    showReviewForm ? 'bg-[#3294b4] text-white' : 'bg-white text-gray-700'
                  }`}
                >
                  Write Review
                </button>
              </div>
            )}

            {/* Review Form */}
            {showReviewForm && (
              <div className="mb-4">
                {selectedVendor ? (
                  <form onSubmit={handleVendorReviewSubmit} className="bg-white border rounded-lg p-4 shadow-sm">
                    <h3 className="text-lg font-semibold mb-2 text-gray-800">Review for {selectedVendor.name}</h3>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rating:</label>
                      <Rating
                        initialRating={vendorNewRating}
                        onChange={setVendorNewRating}
                        emptySymbol={<span className="text-xl text-gray-300">☆</span>}
                        fullSymbol={<span className="text-xl text-yellow-500">★</span>}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Review:</label>
                      <textarea
                        value={vendorNewReviewText}
                        onChange={(e) => setVendorNewReviewText(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-300 rounded p-2 bg-white text-sm"
                        placeholder="Type your review here..."
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingReview || vendorNewRating === 0 || vendorNewReviewText.trim() === ""}
                      className={`w-full py-2 rounded-lg text-white text-sm font-medium ${
                        submittingReview || vendorNewRating === 0 || vendorNewReviewText.trim() === ""
                          ? "bg-gray-400"
                          : "bg-[#3294b4] hover:bg-blue-600 transition-colors"
                      }`}
                    >
                      {submittingReview ? "Submitting..." : "Submit Review"}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleDrugReviewSubmit} className="bg-white border rounded-lg p-4 shadow-sm">
                    <h3 className="text-lg font-semibold mb-2 text-gray-800">Review for {drug.proper_name}</h3>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rating:</label>
                      <Rating
                        initialRating={drugNewRating}
                        onChange={setDrugNewRating}
                        emptySymbol={<span className="text-xl text-gray-300">☆</span>}
                        fullSymbol={<span className="text-xl text-yellow-500">★</span>}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Review:</label>
                      <textarea
                        value={drugNewReviewText}
                        onChange={(e) => setDrugNewReviewText(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-300 rounded p-2 bg-white text-sm"
                        placeholder="Type your review here..."
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingReview || drugNewRating === 0 || drugNewReviewText.trim() === ""}
                      className={`w-full py-2 rounded-lg text-white text-sm font-medium ${
                        submittingReview || drugNewRating === 0 || drugNewReviewText.trim() === ""
                          ? "bg-gray-400"
                          : "bg-[#3294b4] hover:bg-blue-600 transition-colors"
                      }`}
                    >
                      {submittingReview ? "Submitting..." : "Submit Review"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Reviews Display */}
            {!showReviewForm && (
              <div>
                {selectedVendor ? (
                  <div className="space-y-2">
                    <div className="bg-white p-3 rounded-lg border shadow-sm mb-3">
                      <h3 className="font-semibold text-base mb-1 flex items-center justify-between">
                        <span>{selectedVendor.name} Reviews</span>
                        <span className="text-sm font-normal text-gray-600">
                          {vendorReviews.length > 0 
                            ? `${(vendorReviews.reduce((sum, r) => sum + r.rating, 0) / vendorReviews.length).toFixed(1)}/5` 
                            : "No ratings"}
                        </span>
                      </h3>
                      <div className="text-xs text-gray-500">{vendorReviews.length} reviews</div>
                    </div>
                    
                    {vendorReviews.length === 0 ? (
                      <div className="text-center py-4 bg-gray-50 rounded-lg border">
                        <p className="text-gray-500 text-sm">No reviews yet for this vendor.</p>
                      </div>
                    ) : (
                      vendorReviews.map(review => (
                        <div key={review.id} className="bg-white p-3 rounded-lg border shadow-sm">
                          {editingReviewId === review.id && editingReviewTarget === "vendor" ? (
                            <div>
                              <Rating
                                initialRating={editingReviewRating}
                                onChange={setEditingReviewRating}
                                emptySymbol={<span className="text-xl text-gray-300">☆</span>}
                                fullSymbol={<span className="text-xl text-yellow-500">★</span>}
                              />
                              <textarea
                                value={editingReviewText}
                                onChange={(e) => setEditingReviewText(e.target.value)}
                                rows={3}
                                className="w-full border border-gray-300 rounded p-2 mt-2 text-sm"
                              />
                              <div className="mt-2 flex space-x-2">
                                <button
                                  onClick={submitEditReview}
                                  className="flex-1 bg-green-500 text-white py-1 rounded text-sm"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingReviewId(null)}
                                  className="flex-1 bg-gray-500 text-white py-1 rounded text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Rating
                                    initialRating={review.rating}
                                    readonly
                                    emptySymbol={<span className="text-lg text-gray-300">☆</span>}
                                    fullSymbol={<span className="text-lg text-yellow-500">★</span>}
                                  />
                                </div>
                                <span className="text-xs text-gray-500">
                                  {new Date(review.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {displayReviewerName(review)}
                              </div>
                              <p className="mt-2 text-sm">{review.review_text}</p>
                              
                              {review.account_id === currentUserId && (
                                <div className="mt-2 flex justify-end space-x-3">
                                  <button
                                    className="text-xs text-blue-500"
                                    onClick={() => initiateEditReview(review, "vendor")}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="text-xs text-red-500"
                                    onClick={() => handleDeleteReview(review.id, "vendor", selectedVendor.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    
                    {/* Drug Reviews as Secondary Section */}
                    <div className="mt-6 bg-white p-3 rounded-lg border shadow-sm mb-3">
                      <h3 className="font-semibold text-base mb-1 flex items-center justify-between">
                        <span>{drug.proper_name} Reviews</span>
                        <span className="text-sm font-normal text-gray-600">
                          {drugReviews.length > 0 
                            ? `${(drugReviews.reduce((sum, r) => sum + r.rating, 0) / drugReviews.length).toFixed(1)}/5` 
                            : "No ratings"}
                        </span>
                      </h3>
                      <div className="text-xs text-gray-500">{drugReviews.length} reviews</div>
                    </div>

                    {drugReviews.length === 0 ? (
                      <div className="text-center py-4 bg-gray-50 rounded-lg border">
                        <p className="text-gray-500 text-sm">No reviews yet for this drug.</p>
                      </div>
                    ) : (
                      <div className="max-h-96 overflow-y-auto space-y-2">
                        {drugReviews.slice(0, 3).map(review => (
                          <div key={review.id} className="bg-white p-3 rounded-lg border shadow-sm">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <Rating
                                  initialRating={review.rating}
                                  readonly
                                  emptySymbol={<span className="text-lg text-gray-300">☆</span>}
                                  fullSymbol={<span className="text-lg text-yellow-500">★</span>}
                                />
                              </div>
                              <span className="text-xs text-gray-500">
                                {new Date(review.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">
                              {displayReviewerName(review)}
                            </div>
                            <p className="mt-2 text-sm">{review.review_text}</p>
                          </div>
                        ))}
                        {drugReviews.length > 3 && (
                          <button 
                            onClick={() => {
                              setSelectedVendor(null);
                              setShowReviewForm(false);
                            }}
                            className="w-full text-center py-2 text-sm text-blue-600 underline"
                          >
                            See all {drugReviews.length} reviews
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-white p-3 rounded-lg border shadow-sm mb-3">
                      <h3 className="font-semibold text-base mb-1 flex items-center justify-between">
                        <span>{drug.proper_name} Reviews</span>
                        <span className="text-sm font-normal text-gray-600">
                          {drugReviews.length > 0 
                            ? `${(drugReviews.reduce((sum, r) => sum + r.rating, 0) / drugReviews.length).toFixed(1)}/5` 
                            : "No ratings"}
                        </span>
                      </h3>
                      <div className="text-xs text-gray-500">{drugReviews.length} reviews</div>
                    </div>
                    
                    {drugReviews.length === 0 ? (
                      <div className="text-center py-4 bg-gray-50 rounded-lg border">
                        <p className="text-gray-500 text-sm">No reviews yet for this drug.</p>
                      </div>
                    ) : (
                      drugReviews.map(review => (
                        <div key={review.id} className="bg-white p-3 rounded-lg border shadow-sm">
                          {editingReviewId === review.id && editingReviewTarget === "drug" ? (
                            <div>
                              <Rating
                                initialRating={editingReviewRating}
                                onChange={setEditingReviewRating}
                                emptySymbol={<span className="text-xl text-gray-300">☆</span>}
                                fullSymbol={<span className="text-xl text-yellow-500">★</span>}
                              />
                              <textarea
                                value={editingReviewText}
                                onChange={(e) => setEditingReviewText(e.target.value)}
                                rows={3}
                                className="w-full border border-gray-300 rounded p-2 mt-2 text-sm"
                              />
                              <div className="mt-2 flex space-x-2">
                                <button
                                  onClick={submitEditReview}
                                  className="flex-1 bg-green-500 text-white py-1 rounded text-sm"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingReviewId(null)}
                                  className="flex-1 bg-gray-500 text-white py-1 rounded text-sm"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <Rating
                                    initialRating={review.rating}
                                    readonly
                                    emptySymbol={<span className="text-lg text-gray-300">☆</span>}
                                    fullSymbol={<span className="text-lg text-yellow-500">★</span>}
                                  />
                                </div>
                                <span className="text-xs text-gray-500">
                                  {new Date(review.created_at).toLocaleDateString()}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {displayReviewerName(review)}
                              </div>
                              <p className="mt-2 text-sm">{review.review_text}</p>
                              
                              {review.account_id === currentUserId && (
                                <div className="mt-2 flex justify-end space-x-3">
                                  <button
                                    className="text-xs text-blue-500"
                                    onClick={() => initiateEditReview(review, "drug")}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="text-xs text-red-500"
                                    onClick={() => handleDeleteReview(review.id, "drug", drug.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed bottom bar for active vendor */}
      {selectedVendor && activeTab === 'vendors' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-md p-3 flex items-center">
          <div className="flex-1">
            <div className="font-semibold text-sm">{selectedVendor.name}</div>
            <div className="text-xs text-gray-600">{selectedVendor.price} • {selectedVendor.size}</div>
          </div>
          <a
            href={selectedVendor.product_link}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#3294b4] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            Purchase
          </a>
        </div>
      )}
    </div>
  );
}

export default MobileListing;