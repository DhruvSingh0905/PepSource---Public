import { useState, useEffect } from 'react';
import { useLocation, useParams, Link } from 'react-router-dom';
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

  if (loading) return <p className="text-center py-8 text-gray-500">Loading research articles...</p>;
  if (error) return <p className="text-center py-8 text-red-500">Error: {error}</p>;
  if (articles.length === 0) return <p className="text-center py-8 text-gray-500">No research articles available at this time.</p>;

  return (
    <div className="ai-articles-section mt-8">
      {/* Section explanation banner */}
      <div className="bg-indigo-50 border-l-4 border-indigo-500 p-4 mb-6 rounded-md">
        <h3 className="text-xl font-bold text-indigo-800 mb-2">Evidence-Based Research Summaries</h3>
        <p className="text-gray-700">
          Stay informed with the latest scientific findings on compounds you're interested in. Our AI-powered system analyzes 
          peer-reviewed research papers and presents the key findings in an easy-to-understand format. These summaries help 
          you understand the mechanisms of action, potential applications, safety profiles, and ongoing research developments 
          without having to navigate dense academic text. By exploring these summaries, you'll gain a more comprehensive 
          understanding of how these compounds work and their potential benefits and risks.
        </p>

      </div>
      
      <h2 className="text-3xl font-bold mb-6 text-gray-800 border-b pb-2">Summarized Research Articles</h2>
      
      <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-1">
      {articles.map((article) => (
  <details key={article.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden group">
    <summary className="cursor-pointer p-4 flex flex-col md:flex-row md:items-center text-gray-800 hover:bg-gray-50 transition-colors outline-none">
      <div className="flex-grow">
        <div className="font-bold text-lg text-[#3294b4]">{article.ai_heading}</div>
        <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-2">
          <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs">
            {article.publication_date}
          </span>
          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-xs">
            {article.publication_type}
          </span>
          {article.pmid && (
            <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs">
              PMID: {article.pmid}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 md:mt-0 flex items-center">
        <span className="inline-flex items-center text-gray-500 group-open:rotate-180 transition-transform duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </div>
    </summary>
  
    {subscriptionStatus ? (
      // Subscribed content - full details
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
          <details className="mb-4 bg-white p-3 rounded shadow-sm">
  <summary className="cursor-pointer font-semibold text-[#3294b4] flex items-center">
    Key Terms
    <div className="tooltip-trigger inline-block ml-2 relative" style={{ cursor: 'help' }}
         onMouseEnter={(e) => {
           const tooltip = e.currentTarget.querySelector('.tooltip');
           if (tooltip) {
             (tooltip as HTMLElement).style.opacity = '1';
             (tooltip as HTMLElement).style.visibility = 'visible';
           }
         }}
         onMouseLeave={(e) => {
           const tooltip = e.currentTarget.querySelector('.tooltip');
           if (tooltip) {
             (tooltip as HTMLElement).style.opacity = '0';
             (tooltip as HTMLElement).style.visibility = 'hidden';
           }
         }}>
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="tooltip absolute z-20 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg" 
           style={{ 
             opacity: 0,
             visibility: 'hidden',
             transition: 'opacity 150ms ease-in-out, visibility 150ms ease-in-out',
             marginBottom: '10px'  // Add extra margin to avoid clipping
           }}>
        Technical and scientific terminology used in the research, explained in accessible language to help understand the study's focus.
        <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2" style={{ transform: 'translateY(-1px)' }}>
          <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
        </div>
      </div>
    </div>
  </summary>
  <div className="ml-4 mt-2 whitespace-pre-wrap">{article.key_terms}</div>
</details>    
    <details className="mb-4 bg-white p-3 rounded shadow-sm">
              <summary className="cursor-pointer font-semibold text-[#3294b4] flex items-center">
                Heading
                <div className="tooltip-trigger inline-block ml-2 relative" style={{ cursor: 'help' }}
                     onMouseEnter={(e) => {
                       const tooltip = e.currentTarget.querySelector('.tooltip');
                       if (tooltip) {
                         (tooltip as HTMLElement).style.opacity = '1';
                         (tooltip as HTMLElement).style.visibility = 'visible';
                       }
                     }}
                     onMouseLeave={(e) => {
                       const tooltip = e.currentTarget.querySelector('.tooltip');
                       if (tooltip) {
                         (tooltip as HTMLElement).style.opacity = '0';
                         (tooltip as HTMLElement).style.visibility = 'hidden';
                       }
                     }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="tooltip absolute z-10 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg" 
                       style={{ 
                         opacity: 0,
                         visibility: 'hidden',
                         transition: 'opacity 150ms ease-in-out, visibility 150ms ease-in-out'
                       }}>
                    A concise, explanatory title summarizing the main findings or focus of the research paper in plain language.
                    <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2">
                      <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
                    </div>
                  </div>
                </div>
              </summary>
              <div className="ml-4 mt-2 whitespace-pre-wrap">{article.ai_heading}</div>
            </details>
          </div>
          <div>
            <details className="mb-4 bg-white p-3 rounded shadow-sm">
              <summary className="cursor-pointer font-semibold text-[#3294b4] flex items-center">
                Background
                <div className="tooltip-trigger inline-block ml-2 relative" style={{ cursor: 'help' }}
                     onMouseEnter={(e) => {
                       const tooltip = e.currentTarget.querySelector('.tooltip');
                       if (tooltip) {
                         (tooltip as HTMLElement).style.opacity = '1';
                         (tooltip as HTMLElement).style.visibility = 'visible';
                       }
                     }}
                     onMouseLeave={(e) => {
                       const tooltip = e.currentTarget.querySelector('.tooltip');
                       if (tooltip) {
                         (tooltip as HTMLElement).style.opacity = '0';
                         (tooltip as HTMLElement).style.visibility = 'hidden';
                       }
                     }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="tooltip absolute z-10 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg" 
                       style={{ 
                         opacity: 0,
                         visibility: 'hidden',
                         transition: 'opacity 150ms ease-in-out, visibility 150ms ease-in-out'
                       }}>
                    Context and motivation for the research, explaining why the study was conducted and its significance in the field.
                    <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2">
                      <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
                    </div>
                  </div>
                </div>
              </summary>
              <div className="ml-4 mt-2 whitespace-pre-wrap">{article.ai_background}</div>
            </details>
            <details className="mb-4 bg-white p-3 rounded shadow-sm">
              <summary className="cursor-pointer font-semibold text-[#3294b4] flex items-center">
                Conclusion
                <div className="tooltip-trigger inline-block ml-2 relative" style={{ cursor: 'help' }}
                     onMouseEnter={(e) => {
                       const tooltip = e.currentTarget.querySelector('.tooltip');
                       if (tooltip) {
                         (tooltip as HTMLElement).style.opacity = '1';
                         (tooltip as HTMLElement).style.visibility = 'visible';
                       }
                     }}
                     onMouseLeave={(e) => {
                       const tooltip = e.currentTarget.querySelector('.tooltip');
                       if (tooltip) {
                         (tooltip as HTMLElement).style.opacity = '0';
                         (tooltip as HTMLElement).style.visibility = 'hidden';
                       }
                     }}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="tooltip absolute z-10 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg" 
                       style={{ 
                         opacity: 0,
                         visibility: 'hidden',
                         transition: 'opacity 150ms ease-in-out, visibility 150ms ease-in-out'
                       }}>
                    The researchers' key findings, implications of the results, and potential impact on future research or practical applications.
                    <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2">
                      <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
                    </div>
                  </div>
                </div>
              </summary>
              <div className="ml-4 mt-2 whitespace-pre-wrap">{article.ai_conclusion}</div>
            </details>
          </div>
        </div>
        {article.doi && (
          <div className="mt-4 text-right">
            <a 
              href={`https://doi.org/${article.doi}`} 
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-sm flex items-center justify-end"
            >
              <span>View Original Research Paper</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>
    ) : (
      // The non-subscribed blurred content remains unchanged
      <div className="relative mt-2 p-4 border-t border-gray-200">
        {/* Blurred content */}
        <div className="filter blur-md p-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="mb-4 bg-white p-3 rounded shadow-sm">
                <div className="font-semibold">Key Terms</div>
                <div className="ml-4 mt-2">
                  Here you would see a comprehensive list of key scientific terms and concepts mentioned in the research paper,
                  helping you quickly understand the technical aspects without needing specialized knowledge.
                </div>
              </div>
              <div className="mb-4 bg-white p-3 rounded shadow-sm">
                <div className="font-semibold">Background & Context</div>
                <div className="ml-4 mt-2">
                  Our AI provides simplified background information that contextualizes the research findings and explains
                  why this research matters and how it builds on previous scientific understanding.
                </div>
              </div>
            </div>
            <div>
              <div className="mb-4 bg-white p-3 rounded shadow-sm">
                <div className="font-semibold">Main Findings</div>
                <div className="ml-4 mt-2">
                  The key results and evidence from the original research are presented in straightforward language,
                  focusing on what was discovered rather than complex methodologies.
                </div>
              </div>
              <div className="mb-4 bg-white p-3 rounded shadow-sm">
                <div className="font-semibold">Conclusions & Implications</div>
                <div className="ml-4 mt-2">
                  Understand what the researchers concluded and the potential significance of their findings for
                  future applications, treatments, or further research.
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Overlay with subscription CTA */}
        <Link 
          to="/subscription" 
          className="absolute inset-0 flex flex-col items-center justify-center bg-white bg-opacity-80"
        >
          <div className="text-center px-4">
            <img src={logo} alt="Logo" className="w-32 h-16 mx-auto mb-2" />
            <h3 className="text-xl font-bold text-[#3294b4] mb-2">Unlock Research Insights</h3>
            <p className="text-gray-700 mb-4 max-w-md">
              Subscribe to access our AI-powered research summaries and make informed decisions based on the latest scientific evidence.
            </p>
            <button className="bg-[#3294b4] text-white px-6 py-2 rounded-full hover:bg-blue-600 transition-colors">
              Upgrade Now
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


function DesktopListing() {
  const location = useLocation();
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
  //User
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userSubscription, setUserSubscription] = useState(false);
  // Inline editing state for reviews
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [editingReviewText, setEditingReviewText] = useState<string>("");
  const [editingReviewRating, setEditingReviewRating] = useState<number>(0);
  const [editingReviewTarget, setEditingReviewTarget] = useState<'drug' | 'vendor' | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<boolean>(false);
  
  // Tab interface state
  const [activeTab, setActiveTab] = useState<'vendors' | 'research'>('vendors');

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

  // Check if user has active subscription
  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: info } = await axios.get(`${apiUrl}/user-subscription`, {
            params: { user_id: user.id },
          });
          
          if (info && info.subscription && info.subscription.status === "active") {
            setSubscriptionStatus(true);
          }
        }
      } catch (error) {
        console.error("Error checking subscription:", error);
      }
    };
    
    checkSubscription();
  }, [apiUrl]);

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
  const handleDeleteReview = async (reviewId: number, targetType: 'drug' | 'vendor') => {
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
{/* Drug Title and Information with improved design - always visible */}
<div className="mb-8">
  {/* Title with enhanced design - proper name only */}
  <div className="mb-8">
    <div className="flex items-center">
      <div className="mr-4 w-10 h-10 flex-shrink-0 bg-[#3294b4] rounded-full flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      </div>
      <h1 className="text-4xl font-bold text-gray-800 border-b-2 border-[#3294b4] pb-2">{drug.proper_name}</h1>
    </div>
  </div>
  
  {/* Info cards layout */}
  <div className="grid md:grid-cols-2 gap-6">
    {/* What it does card */}
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          What It Does
        </h2>
      </div>
      <div className="p-4 prose max-w-none">
        <p className="text-gray-700 leading-relaxed">{drug.what_it_does}</p>
      </div>
    </div>
    
    {/* How it works card */}
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          How It Works
        </h2>
      </div>
      <div className="p-4 prose max-w-none">
        <p className="text-gray-700 leading-relaxed">{drug.how_it_works}</p>
      </div>
    </div>
  </div>
  
  {/* Additional description if available */}
  {description && (
    <div className="mt-6 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Additional Information
        </h2>
      </div>
      <div className="p-4 prose max-w-none">
        <p className="text-gray-700 leading-relaxed">{description}</p>
      </div>
    </div>
  )}
</div>

{/* Tab Navigation */}
<div className="mb-4 border-b border-gray-200">
  <div className="flex space-x-2">
    <button
      onClick={() => setActiveTab('vendors')}
      className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
        activeTab === 'vendors' 
          ? 'bg-[#3294b4] text-white' 
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      Vendors & Pricing
    </button>
    <button
      onClick={() => setActiveTab('research')}
      className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
        activeTab === 'research' 
          ? 'bg-[#3294b4] text-white' 
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      Research & Effects
    </button>
  </div>
</div>

{/* Tab Content */}
<div className="mb-6">
  {activeTab === 'vendors' ? (
    <div className="vendors-tab space-y-6">
      {/* Sizing Options */}
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          Available Sizes
        </h3>
        
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex flex-wrap gap-3">
            {allSizeOptions.map(option => (
              <button
                key={option}
                onClick={() => {
                  setSelectedSize(option);
                  setSelectedVendor(null);
                }}
                className={`relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedSize === option
                    ? "bg-[#3294b4] text-white shadow-sm" 
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {option === "Best Price" ? (
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {option}
                  </div>
                ) : (
                  option
                )}
                
                {selectedSize === option && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3294b4] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-[#3294b4]"></span>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Price & Button Section */}
      {selectedVendor && (
        <div className="mb-8">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Product Details
              </h3>
            </div>
            
            <div className="p-6">
              <div className="grid md:grid-cols-3 gap-6">
                {/* Price Card */}
                <div className="bg-gray-50 rounded-lg p-4 flex flex-col items-center justify-center">
                  <div className="text-sm text-gray-500 mb-1">Price</div>
                  <div className="text-2xl font-bold text-gray-800">{selectedVendor.price}</div>
                </div>
                
                {/* Form Card */}
                <div className="bg-gray-50 rounded-lg p-4 flex flex-col items-center justify-center">
                  <div className="text-sm text-gray-500 mb-1">Form</div>
                  <div className="text-xl font-medium text-gray-800">
                    {selectedVendor.form 
                      ? (selectedVendor.form.charAt(0).toUpperCase() + selectedVendor.form.slice(1))
                      : "Not specified"}
                  </div>
                </div>
                
                {/* Purchase Button */}
                <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-center">
                  <a
                    href={selectedVendor.product_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-full bg-[#3294b4] text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-600 transition-colors shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                    Purchase from {selectedVendor.name}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Price Ratings Display */}
      {loadingRatings ? (
        <p className="text-sm italic">Loading price ratings...</p>
      ) : priceRatings ? (
        <div className="text-left">
          <p className="text-sm font-bold text-[#3294b4] mb-1 flex items-center">
            Price Efficiency Rating
            <div className="group relative inline-block ml-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-300 absolute z-10 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg">
                Our price efficiency rating helps you understand if you're getting a good deal. A rating of 5 means excellent value, while 1 indicates you might be paying too much compared to market averages.
                <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2">
                  <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
                </div>
              </div>
            </div>
          </p>
          
          {!userSubscription && (
            <div className="relative">
              {/* Blurred content with centered text */}
              <div className="filter blur-md">
                <p className="mb-1 text-center">
                  <span className="font-light">Price Efficiency Rating (5=best, 1=worst)</span>{" "}
                  <span className="text-gray-400">Price Efficiency Rating (5=best, 1=worst)</span>
                </p>
                <p className="text-center">
                  <span className="font-light">Price Efficiency Rating (5=best, 1=worst)</span>{" "}
                  <span className="text-gray-400">Price Efficiency Rating (5=best, 1=worst)</span>
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
            <p className="mb-1 flex items-center">
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
              <div className="group relative inline-block ml-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-300 absolute z-10 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg">
                  This rating compares the price efficiency of small order quantities from this vendor versus other vendors. Great for researchers who need smaller amounts for preliminary testing.
                  <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2">
                    <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
                  </div>
                </div>
              </div>
            </p>
          )}
          
          {(priceRatings.large_order_rating !== null && userSubscription) && (
            <p className="flex items-center">
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
              <div className="group relative inline-block ml-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-300 absolute z-10 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg">
                  This rating evaluates the price efficiency for bulk orders. Higher scores indicate better value when purchasing larger quantities for extended research projects.
                  <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2">
                    <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
                  </div>
                </div>
              </div>
            </p>
          )}
        </div>
      ) : null}

      {/* Vendors List */}
      <div>
        <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          Available Vendors
        </h3>
        
        {displayVendors.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 shadow-sm">
            {/* Small note about pricing */}
            <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 italic border-b border-gray-200 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Note: Prices may not reflect current promotions or sales. Always check vendor websites for the most current pricing.
            </div>

            {/* Header row */}
            <div className="grid grid-cols-5 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
              <div className="p-3">Vendor</div>
              <div className="p-3 text-center">Size</div>
              <div className="p-3 text-center">Price</div>
              <div className="p-3 text-center">$/mg</div>
              <div className="p-3 text-center">Form</div>
            </div>
            
            {/* Vendor rows */}
            <div className="divide-y divide-gray-200 bg-white">
              {displayVendors.map(vendor => (
                <div
                  key={vendor.id}
                  onClick={() => setSelectedVendor(vendor)}
                  className={`grid grid-cols-5 cursor-pointer hover:bg-blue-50 transition-colors duration-150 ${selectedVendor?.id === vendor.id ? 'bg-blue-50 border-l-4 border-[#3294b4]' : ''}`}
                >
                  <div className="p-3 flex items-center font-medium text-gray-800">
                    {vendor.name}
                  </div>
                  <div className="p-3 text-center text-gray-700">{normalizeSize(vendor.size)}</div>
                  <div className="p-3 text-center font-medium text-gray-800">{vendor.price}</div>
                  <div className="p-3 text-center text-gray-700">
                    ${(() => {
                      const p = parseFloat(vendor.price.replace(/[^0-9.]/g, '')) || 0;
                      const s = parseFloat(vendor.size.replace(/[^0-9.]/g, '')) || 1;
                      return (p / s).toFixed(2);
                    })()}
                  </div>
                  <div className="p-3 text-center text-gray-700">
                    {vendor.form ? (vendor.form.charAt(0).toUpperCase() + vendor.form.slice(1)) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-lg font-medium">No vendors found for this drug.</p>
            <p className="mt-2">Try selecting a different size option or check back later.</p>
          </div>
        )}
      </div>
      
      {/* Vendor Details Panel */}
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
    </div>
  ) : (
    <div className="research-tab space-y-6">
      {/* Side Effects Timeline Panel */}
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
        {drug && <SideEffectsTimelinePanel drugId={drug.id} subscriptionStatus={userSubscription} />}
      </div>
      
      {/* AI Articles Section */}
      <div className="mt-12">
        {drug ? <AiArticlesSection drugId={drug.id} subscriptionStatus={userSubscription} /> : <p>No drug selected.</p>}
      </div>
    </div>
  )}
</div>

{/* Reviews Section - Always visible at the bottom */}
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
                        onClick={() => handleDeleteReview("drug", drug.id)}
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
                        onClick={() => initiateEditReview(review, "vendor")}
                      >
                        Edit
                      </span>
                      <span
                        className="ml-2 text-xs text-red-500 cursor-pointer"
                        onClick={() => handleDeleteReview("vendor", drug.id)}
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
                      onClick={() => handleDeleteReview("drug", drug.id)}
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

export default DesktopListing;