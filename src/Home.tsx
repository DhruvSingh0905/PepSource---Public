import { useState, useEffect, useRef } from 'react';
import SearchBar from './SearchBar';
import Item from './item'; // Correct casing
import { useLocation } from 'react-router-dom';
import banner from './assets/banner.png';
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';

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

const DRUGS_PER_PAGE = 12;
const DEFAULT_PLACEHOLDER = "/assets/placeholder.png";

function Home() {
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
  const abortControllersRef = useRef<AbortController[]>([]);
  const observer = useRef<IntersectionObserver | null>(null);

  // Fetch categories - this can run simultaneously with drug fetching
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/drug_categories');
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
      } catch (err) {
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
        `http://127.0.0.1:8000/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=${nextOffset}`,
        { signal: controller.signal }
      );
      const data = await response.json();

      if (data.status === "success" && data.drugs) {
        const newDrugs: Drug[] = [];

        for (let i = 0; i < data.drugs.length; i++) {
          let d = data.drugs[i] as Drug;
          
          try {
            // Create a new controller for each image request
            const imgController = new AbortController();
            abortControllersRef.current.push(imgController);
            
            const resImg = await fetch(
              `http://127.0.0.1:8000/api/drug/${encodeURIComponent(d.id)}/random-image`,
              { signal: imgController.signal }
            );
            const imgData = await resImg.json();

            if (imgData.status === "success" && imgData.random_vendor_image) {
              d.img = imgData.random_vendor_image;
            } else {
              d.img = DEFAULT_PLACEHOLDER;
            }
            
            newDrugs.push(d);
          } catch (err) {
            if (err.name !== 'AbortError') {
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
      if (err.name !== 'AbortError') {
        console.error("Error loading more drugs:", err);
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
        
        // Get total drug count first
        const countRes = await fetch(`http://127.0.0.1:8000/api/drugs/totalcount`);
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
        if (storedDrugs.length > 0 && 
            storedDrugs.length <= drugCount + 20 && 
            storedDrugs.length >= drugCount - 20) {
          setDrugQueue(storedDrugs);
          setCurrentOffset(storedDrugs.length);
          setHasMore(storedDrugs.length < drugCount);
        } else {
          // Fetch initial batch of drugs
          const controller = new AbortController();
          abortControllersRef.current.push(controller);
          
          const response = await fetch(
            `http://127.0.0.1:8000/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=0`,
            { signal: controller.signal }
          );
          const data = await response.json();

          if (data.status === "success" && data.drugs) {
            const newDrugs: Drug[] = [];

            for (let i = 0; i < data.drugs.length; i++) {
              let d = data.drugs[i] as Drug;
              
              try {
                const imgController = new AbortController();
                abortControllersRef.current.push(imgController);
                
                const resImg = await fetch(
                  `http://127.0.0.1:8000/api/drug/${encodeURIComponent(d.id)}/random-image`,
                  { signal: imgController.signal }
                );
                const imgData = await resImg.json();

                if (imgData.status === "success" && imgData.random_vendor_image) {
                  d.img = imgData.random_vendor_image;
                } else {
                  d.img = DEFAULT_PLACEHOLDER;
                }
                
                newDrugs.push(d);
              } catch (err) {
                if (err.name !== 'AbortError') {
                  console.error(`Error fetching image for ${d.name}:`, err);
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
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.toString());
        }
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
    
    // Clean up any pending requests when unmounting
    return () => {
      cancelAllRequests();
    };
  }, []);

  // Update drugs display when drugQueue changes (maintain the original logic)
  useEffect(() => {
    setDrugsDisplayed(prevState => {
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
      
      const response = await fetch(
        `http://127.0.0.1:8000/api/drugs/by_category?category=${encodeURIComponent(category)}`,
        { signal: controller.signal }
      );
      const data = await response.json();
      
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
      if (err.name !== 'AbortError') {
        console.error(`Error fetching category data:`, err);
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
  };

  // Which drugs to display based on filtered or all
  const displayedDrugs = selectedCategory === "all" ? drugsDisplayed : filteredDrugs;

  return (
    <div className="overflow-x-hidden">
      <ParallaxProvider>
        {/* Fixed Search Bar */}
        <SearchBar />

        {/* Full-width banner */}
        <Parallax>
          <img
            src={banner}
            alt="banner"
            className="w-full sm:w-screen sm:h-auto h-1/3 object-cover pt-12"
          />
        </Parallax>

        {error && drugsDisplayed.length === 0 && (
          <p className="text-center text-red-500">Error: {error}</p>
        )}

        {/* Centered container for sections */}
        <div className="w-full max-w-screen-xl mx-auto px-4">
          
          {/* Category Navigation */}
          <section className="my-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 text-left">
              Browse by Category
            </h2>
            <div className="flex flex-wrap gap-2 mb-6 overflow-x-auto pb-2">
              <button
                onClick={() => handleCategoryChange("all")}
                className={`border rounded-full px-4 py-2 text-sm transition-colors ${
                  selectedCategory === "all"
                    ? "bg-blue-500 text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100"
                }`}
              >
                Shop All
              </button>
              
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  className={`border rounded-full px-4 py-2 text-sm transition-colors ${
                    selectedCategory === category.id
                      ? "bg-blue-500 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </section>
          
          {/* Featured Drugs Section - only show in "all" view */}
          {selectedCategory === "all" && (
            <section className="my-8">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 text-left">
                Featured
              </h2>
              <div className="overflow-x-auto">
                <div className="flex space-x-14">
                  {featuredDrugs.map((drug) => (
                    <div key={drug.id} className="flex-shrink-0">
                      <Item
                        name={drug.proper_name}
                        description=""
                        img={drug.img}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Catalog Section (Grid Layout) */}
          <section className="my-8">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 text-left">
              {selectedCategory === "all" ? "Catalog" : 
                categories.find(c => c.id === selectedCategory)?.name || "Category"}
            </h2>
            
            {loading && displayedDrugs.length === 0 ? (
              <div className="text-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-4">Loading products...</p>
              </div>
            ) : displayedDrugs.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-500">No products found in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedDrugs.map((drug) => (
                  <Item
                    key={drug.id}
                    name={drug.proper_name}
                    description=""
                    img={drug.img}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Sentinel for infinite scrolling - only in "Shop All" view */}
        {hasMore && selectedCategory === "all" && <div ref={sentinelRef} className="h-20"></div>}
        {loading && hasMore && selectedCategory === "all" && (
          <div className="text-center py-4 mb-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2">Loading more products...</p>
          </div>
        )}
      </ParallaxProvider>
    </div>
  );
}

export default Home;
//Handle the categories - knock it down to 4-5 max