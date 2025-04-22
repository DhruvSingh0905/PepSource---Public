import { useState, useEffect, useRef } from 'react';
import SearchBar from './SearchBar';
import Item from './item'; // Correct casing
import banner from './assets/banner.png';
import mobileBanner from './assets/mobileBanner.png'
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';
import axios from "axios";
import { supabase } from "../supabaseClient";

type Drug = {
  id: number;
  name: string;
  proper_name: string;
  img: string;
  alt_tag_1?: string;
  alt_tag_2?: string;
};

type Category = {
  id: string;
  name: string;
};

interface SurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (selected: string[]) => void;
}

const SurveyModal: React.FC<SurveyModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [selected, setSelected] = useState<string[]>([]);
  // Define the options for the survey
  const options = [
    "Weight loss",
    "Muscle Growth",
    "General Research",
    "Anti-inflammatory",
    "Peptide",
    "Recovery"
  ];

  const handleCheckboxChange = (option: string) => {
    setSelected((prev) =>
      prev.includes(option)
        ? prev.filter((item) => item !== option)
        : [...prev, option]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b border-gray-200 pb-4">
          What are you interested in?
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(selected);
            onClose();
          }}
        >
          <div className="space-y-4">
            {options.map((option) => (
              <div key={option} className="flex items-center">
                <input
                  type="checkbox"
                  id={option}
                  name="interests"
                  value={option}
                  onChange={() => handleCheckboxChange(option)}
                  checked={selected.includes(option)}
                  className="w-5 h-5 text-[#3294b4] border-gray-300 rounded focus:ring-[#3294b4] mr-3"
                />
                <label htmlFor={option} className="text-gray-700 font-medium">{option}</label>
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="mr-3 px-5 py-2 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
            >
              Skip
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-[#3294b4] text-white rounded-full hover:bg-blue-600 transition-colors shadow-sm"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

let DRUGS_PER_PAGE = 12;
const DEFAULT_PLACEHOLDER = "/assets/placeholder.png";
const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL;
const apiSecret:string = import.meta.env.VITE_PEPSECRET;
const MOBILE_BREAKPOINT = 768; // Typical breakpoint for mobile devices

function Home() {
  // All state variables and refs preserved from the original code
  const [drugsDisplayed, setDrugsDisplayed] = useState<Drug[]>([]);
  const [featuredDrugs, setFeaturedDrugs] = useState<Drug[]>([]);
  const [drugQueue, setDrugQueue] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentOffset, setCurrentOffset] = useState<number>(0);
  const [totalDrugCount, setTotalDrugCount] = useState<number>(0);

  const drugQueueRef = useRef<Drug[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [surveyOpen, setSurvey] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const abortControllersRef = useRef<AbortController[]>([]);
  const observer = useRef<IntersectionObserver | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  //Mobile specific stuff
  const [showCategoryDropdown, setShowCategoryDropdown] = useState<boolean>(false);

  // Check if screen is mobile
  useEffect(() => {
    // Function to check window width and update state
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
      if (window.innerWidth > MOBILE_BREAKPOINT){DRUGS_PER_PAGE = 8;} //reduced for mobile
    };

    // Initial check
    checkScreenWidth();

    // Add event listener for window resize
    window.addEventListener('resize', checkScreenWidth);

    // Cleanup event listener on component unmount
    return () => {
      window.removeEventListener('resize', checkScreenWidth);
    };
  }, []); // Empty dependency array means this runs once on mount and sets up the listener
  // Fetch categories - this can run simultaneously with drug fetching
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/drug_categories`, {
          headers: {
            'Authorization': `Bearer ${apiSecret}`,
          },
        });
        const data = await response.json();
        
        if (data.status === "success" && data.categories) {
          setCategories(data.categories);
        }
      } catch (err) {
        console.error("Error fetching categories:", err);
      }
    };
    
    fetchCategories();
  }, []);

  // Cancel all in-flight requests
  const cancelAllRequests = () => {
    abortControllersRef.current.forEach(controller => {
      try {
        controller.abort();
      } catch {
        // Ignore errors from aborting
      }
    });
    abortControllersRef.current = [];
  };

  // Load more drugs when scrolling in "Shop All" view
  const loadMoreDrugs = async () => {
    if (loading || !hasMore || selectedCategory !== "all") return;
    
    try {
      setLoading(true);
      const nextOffset = currentOffset + DRUGS_PER_PAGE;
      
      // Create a new AbortController for this batch
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      
      const response = await fetch(
        `${apiUrl}/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=${nextOffset}`,
        { 
          headers: {
            'Authorization': `Bearer ${apiSecret}`,
          },
          signal: controller.signal 
        }
      );
      const data = await response.json();

      if (data.status === "success" && data.drugs) {
        const newDrugs: Drug[] = [];

        for (let i = 0; i < data.drugs.length; i++) {
          const d = data.drugs[i] as Drug;
          
          try {
            // Create a new controller for each image request
            const imgController = new AbortController();
            abortControllersRef.current.push(imgController);
            
            const resImg = await fetch(
              `${apiUrl}/api/drug/${encodeURIComponent(d.id)}/random-image`,
              { 
                headers: {
                  'Authorization': `Bearer ${apiSecret}`,
                },
                signal: imgController.signal 
              }
            );
            const imgData = await resImg.json();

            if (imgData.status === "success" && imgData.random_vendor_image) {
              d.img = imgData.random_vendor_image;
            } else {
              d.img = DEFAULT_PLACEHOLDER;
            }
            
            newDrugs.push(d);
          } catch (err) {
            const error = err as Error;
            if (error.name !== 'AbortError') {
              console.error(`Error fetching image for ${d.name}:`, err);
            }
            d.img = DEFAULT_PLACEHOLDER;
            newDrugs.push(d);
          }
        }

        if (newDrugs.length > 0) {
          setDrugQueue(prevQueue => {
            const updatedQueue = [...prevQueue, ...newDrugs];
            const uniqueQueue = updatedQueue.filter((drug, index, self) =>
              index === self.findIndex(d => d.id === drug.id)
            );
            drugQueueRef.current = uniqueQueue;
            localStorage.setItem("drugs", JSON.stringify(uniqueQueue));
            return uniqueQueue;
          });
          
          setCurrentOffset(nextOffset);
          
          // If we got fewer drugs than expected, we've reached the end
          if (data.drugs.length < DRUGS_PER_PAGE || nextOffset >= totalDrugCount) {
            setHasMore(false);
          }
        } else {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (err) {
      const error = err as Error;
      if (error.name !== 'AbortError') {
        console.error("Error loading more drugs:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Initialize the intersection observer for infinite scrolling
  useEffect(() => {
    observer.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && selectedCategory === "all") {
          loadMoreDrugs();
        }
      },
      { threshold: 0.5 }
    );

    if (sentinelRef.current) {
      observer.current.observe(sentinelRef.current);
    }

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, [hasMore, loading, selectedCategory, currentOffset]);

  // Main data initialization
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setInitialLoading(true);
        
        // Get total drug count first
        const countRes = await fetch(`${apiUrl}/api/drugs/totalcount`, 
          {
            headers: {
              'Authorization': `Bearer ${apiSecret}`,
            },
          }
        );
        const countData = await countRes.json();
        const drugCount = Number(countData.total);
        setTotalDrugCount(drugCount);
        
        let storedDrugs: Drug[] = [];
        try {
          storedDrugs = JSON.parse(localStorage.getItem("drugs") || "[]");
        } catch (error) {
          console.error("Error parsing stored drugs:", error);
          storedDrugs = [];
        }
        
        // Check if we have cached drugs and if they're reasonably current
        if (storedDrugs.length > 0 && storedDrugs.length <= drugCount + 20 && storedDrugs.length >= drugCount - 20)
        {
          setDrugQueue(storedDrugs);
          setCurrentOffset(storedDrugs.length);
          setHasMore(storedDrugs.length < drugCount);
          setInitialLoading(false);
        } else {
          // Fetch initial batch of drugs
          const controller = new AbortController();
          abortControllersRef.current.push(controller);
          
          const response = await fetch(
            `${apiUrl}/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=0`,
            { 
              headers: {
                'Authorization': `Bearer ${apiSecret}`,
              },
              signal: controller.signal 
            }
          );
          const data = await response.json();

          if (data.status === "success" && data.drugs) {
            const newDrugs: Drug[] = [];

            for (let i = 0; i < data.drugs.length; i++) {
              const d = data.drugs[i] as Drug;
              
              try {
                const imgController = new AbortController();
                abortControllersRef.current.push(imgController);
                
                const resImg = await fetch(
                  `${apiUrl}/api/drug/${encodeURIComponent(d.id)}/random-image`,
                  { 
                    headers: {
                      'Authorization': `Bearer ${apiSecret}`,
                    },
                    signal: imgController.signal 
                  }
                );
                const imgData = await resImg.json();

                if (imgData.status === "success" && imgData.random_vendor_image) {
                  d.img = imgData.random_vendor_image;
                } else {
                  d.img = DEFAULT_PLACEHOLDER;
                }
                
                newDrugs.push(d);
              } catch (err) {
                const error = err as Error;
                if (error.name !== 'AbortError') {
                  console.error(`Error fetching image for ${d.name}:`, error);
                }
                d.img = DEFAULT_PLACEHOLDER;
                newDrugs.push(d);
              }
            }

            setDrugQueue(newDrugs);
            setCurrentOffset(DRUGS_PER_PAGE);
            setHasMore(true);
            drugQueueRef.current = newDrugs;
            localStorage.setItem("drugs", JSON.stringify(newDrugs));
            setInitialLoading(false);
          }
        }
      } catch (err) {
        const error = err as Error;
        if (error.name !== 'AbortError') {
          setError(error.toString());
        }
      } finally {
        setLoading(false);
      }
    };
    const checkPreferences = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const response = await fetch(
          `${apiUrl}/api/getUser?id=${encodeURIComponent(user.id)}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiSecret}`,
            },
          }
        );
        
        // (Optional) error handling
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Request failed (${response.status}): ${errText}`);
        }
        
        const preferences = await response.json();
        setUserId(user.id);
        if (!preferences.user_info.preferences){setSurvey(true);}
      }
    }

    const initialize = async () => {
      setInitialLoading(true);
      let drugCount = 0;
      let storedDrugs: Drug[] = [];
      try {
        storedDrugs = JSON.parse(localStorage.getItem("drugs") || "[]");
        const res = await fetch(`${apiUrl}/api/drugs/totalcount`,{
          headers: {
            'Authorization': `Bearer ${apiSecret}`,
          },
        });
        const data = await res.json();
        if (data) {
          drugCount = Number(data.total);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
      
      if (storedDrugs.length <= drugCount + 20 && storedDrugs.length >= drugCount - 20) {
        setDrugQueue(storedDrugs);
        setInitialLoading(false);
      } else {
        fetchInitialData();
      }
    };

    initialize();
    checkPreferences();
    return () => {
      cancelAllRequests();
    };
   
  }, []);

  // Update drugs display when drugQueue changes (maintain the original logic)
  useEffect(() => {
    setDrugsDisplayed(() => {
      // Start fresh each time to ensure proper order
      const allDrugs = [...drugQueue];
      
      // Remove duplicates
      const uniqueDrugs = [];
      const seenIds = new Set();
      
      for (const drug of allDrugs) {
        if (!seenIds.has(drug.id)) {
          uniqueDrugs.push(drug);
          seenIds.add(drug.id);
        }
      }
      
      return uniqueDrugs;
    });
    
    // Initialize featured drugs
    if (featuredDrugs.length === 0 && drugQueue.length > 0) {
      setFeaturedDrugs(drugQueue.slice(0, 20));
    }
    
    // Also update filtered drugs if we're in a category view
    if (selectedCategory !== "all") {
      filterDrugsByCategory(selectedCategory);
    } else {
      // In "Shop All" view, filtered drugs are the same as all drugs
      setFilteredDrugs(drugsDisplayed);
    }
  }, [drugQueue]);

  // Filter drugs by category when selection changes
  useEffect(() => {
    if (selectedCategory === "all") {
      setFilteredDrugs(drugsDisplayed);
    } else {
      filterDrugsByCategory(selectedCategory);
    }
  }, [selectedCategory, drugsDisplayed]);

  // Filter function to handle category selection
  const filterDrugsByCategory = (category: string) => {
    if (category === "all") {
      setFilteredDrugs(drugsDisplayed);
    } else {
      // Attempt to load category data for the drugs
      fetchDrugCategoryData(category);
    }
  };

  // Fetch category data for the selected drugs
  const fetchDrugCategoryData = async (category: string) => {
    // Cancel any existing requests first
    cancelAllRequests();
    
    // For now, we'll make a simplified approach where we query by category
    try {
      setLoading(true);
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      interface ApiResponse {
        status: string;
        drugs: Drug[];
      }
      const response = await fetch(
        `${apiUrl}/api/drugs/by_category?category=${encodeURIComponent(category)}`,
        { 
          headers: {
            'Authorization': `Bearer ${apiSecret}`,
          },
          signal: controller.signal 
        }
      );
      const data = (await response.json()) as ApiResponse;
      
      if (data.status === "success" && Array.isArray(data.drugs)) {
        // Create a filtered list based on the category drugs
        const categoryDrugIds = new Set(data.drugs.map(d => d.id));
        
        // Filter the existing displayed drugs to only include those in the category
        const filtered = drugsDisplayed.filter(drug => categoryDrugIds.has(drug.id));
        setFilteredDrugs(filtered);
      } else {
        // Fallback to empty array if no results
        setFilteredDrugs([]);
      }
    } catch (err) {
      const error = err as Error;
      if (error.name !== 'AbortError') {
        console.error(`Error fetching category data:`, error);
        // Fallback to empty results on error
        setFilteredDrugs([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle category selection
  const handleCategoryChange = (category: string) => {
    // Cancel any pending requests when changing categories
    cancelAllRequests();
    setSelectedCategory(category);

    setShowCategoryDropdown(false); //if on mobile
  };

  // Which drugs to display based on filtered or all
  const displayedDrugs = selectedCategory === "all" ? drugsDisplayed : filteredDrugs;
  const handleSurveySubmit = async (selected: string[]) => {
    console.log("User selected:", selected);

    const response = await fetch(`${apiUrl}/api/setPreferences`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: userId,
        preferences: selected,
      }),
    });
    
    // (Optional) error handling
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Request failed (${response.status}): ${errText}`);
    }
    
    const data = await response.json();
    console.log("Preferences updated successfully:", data);
  };
  
  // Add a useEffect to update filtered drugs when initialLoading changes
  useEffect(() => {
    if (!initialLoading && drugsDisplayed.length > 0) {
      if (selectedCategory === "all") {
        setFilteredDrugs(drugsDisplayed);
      } else {
        filterDrugsByCategory(selectedCategory);
      }
    }
  }, [initialLoading, drugsDisplayed]);
  
  if (!isMobile)
  {
    return (
      <ParallaxProvider>
        <div className="overflow-x-hidden bg-gray-50">
          {/* Fixed Search Bar */}
          <SearchBar />
          
          {/* Survey Modal */}
          <SurveyModal
            isOpen={surveyOpen}
            onClose={() => setSurvey(false)}
            onSubmit={handleSurveySubmit}
          />
          
          {/* Full-width banner */}
          <Parallax>
            <img
              src={banner}
              alt="banner"
              className="w-full h-auto object-cover pt-12"
            />
          </Parallax>
          
          {/* Banner text section - placed below the banner and centered with catalog */}
          <div className="bg-gradient-to-r from-[#3294b4]/10 to-transparent py-8">
            <div className="w-full max-w-screen-xl mx-auto px-4">
              <div className="max-w-2xl">
                <h1 className="text-gray-800 text-3xl md:text-5xl font-bold mb-6 tracking-tight leading-tight">
                  We do the research, so you don't have to.
                </h1>
                <p className="text-gray-600 text-lg max-w-xl">
                  Trusted vendor reports, detailed safety analysis, and verified product reviews — saving you time and ensuring your safety
                </p>
              </div>
            </div>
          </div>

          {error && drugsDisplayed.length === 0 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 my-6 mx-auto max-w-screen-xl">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-red-700">
                    Error: {error}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Centered container for sections with improved styling */}
          <div className="w-full max-w-screen-xl mx-auto px-4 py-8">
            
            {/* Category Navigation with improved styling */}
            <section className="mb-12">
              <div className="flex items-center mb-6">
                <div className="w-8 h-8 rounded-full bg-[#3294b4] flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-800">
                  Browse by Category
                </h2>
              </div>
              
              <div className="flex flex-wrap gap-3 mb-8">
                <button
                  onClick={() => handleCategoryChange("all")}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 shadow-sm ${
                    selectedCategory === "all"
                      ? "bg-[#3294b4] text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                  }`}
                >
                  Shop All
                </button>
                
                {categories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => handleCategoryChange(category.id)}
                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 shadow-sm ${
                      selectedCategory === category.id
                        ? "bg-[#3294b4] text-white"
                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </section>
            
            {/* Featured Drugs Section - only show in "all" view, with improved styling */}
            {selectedCategory === "all" && (
      <section className="mb-12">
        <div className="flex items-center mb-6">
          <div className="w-8 h-8 rounded-full bg-[#3294b4] flex items-center justify-center mr-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800">
            Featured Products
          </h2>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm p-4 overflow-hidden">
          <div className="overflow-x-auto pb-2">
            <div className="flex space-x-4 px-2">
              {featuredDrugs.slice(0, 8).map((drug) => (
                <div key={drug.id} className="flex-shrink-0 w-52">
                  <Item
                    name={drug.proper_name}
                    description=""
                    img={drug.img}
                    featured={true}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      )}

            {/* Catalog Section (Grid Layout) with improved styling */}
            <section className="mb-12">
              <div className="flex items-center mb-6">
                <div className="w-8 h-8 rounded-full bg-[#3294b4] flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4v12l-4-2-4 2V4M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {selectedCategory === "all" ? "Full Catalog" : 
                    categories.find(c => c.id === selectedCategory)?.name || "Category Products"}
                </h2>
              </div>
              
              {loading && displayedDrugs.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                  <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-[#3294b4] mx-auto"></div>
                  <p className="mt-6 text-gray-600">Loading products...</p>
                </div>
              ) : displayedDrugs.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p className="text-xl font-medium text-gray-700 mb-2">No products found</p>
                  <p className="text-gray-500">Try selecting a different category or check back later.</p>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {displayedDrugs.map((drug) => (
                      <Item
                        key={drug.id}
                        name={drug.proper_name}
                        description=""
                        img={drug.img}
                        featured={false}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Sentinel for infinite scrolling - only in "Shop All" view */}
          {hasMore && selectedCategory === "all" && <div ref={sentinelRef} className="h-20"></div>}
          
          {/* Loading indicator with improved styling */}
          {loading && hasMore && selectedCategory === "all" && (
            <div className="text-center py-8 mb-8">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[#3294b4] mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading more products...</p>
            </div>
          )}
        </div>
      </ParallaxProvider>
    );
  }
  if (isMobile)
  {
    return (
      <ParallaxProvider>
        {/* {initialLoading ? (
          <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50">
            <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#3294b4] mb-4"></div>
            <p className="text-gray-600 font-medium">Loading products...</p>
          </div>
        ) : ( */}
          <>
            {/* Fixed Search Bar */}
            <SearchBar />
      
            {/* Survey Modal */}
            <SurveyModal
              isOpen={surveyOpen}
              onClose={() => setSurvey(false)}
              onSubmit={handleSurveySubmit}
            />
            
            {/* Banner - smaller for mobile */}
            {/* <Parallax>
              <img
                src={mobileBanner}
                alt="banner"
                className="w-full h-screen object-cover pt-12"
              />
            </Parallax> */}
            
            {/* Banner text section - mobile optimized */}
            <div className="bg-gradient-to-r from-[#3294b4]/10 to-transparent py-4">
              <div className="w-full px-4 pt-20">
                <div>
                  <h1 className="text-gray-800 text-xl font-bold mb-2 tracking-tight leading-tight">
                    We do the research, so you don't have to.
                  </h1>
                  <p className="text-gray-600 text-sm">
                    Trusted vendor reports, detailed safety analysis, and verified product reviews — saving you time and ensuring your safety
                  </p>
                </div>
              </div>
            </div>
  
            {error && drugsDisplayed.length === 0 && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 my-4 mx-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-red-700 text-sm">
                      Error: {error}
                    </p>
                  </div>
                </div>
              </div>
            )}
  
            {/* Mobile container for all content */}
            <div className="w-full px-4 py-6">
              
              {/* Category Navigation - dropdown for mobile */}
              <section className="mb-8">
                <div className="flex items-center mb-4">
                  <div className="w-6 h-6 rounded-full bg-[#3294b4] flex items-center justify-center mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-800">
                    Browse by Category
                  </h2>
                </div>
                
                {/* Mobile dropdown for categories */}
                <div className="relative mb-6">
                  <button 
                    className="w-full bg-white border border-gray-300 rounded-lg px-4 py-3 text-left text-gray-700 flex justify-between items-center shadow-sm"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  >
                    <span>{selectedCategory === "all" ? "Shop All" : categories.find(c => c.id === selectedCategory)?.name || "Select Category"}</span>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`h-5 w-5 transition-transform ${showCategoryDropdown ? "transform rotate-180" : ""}`} 
                      viewBox="0 0 20 20" 
                      fill="currentColor"
                    >
                      <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  
                  {showCategoryDropdown && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      <button
                        onClick={() => handleCategoryChange("all")}
                        className={`w-full text-left px-4 py-2 text-sm ${selectedCategory === "all" ? "bg-[#3294b4]/10 text-[#3294b4] font-medium" : "text-gray-700 hover:bg-gray-100"}`}
                      >
                        Shop All
                      </button>
                      
                      {categories.map(category => (
                        <button
                          key={category.id}
                          onClick={() => handleCategoryChange(category.id)}
                          className={`w-full text-left px-4 py-2 text-sm ${selectedCategory === category.id ? "bg-[#3294b4]/10 text-[#3294b4] font-medium" : "text-gray-700 hover:bg-gray-100"}`}
                        >
                          {category.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </section>
              
              {/* Featured Drugs Section - mobile horizontal scroll */}
              {selectedCategory === "all" && (
                <section className="mb-8">
                  <div className="flex items-center mb-4">
                    <div className="w-6 h-6 rounded-full bg-[#3294b4] flex items-center justify-center mr-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">
                      Featured Products
                    </h2>
                  </div>
                  
                  <div className="bg-white rounded-lg shadow-sm p-3 overflow-hidden">
                    <div className="overflow-x-auto pb-1 -mx-3 px-3">
                      <div className="flex space-x-4">
                        {featuredDrugs.map((drug) => (
                          <div key={drug.id} className="flex-shrink-0 w-32">
                            <Item
                              name={drug.proper_name}
                              description=""
                              img={drug.img}
                              featured={true}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              )}
  
              {/* Catalog Section - mobile grid layout (2 columns) */}
              <section className="mb-8">
                <div className="flex items-center mb-4">
                  <div className="w-6 h-6 rounded-full bg-[#3294b4] flex items-center justify-center mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4v12l-4-2-4 2V4M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {selectedCategory === "all" ? "Full Catalog" : 
                      categories.find(c => c.id === selectedCategory)?.name || "Category Products"}
                  </h2>
                </div>
                
                {loading && displayedDrugs.length === 0 ? (
                  <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#3294b4] mx-auto"></div>
                    <p className="mt-4 text-gray-600 text-sm">Loading products...</p>
                  </div>
                ) : displayedDrugs.length === 0 ? (
                  <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="text-lg font-medium text-gray-700 mb-2">No products found</p>
                    <p className="text-gray-500 text-sm">Try selecting a different category or check back later.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow-sm p-4">
                    <div className="grid grid-cols-2 gap-4">
                      {displayedDrugs.map((drug) => (
                        <Item
                          key={drug.id}
                          name={drug.proper_name}
                          description=""
                          img={drug.img}
                          featured={false}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
  
            {/* Sentinel for infinite scrolling - only in "Shop All" view */}
            {hasMore && selectedCategory === "all" && <div ref={sentinelRef} className="h-16"></div>}
            
            {/* Loading indicator - mobile optimized */}
            {loading && hasMore && selectedCategory === "all" && (
              <div className="text-center py-6 mb-6">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#3294b4] mx-auto"></div>
                <p className="mt-3 text-gray-600 text-sm">Loading more products...</p>
              </div>
            )}
          </>
        {/* )} */}
      </ParallaxProvider>
    );
  }
}

export default Home;