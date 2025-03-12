import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SearchBar from './SearchBar';
import { supabase } from '../supabaseClient'; // Added import for supabase

interface AISearchResult {
  id?: number;
  proper_name: string;
  reason: string;
  what_it_does?: string;
  how_it_works?: string;
}

interface AIUsageInfo {
  allowed: boolean;
  subscription_type: string;
  searches_used: number;
  searches_remaining: number | string;
  searches_limit?: number;
  message: string;
}

interface CachedSearchData {
  results: AISearchResult[];
  timestamp: string;
  images: Record<number, string>;
}

interface CachedSearchesRecord {
  [key: string]: CachedSearchData;
}

interface ImageData {
  id: number;
  img: string;
}

const DEFAULT_PLACEHOLDER = "/assets/placeholder.png";

function AISearchResults() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();
  
  const [results, setResults] = useState<AISearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [usageInfo, setUsageInfo] = useState<AIUsageInfo | null>(null);
  const [isSearchBlocked, setIsSearchBlocked] = useState<boolean>(false);
  const [images, setImages] = useState<Record<number, string>>({});
  
  // For handling navigation blocking
  const blockRef = useRef<boolean>(true);
  
  // For caching results
  useEffect(() => {
    // Cache this search result if successful
    return () => {
      if (results.length > 0 && !error && query) {
        // Get current cached searches
        const cachedSearches: CachedSearchesRecord = JSON.parse(localStorage.getItem('aiSearchResultsCache') || '{}');
        
        // Add this search to cache
        cachedSearches[query] = {
          results,
          timestamp: new Date().toISOString(),
          images
        };
        
        // Keep only the most recent 2 searches
        const sortedQueries = Object.keys(cachedSearches).sort((a, b) => {
          return new Date(cachedSearches[b].timestamp).getTime() - 
                 new Date(cachedSearches[a].timestamp).getTime();
        });
        
        // If we have more than 2 searches, remove the oldest
        if (sortedQueries.length > 2) {
          const queriesToKeep = sortedQueries.slice(0, 2);
          const newCache: CachedSearchesRecord = {};
          queriesToKeep.forEach(q => {
            newCache[q] = cachedSearches[q];
          });
          localStorage.setItem('aiSearchResultsCache', JSON.stringify(newCache));
        } else {
          localStorage.setItem('aiSearchResultsCache', JSON.stringify(cachedSearches));
        }
        
        // Update recent AI searches for the search bar
        const recentSearches: string[] = JSON.parse(localStorage.getItem('recentAISearches') || '[]');
        const updatedRecentSearches = [query, ...recentSearches.filter(s => s !== query)].slice(0, 2);
        localStorage.setItem('recentAISearches', JSON.stringify(updatedRecentSearches));
      }
    };
  }, [results, error, query, images]);
  
  // Perform search function
  const performSearch = async () => {
    if (!query) return;
    
    try {
      setLoading(true);
      setError(null);
      setIsSearchBlocked(false);
      blockRef.current = true;
      
      // Get the user ID from Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in to use AI search.");
        setLoading(false);
        setIsSearchBlocked(true);
        blockRef.current = false;
        return;
      }
      
      // Step 1: Check if the user can perform an AI search
      const checkResponse = await fetch('http://127.0.0.1:8000/api/ai-search/check-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
          increment: false
        }),
      });
      
      const checkData = await checkResponse.json();
      setUsageInfo(checkData);
      
      if (!checkData.allowed) {
        setError(checkData.message || "You don't have access to AI search.");
        setLoading(false);
        setIsSearchBlocked(true);
        blockRef.current = false;
        return;
      }
      
      // Step 2: Perform the AI search
      const searchResponse = await fetch('http://127.0.0.1:8000/api/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          user_id: user.id
        }),
      });
      
      const searchData = await searchResponse.json();
      
      if (searchData.status === 'success') {
        setResults(searchData.recommendations || []);
        setUsageInfo(searchData.usage_info);
        
        // Fetch images for each result
        const imagePromises = (searchData.recommendations || []).map(async (result: AISearchResult) => {
          if (!result.id) return null;
          
          try {
            const imgResponse = await fetch(`http://127.0.0.1:8000/api/drug/${result.id}/random-image`);
            const imgData = await imgResponse.json();
            
            if (imgData.status === 'success' && imgData.random_vendor_image) {
              return { id: result.id, img: imgData.random_vendor_image };
            }
          } catch (err) {
            console.error('Error fetching image:', err);
          }
          return { id: result.id, img: DEFAULT_PLACEHOLDER };
        });
        
        const fetchedImages = await Promise.all(imagePromises);
        const imageMap: Record<number, string> = {};
        fetchedImages
          .filter((item): item is ImageData => item !== null)
          .forEach(item => {
            imageMap[item.id] = item.img;
          });
        
        setImages(imageMap);
      } else {
        setError(searchData.message || "Failed to get AI search results.");
      }
    } catch (err) {
      console.error("Error in AI search:", err);
      setError("An error occurred while performing the search.");
    } finally {
      setLoading(false);
      blockRef.current = false;
    }
  };
  
  // Check if this search is cached and set up navigation blocking
  useEffect(() => {
    if (!query) return;
    
    const cachedSearches: CachedSearchesRecord = JSON.parse(localStorage.getItem('aiSearchResultsCache') || '{}');
    if (cachedSearches[query]) {
      setResults(cachedSearches[query].results);
      setImages(cachedSearches[query].images || {});
      setLoading(false);
      blockRef.current = false;
    } else {
      performSearch();
    }
    
    // Set up navigation blocking
    const beforeUnloadHandler = (e: BeforeUnloadEvent) => {
      if (blockRef.current && loading) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [query]);
  
  // Navigate to the product page
  const navigateToProduct = (productName: string) => {
    navigate(`/${encodeURIComponent(productName)}`);
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <SearchBar placeholder="Ask anything..." />
      
      <div className="pt-24 pb-10">
        <div className="w-full max-w-screen-xl mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold">
              AI Results for <span className="text-purple-600">"{query}"</span>
            </h1>
            
            {usageInfo && (
              <p className="text-gray-600 mt-2">
                {usageInfo.subscription_type === 'paid' ? (
                  `You have ${usageInfo.searches_remaining} AI searches remaining this subscription period.`
                ) : usageInfo.subscription_type === 'admin' ? (
                  'You have unlimited AI searches.'
                ) : (
                  `You have used ${usageInfo.searches_used} of ${usageInfo.searches_limit} free AI searches.`
                )}
              </p>
            )}
          </div>
          
          {/* Loading State */}
          {loading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg text-center max-w-md">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mx-auto"></div>
                <p className="mt-4 text-lg">Analyzing your question with AI...</p>
                <p className="mt-2 text-sm text-gray-600">Please don't close this page. This may take a moment.</p>
              </div>
            </div>
          )}
          
          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg mb-6">
              <h3 className="font-bold mb-2">Unable to Complete Search</h3>
              <p>{error}</p>
              
              {isSearchBlocked && (
                <button
                  onClick={() => navigate('/profile')}
                  className="mt-3 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                >
                  Upgrade Subscription
                </button>
              )}
            </div>
          )}
          
          {/* Results */}
          {!loading && results.length > 0 && (
            <div className="space-y-8">
              {results.map((result, index) => (
                <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="md:flex">
                    {/* Image */}
                    <div className="md:w-1/4 h-64 md:h-auto relative">
                      <img 
                        src={result.id && images[result.id] ? images[result.id] : DEFAULT_PLACEHOLDER}
                        alt={result.proper_name}
                        className="w-full h-full object-cover"
                        onClick={() => navigateToProduct(result.proper_name)}
                      />
                      <div className="absolute top-2 left-2 bg-purple-100 rounded-full px-3 py-1 text-xs text-purple-800">
                        AI Recommendation
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6 md:w-3/4">
                      <h2 
                        className="text-xl font-bold text-blue-700 hover:underline cursor-pointer"
                        onClick={() => navigateToProduct(result.proper_name)}
                      >
                        {result.proper_name}
                      </h2>
                      
                      <div className="mt-3">
                        <h3 className="text-md font-semibold text-gray-700">Why it matches your query:</h3>
                        <p className="text-gray-600 mt-1">{result.reason}</p>
                        
                        {result.what_it_does && (
                          <div className="mt-4">
                            <h3 className="text-md font-semibold text-gray-700">What it does:</h3>
                            <p className="text-gray-600 mt-1">{result.what_it_does}</p>
                          </div>
                        )}
                        
                        {result.how_it_works && (
                          <div className="mt-4">
                            <h3 className="text-md font-semibold text-gray-700">How it works:</h3>
                            <p className="text-gray-600 mt-1">{result.how_it_works}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-6">
                        <button 
                          className="bg-blue-500 hover:bg-blue-700 text-white px-5 py-2 rounded-full transition-colors"
                          onClick={() => navigateToProduct(result.proper_name)}
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* No Results */}
          {!loading && results.length === 0 && !error && (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Results Found</h3>
              <p className="text-gray-500 mb-6">
                We couldn't find any compounds matching your query. Try being more specific or using different terms.
              </p>
              <button
                onClick={() => navigate('/')}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-full transition-colors"
              >
                Browse Categories
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AISearchResults;