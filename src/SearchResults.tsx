import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SearchBar from './SearchBar';
import Item from './item';
import { ParallaxProvider } from 'react-scroll-parallax';

type Drug = {
  id: number;
  name: string;
  proper_name: string;
  img: string;
  alt_tag_1?: string;
  alt_tag_2?: string;
  similarity?: number;
};

const DEFAULT_PLACEHOLDER = "/assets/placeholder.png";
const RESULTS_PER_PAGE = 24; // Showing more results per page than the home page

function SearchResults() {
  const { query } = useParams(); // Get search query from URL parameter
  const location = useLocation();
  const navigate = useNavigate();
  const searchQuery = query || new URLSearchParams(location.search).get('q') || '';
  
  const [searchResults, setSearchResults] = useState<Drug[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [similarSearches, setSimilarSearches] = useState<string[]>([]);

  const abortControllersRef = useRef<AbortController[]>([]);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

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

  // Fetch search results
  const fetchSearchResults = async (query: string, page: number = 1) => {
    if (!query.trim()) {
      setLoading(false);
      setInitialLoading(false);
      setSearchResults([]);
      return;
    }

    try {
      if (page === 1) {
        setInitialLoading(true);
      }
      setLoading(true);
      setError(null); // Clear any previous errors
      
      // Cancel previous requests
      cancelAllRequests();

      const controller = new AbortController();
      abortControllersRef.current.push(controller);

      // Calculate offset based on page number
      const offset = (page - 1) * RESULTS_PER_PAGE;
      
      // Fetch search results
      const response = await fetch(
        `http://127.0.0.1:8000/api/search/drugs?query=${encodeURIComponent(query)}&limit=${RESULTS_PER_PAGE}&offset=${offset}&threshold=0.5`,
        { signal: controller.signal }
      );
      
      const data = await response.json();

      if (data.status === "success") {
        // Process results to include images
        const resultsWithImages = await Promise.all(
          data.drugs.map(async (drug: Drug) => {
            try {
              const imgController = new AbortController();
              abortControllersRef.current.push(imgController);
              
              const resImg = await fetch(
                `http://127.0.0.1:8000/api/drug/${encodeURIComponent(drug.id)}/random-image`,
                { signal: imgController.signal }
              );
              
              const imgData = await resImg.json();

              if (imgData.status === "success" && imgData.random_vendor_image) {
                drug.img = imgData.random_vendor_image;
              } else {
                drug.img = DEFAULT_PLACEHOLDER;
              }
            } catch (err) {
              const error = err as Error;
              if (error.name !== 'AbortError') {
                console.error(`Error fetching image for ${drug.name}:`, error);
              }
              drug.img = DEFAULT_PLACEHOLDER;
            }
            return drug;
          })
        );

        setSearchResults(page === 1 ? resultsWithImages : [...searchResults, ...resultsWithImages]);
        setTotalResults(data.total || resultsWithImages.length);
        setHasMore(resultsWithImages.length >= RESULTS_PER_PAGE && data.total > (offset + resultsWithImages.length));
        
        // Get similar searches if on first page and few results
        if (page === 1 && resultsWithImages.length < 5) {
          fetchSimilarSearches(query);
        }
      } else {
        // Only set error if not in initial loading state or if we're past the initial load
        if (!initialLoading || page > 1) {
          setError(data.message || "Error searching for products");
        }
        setSearchResults(page === 1 ? [] : searchResults);
      }
    } catch (err) {
      const error = err as Error;
      if (error.name !== 'AbortError') {
        console.error("Search request failed:", error);
        // Only set error if not in initial loading state or if we're past the initial load
        if (!initialLoading || page > 1) {
          setError("Failed to fetch search results. Please try again.");
        }
        setSearchResults(page === 1 ? [] : searchResults);
      }
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  // Fetch similar search terms
  const fetchSimilarSearches = async (query: string) => {
    try {
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      
      const response = await fetch(
        `http://127.0.0.1:8000/api/search/suggestions?query=${encodeURIComponent(query)}&limit=5`,
        { signal: controller.signal }
      );
      
      const data = await response.json();

      if (data.status === "success" && data.suggestions) {
        setSimilarSearches(data.suggestions.filter((suggestion: string) => 
          suggestion.toLowerCase() !== query.toLowerCase()
        ));
      }
    } catch (err) {
      const error = err as Error;
      if (error.name !== 'AbortError') {
        console.error("Failed to fetch search suggestions:", error);
      }
    }
  };

  // Load more results when clicking "Load More" button
  const loadMoreResults = () => {
    if (loading || !hasMore) return;
    setCurrentPage(prev => prev + 1);
  };

  // Search for a different query (used for similar search suggestions)
  const searchFor = (newQuery: string) => {
    navigate(`/search/${encodeURIComponent(newQuery)}`);
  };

  // Reset when search query changes
  useEffect(() => {
    setSearchResults([]);
    setCurrentPage(1);
    setSimilarSearches([]);
    // Set initial loading state immediately and clear any errors
    setInitialLoading(true);
    setError(null);
    
    // Small delay before fetch to ensure loading state is shown
    const timer = setTimeout(() => {
      fetchSearchResults(searchQuery, 1);
    }, 100);
    
    // Scroll to top when query changes
    window.scrollTo(0, 0);
    
    // Clean up requests when unmounting or changing query
    return () => {
      clearTimeout(timer);
      cancelAllRequests();
    };
  }, [searchQuery]);

  // Fetch additional pages when currentPage changes
  useEffect(() => {
    if (currentPage > 1) {
      fetchSearchResults(searchQuery, currentPage);
    }
  }, [currentPage]);

  return (
    <div className="min-h-screen bg-gray-50">
      <ParallaxProvider>
        {/* Fixed Search Bar */}
        <SearchBar placeholder="Search for products..." />

        <div className="pt-24 pb-10">
          {/* Centered container for content */}
          <div className="w-full max-w-screen-xl mx-auto px-4">
            {/* Search Results Header */}
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold">
                {searchQuery ? (
                  <>
                    Search results for <span className="text-blue-600">"{searchQuery}"</span>
                  </>
                ) : (
                  "Search products"
                )}
              </h1>
              
              {!initialLoading && (
                <p className="text-gray-600 mt-1">
                  {totalResults > 0 
                    ? `Found ${totalResults} ${totalResults === 1 ? 'product' : 'products'}`
                    : searchQuery 
                      ? 'No products found' 
                      : 'Enter a search term above'}
                </p>
              )}
            </div>

            {/* Initial Loading Indicator */}
            {initialLoading && (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-4 text-gray-600">Searching for products...</p>
              </div>
            )}

            {/* Error Message - Only show if not in any loading state and we have an error */}
            {error && !initialLoading && !loading && searchResults.length === 0 && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
                <p>{error}</p>
              </div>
            )}

            {/* Similar Searches */}
            {!initialLoading && similarSearches.length > 0 && searchResults.length < 5 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-2">Similar searches:</h2>
                <div className="flex flex-wrap gap-2">
                  {similarSearches.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => searchFor(suggestion)}
                      className="bg-white border border-gray-300 hover:bg-gray-50 px-3 py-1 rounded-full text-sm"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results Grid - Only show when not in initial loading state */}
            {!initialLoading && (
              <div ref={resultsContainerRef}>
                {searchResults.length === 0 && searchQuery ? (
                  <div className="text-center py-10 bg-white rounded-lg shadow-sm">
                    <p className="text-gray-500 mb-4">No products found matching "{searchQuery}"</p>
                    <p className="text-gray-600">Try a different search term or browse our categories</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {searchResults.map((drug) => (
                      <Item
                        key={`${drug.id}-${currentPage}`}
                        name={drug.proper_name}
                        description=""
                        img={drug.img}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Load More Button */}
            {hasMore && searchResults.length > 0 && !initialLoading && (
              <div className="mt-8 text-center">
                <button
                  onClick={loadMoreResults}
                  disabled={loading}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-2 rounded-full transition disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load More Results'}
                </button>
              </div>
            )}

            {/* Loading More Indicator - only show when loading more results, not during initial load */}
            {loading && searchResults.length > 0 && !initialLoading && (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading more results...</p>
              </div>
            )}
          </div>
        </div>
      </ParallaxProvider>
    </div>
  );
}

export default SearchResults;