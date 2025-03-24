import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import SearchBar from './SearchBar';
import { supabase } from '../supabaseClient';

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

interface StoredResultEvent extends CustomEvent {
  detail: {
    query: string;
    results: AISearchResult[];
  }
}

// Application state interface
interface AppState {
  results: AISearchResult[];
  loading: boolean;
  error: string | null;
  usageInfo: AIUsageInfo | null;
  isSearchBlocked: boolean;
  images: Record<number, string>;
  usingStoredResults: boolean;
  session: any;
}

// Define action types
type AppAction =
  | { type: 'SET_LOADING', payload: boolean }
  | { type: 'SET_ERROR', payload: string | null }
  | { type: 'SET_RESULTS', payload: AISearchResult[] }
  | { type: 'SET_USAGE_INFO', payload: AIUsageInfo | null }
  | { type: 'SET_SEARCH_BLOCKED', payload: boolean }
  | { type: 'SET_USING_STORED_RESULTS', payload: boolean }
  | { type: 'SET_SESSION', payload: any }
  | { type: 'SET_IMAGE', payload: { id: number, url: string } }
  | { type: 'CLEAR_IMAGES' }
  | { type: 'RESET_SEARCH_STATE' };

const DEFAULT_PLACEHOLDER = "/assets/placeholder.png";
const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

// Initial state
const initialState: AppState = {
  results: [],
  loading: true,
  error: null,
  usageInfo: null,
  isSearchBlocked: false,
  images: {},
  usingStoredResults: false,
  session: null
};

// Reducer function to handle all state updates
const reducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_RESULTS':
      return { ...state, results: action.payload };
    case 'SET_USAGE_INFO':
      return { ...state, usageInfo: action.payload };
    case 'SET_SEARCH_BLOCKED':
      return { ...state, isSearchBlocked: action.payload };
    case 'SET_USING_STORED_RESULTS':
      return { ...state, usingStoredResults: action.payload };
    case 'SET_SESSION':
      return { ...state, session: action.payload };
    case 'SET_IMAGE':
      return { 
        ...state, 
        images: { 
          ...state.images, 
          [action.payload.id]: action.payload.url 
        } 
      };
    case 'CLEAR_IMAGES':
      return { ...state, images: {} };
    case 'RESET_SEARCH_STATE':
      return { 
        ...state, 
        loading: true, 
        error: null, 
        results: [], 
        images: {},
        usingStoredResults: false
      };
    default:
      return state;
  }
};

function AISearchResults() {
  const { query } = useParams<{ query: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Use reducer for state management
  const [state, dispatch] = useReducer(reducer, initialState);
  const { results, loading, error, usageInfo, isSearchBlocked, images, usingStoredResults, session } = state;

  // Refs to track component lifecycle and prevent race conditions
  const isMountedRef = useRef<boolean>(true);
  const searchHasRunRef = useRef<boolean>(false);
  const imagesLoadedRef = useRef<Record<number, boolean>>({});
  const abortControllersRef = useRef<AbortController[]>([]);
  const eventListenerAddedRef = useRef<boolean>(false);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Safety mechanism to ensure loading state doesn't get stuck
  const ensureLoadingCompletes = useCallback(() => {
    // Clear any existing timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    // Set a new timeout that will force loading to false after 15 seconds
    loadingTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current && loading) {
        console.log('[SAFETY] Forcing loading state to false after timeout');
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }, 15000);
  }, [loading]);

  // Cancel all in-flight requests
  const cancelAllRequests = useCallback(() => {
    abortControllersRef.current.forEach(controller => {
      try {
        isMountedRef.current = false;
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        controller.abort();
      } catch (err) {
        // Ignore errors from aborting
      }
    });
    abortControllersRef.current = [];
  }, []);
  
  // Load session when component mounts
  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        dispatch({ type: 'SET_SESSION', payload: data.session });
      }
    }
    
    loadSession();
    
    // Set up safety timeout
    ensureLoadingCompletes();
    
    return () => {
      // Clear the timeout on unmount
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);
  
  // Log stored results usage
  const logStoredResultsUsage = useCallback((resultsCount: number) => {
    console.log('%c[STORED RESULTS CONFIRMED]', 'background: green; color: white; padding: 2px 5px; border-radius: 3px;', 
      `Using ${resultsCount} cached results instead of performing a new search for query: "${query}"`);
    
    // Also log to browser console table for easier viewing
    console.table({
      'Query': query,
      'Results Count': resultsCount,
      'Source': 'CACHED',
      'Timestamp': new Date().toISOString()
    });
  }, [query]);
  
  // Function to fetch images incrementally for results
  const fetchImages = useCallback(async (searchResults: AISearchResult[]) => {
    if (!searchResults.length || !isMountedRef.current) return;
    
    console.log('[IMAGE LOADING] Starting image fetch for', searchResults.length, 'results');
    
    // Delay function to avoid hammering the server
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Load a single image
    const loadImage = async (result: AISearchResult) => {
      if (!result.id || !isMountedRef.current) return;
      
      // Skip if we've already loaded this image in this session
      if (imagesLoadedRef.current[result.id]) {
        console.log(`[IMAGE LOADING] Already loaded image for ID: ${result.id}, skipping`);
        return;
      }
      
      try {
        // Create a new controller for this request
        const controller = new AbortController();
        abortControllersRef.current.push(controller);
        
        console.log(`[IMAGE LOADING] Fetching image for product ID: ${result.id}`);
        
        const imgResponse = await fetch(
          `${apiUrl}/api/drug/${encodeURIComponent(result.id)}/random-image`,
          { signal: controller.signal }
        );
        
        if (!imgResponse.ok) {
          throw new Error(`HTTP error! status: ${imgResponse.status}`);
        }
        
        const imgData = await imgResponse.json();
        
        if (!isMountedRef.current) return;
        
        if (imgData.status === 'success' && imgData.random_vendor_image) {
          const imageUrl = imgData.random_vendor_image;
          
          // Verify the URL looks valid
          if (typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
            console.error(`[IMAGE LOADING] Invalid image URL for ID ${result.id}:`, imageUrl);
            if (isMountedRef.current) {
              dispatch({ 
                type: 'SET_IMAGE', 
                payload: { id: result.id, url: DEFAULT_PLACEHOLDER } 
              });
            }
          } else {
            // Update the state with this image
            if (isMountedRef.current) {
              dispatch({ 
                type: 'SET_IMAGE', 
                payload: { id: result.id, url: imageUrl } 
              });
            }
          }
          
          // Mark this image as loaded
          imagesLoadedRef.current[result.id] = true;
        } else {
          console.log(`[IMAGE LOADING] No valid image data for ID: ${result.id}, using placeholder`);
          if (isMountedRef.current) {
            dispatch({ 
              type: 'SET_IMAGE', 
              payload: { id: result.id, url: DEFAULT_PLACEHOLDER } 
            });
          }
          imagesLoadedRef.current[result.id] = true;
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error(`[IMAGE LOADING] Error fetching image for ID ${result.id}:`, err);
          if (isMountedRef.current) {
            dispatch({ 
              type: 'SET_IMAGE', 
              payload: { id: result.id, url: DEFAULT_PLACEHOLDER } 
            });
          }
          imagesLoadedRef.current[result.id] = true;
        }
      }
    };
    
    // Load images with a slight delay between batches
    const loadImagesInBatches = async () => {
      // Group results into batches of 3
      const batchSize = 3;
      for (let i = 0; i < searchResults.length; i += batchSize) {
        const batch = searchResults.slice(i, i + batchSize);
        
        // Process this batch in parallel
        await Promise.all(batch.map(result => loadImage(result)));
        
        // Short delay between batches
        if (i + batchSize < searchResults.length) {
          await delay(150);
        }
      }
    };
    
    // Start the loading process
    loadImagesInBatches().catch(err => {
      console.error("[IMAGE LOADING] Error in batch loading:", err);
    });
  }, []);

  // Add a special event listener to preemptively catch search results
  useEffect(() => {
    if (!eventListenerAddedRef.current) {
      const handleStoredResultsPreemptive = (event: StoredResultEvent) => {
        if (event.detail && event.detail.results && isMountedRef.current) {
          console.log('%c[EVENT INTERCEPTED]', 'background: green; color: white; font-weight: bold; padding: 2px 5px;', 
            'Caught stored results event before search ran');
            
          // Mark search as already run to prevent duplicate
          searchHasRunRef.current = true;
          
          // Update state in a single batch
          if (isMountedRef.current) {
            dispatch({ type: 'CLEAR_IMAGES' });
            dispatch({ type: 'SET_RESULTS', payload: event.detail.results });
            dispatch({ type: 'SET_USING_STORED_RESULTS', payload: true });
            dispatch({ type: 'SET_LOADING', payload: false });
            
            // Add a small delay to ensure state is updated before image loading
            setTimeout(() => {
              if (isMountedRef.current) {
                fetchImages(event.detail.results);
              }
            }, 50);
          }
        }
      };
      
      window.addEventListener('storedSearchResults', handleStoredResultsPreemptive as EventListener);
      eventListenerAddedRef.current = true;
      
      return () => {
        window.removeEventListener('storedSearchResults', handleStoredResultsPreemptive as EventListener);
        eventListenerAddedRef.current = false;
      };
    }
  }, [fetchImages]);
  
  // Regular search function
  const performNormalSearch = useCallback(async (userId: string) => {
    console.log('%c[NEW SEARCH EXECUTED]', 'background: red; color: white; font-size: 14px; padding: 2px 5px; border-radius: 3px;',
      'Performing new AI search for: ' + query);
      
    // Set up safety timeout
    ensureLoadingCompletes();
      
    try {
      // Step 1: Check if the user can perform an AI search
      const controller = new AbortController();
      abortControllersRef.current.push(controller);
      
      const checkResponse = await fetch(`${apiUrl}/api/ai-search/check-usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          increment: false
        }),
        signal: controller.signal
      });
      
      const checkData = await checkResponse.json();
      
      if (isMountedRef.current) {
        dispatch({ type: 'SET_USAGE_INFO', payload: checkData });
      }
      
      if (!checkData.allowed && checkData.subscription_type !== "admin") {
        if (isMountedRef.current) {
          console.log("[NEW SEARCH] User not allowed to perform AI search", checkData.message);
          dispatch({ type: 'SET_ERROR', payload: checkData.message || "You don't have access to AI search." });
          dispatch({ type: 'SET_LOADING', payload: false });
          dispatch({ type: 'SET_SEARCH_BLOCKED', payload: true });
        }
        return;
      }
      
      // Step 2: Perform the AI search
      if (!query) return;
      
      console.log("[NEW SEARCH] Executing AI search API call");
      const searchController = new AbortController();
      abortControllersRef.current.push(searchController);
      
      try {
        const searchResponse = await fetch(`${apiUrl}/api/ai-search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            user_id: userId
          }),
          signal: searchController.signal
        });
        
        // Get the response text first
        const responseText = await searchResponse.text();
        // CRITICAL: Set loading to false immediately after getting any response
        if (isMountedRef.current && responseText) {
          dispatch({ type: 'SET_LOADING', payload: false });
          console.log('[CRITICAL] Loading state set to false after receiving response');
        }
        console.log("[NEW SEARCH] Raw response:", responseText);
        
        // Try to parse the JSON
        let searchData;
        try {
          searchData = JSON.parse(responseText);
        } catch (parseError) {
          console.error("[NEW SEARCH] JSON parse error:", parseError);
          if (isMountedRef.current) {
            dispatch({ type: 'SET_ERROR', payload: "Received invalid response from server. Please try again." });
          }
          return;
        }
        if (!isMountedRef.current) return;
        if (searchData && searchData.status === 'success') {
          // Check if recommendations exist and are an array
          if (searchData.recommendations && Array.isArray(searchData.recommendations)) {
            console.log("[NEW SEARCH] Found recommendations array:", searchData.recommendations.length);
            
            // Update state in a single batch
            if (isMountedRef.current) {
              console.log("howdy fourth");
              // Important: These are separate dispatches but React will batch them
              dispatch({ type: 'CLEAR_IMAGES' });
              dispatch({ type: 'SET_RESULTS', payload: searchData.recommendations });
              
              if (searchData.usage_info) {
                dispatch({ type: 'SET_USAGE_INFO', payload: searchData.usage_info });
              }
              
              // Start image loading with a small delay
              setTimeout(() => {
                if (isMountedRef.current) {
                  fetchImages(searchData.recommendations);
                }
              }, 50);
            }
          } else {
            console.error("[NEW SEARCH] Success response but no recommendations array found:", searchData);
            if (isMountedRef.current) {
              dispatch({ type: 'SET_ERROR', payload: "Server returned a success response but no results were found." });
            }
          }
        } else {
          console.error("[NEW SEARCH] Search failed:", searchData?.message || "Unknown error");
          if (isMountedRef.current) {
            dispatch({ type: 'SET_ERROR', payload: searchData?.message || "Failed to get AI search results." });
          }
        }
      } catch (searchErr: any) {
        console.error("[NEW SEARCH] Error during API call:", searchErr);
        if (isMountedRef.current) {
          dispatch({ type: 'SET_ERROR', payload: "Failed to get search results. Please try again." });
        }
      }
    } catch (err) {
      console.error("Error in search check:", err);
      if (isMountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: "An error occurred while performing the search." });
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
  }, [query, ensureLoadingCompletes, fetchImages]);
  
  // Check for fromRecent parameter and perform search
  useEffect(() => {
    const checkRecent = async () => {
      searchHasRunRef.current = false;
      isMountedRef.current = true;
      console.log("howyd");
      console.log(searchHasRunRef.current);
      console.log(query);
      console.log(isMountedRef.current);
      // First check if we've already detected a search result from the event handler
      if (searchHasRunRef.current || !query || !isMountedRef.current) {
        console.log('[SEARCH PREVENTED] Search already ran or no query or component unmounted');
        return;
      }
      
      // Mark search as having run to prevent duplicates
      searchHasRunRef.current = true;
      
      const queryParams = new URLSearchParams(location.search);
      const fromRecent = queryParams.get('fromRecent') === 'true';
      
      console.log(`[SEARCH CHECK] Starting for query: "${query}", fromRecent: ${fromRecent}`);
      
      // Set up safety timeout
      ensureLoadingCompletes();
      
      try {
        dispatch({ type: 'RESET_SEARCH_STATE' });
        
        // Get user from Supabase
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('[SEARCH CHECK] User not logged in, blocking search');
          if (isMountedRef.current) {
            dispatch({ type: 'SET_ERROR', payload: "You must be logged in to use AI search." });
            dispatch({ type: 'SET_LOADING', payload: false });
            dispatch({ type: 'SET_SEARCH_BLOCKED', payload: true });
          }
          return;
        }
        
        // If coming from recent search, check recent searches first
        if (fromRecent) {
          console.log('[SEARCH CHECK] Checking for recent search results in API');
          try {
            const response = await fetch(`${apiUrl}/api/ai-search/recent?user_id=${user.id}`);
            const data = await response.json();
            
            if (data.status === 'success' && data.recent_searches) {
              // Find matching search with results
              const matchingSearch = data.recent_searches.find((item: any) => 
                item.query === query && item.results && item.results.length > 0
              );
              
              if (matchingSearch && matchingSearch.results) {
                logStoredResultsUsage(matchingSearch.results.length);
                
                // Update state in a single batch
                if (isMountedRef.current) {
                  dispatch({ type: 'CLEAR_IMAGES' });
                  dispatch({ type: 'SET_RESULTS', payload: matchingSearch.results });
                  dispatch({ type: 'SET_USING_STORED_RESULTS', payload: true });
                  dispatch({ type: 'SET_LOADING', payload: false });
                  
                  // Clean up URL
                  setTimeout(() => {
                    if (isMountedRef.current) {
                      window.history.replaceState(
                        null, 
                        '', 
                        `/ai-search/${encodeURIComponent(query)}`
                      );
                    }
                  }, 500);
                  
                  // Start image fetching with a small delay
                  setTimeout(() => {
                    if (isMountedRef.current) {
                      fetchImages(matchingSearch.results);
                    }
                  }, 50);
                }
                
                // Most important: return early to prevent a new search
                return;
              }
            }
          } catch (err) {
            console.log("Error checking recent searches:", err);
            console.log("[SEARCH CHECK] Error checking recent searches, falling back to normal search");
          }
        }
        
        // Only if we have exhausted all options for finding stored results,
        // then we perform a normal search
        console.log('%c[NEW SEARCH REQUIRED]', 'background: red; color: white; padding: 2px 5px; border-radius: 3px;',
          'No stored results found, performing new search');
        await performNormalSearch(user.id);
        
      } catch (err) {
        console.error("Error in initial search check:", err);
        if (isMountedRef.current) {
          dispatch({ type: 'SET_ERROR', payload: "Failed to perform search. Please try again." });
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      }
    };
    
    checkRecent();
    
    // Clean up function to cancel all pending requests
    return () => {
      cancelAllRequests();
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, [query]);
 
  // Handle stored results events from SearchBar
  useEffect(() => {
    const handleStoredResults = (event: StoredResultEvent) => {
      if (event.detail && event.detail.results && isMountedRef.current) {
        logStoredResultsUsage(event.detail.results.length);
        
        // Update state in a single batch
        if (isMountedRef.current) {
          dispatch({ type: 'CLEAR_IMAGES' });
          dispatch({ type: 'SET_RESULTS', payload: event.detail.results });
          dispatch({ type: 'SET_USING_STORED_RESULTS', payload: true });
          dispatch({ type: 'SET_LOADING', payload: false });
          
          searchHasRunRef.current = true;
          
          // Delay image loading to ensure states are updated
          setTimeout(() => {
            if (isMountedRef.current) {
              fetchImages(event.detail.results);
            }
          }, 50);
        }
      }
    };
    
    window.addEventListener('storedSearchResults', handleStoredResults as EventListener);
    
    return () => {
      window.removeEventListener('storedSearchResults', handleStoredResults as EventListener);
    };
  }, [fetchImages, logStoredResultsUsage]);
  
  //Cleanup on unmount
  // useEffect(() => { //HERE
  //   return () => {
  //     //isMountedRef.current = false;
  //     cancelAllRequests();
  //     if (loadingTimeoutRef.current) {
  //       clearTimeout(loadingTimeoutRef.current);
  //     }
  //   };
  // }, [cancelAllRequests]);
  
  // Navigate to the product page
  const navigateToProduct = (productName: string) => {
    navigate(`/${encodeURIComponent(productName)}`);
  };
  
  // Debug component for development
  const DebugInfo = () => {
    if (process.env.NODE_ENV !== 'development') return null;
    
    return (
      <div className="fixed bottom-0 left-0 bg-black bg-opacity-70 text-white p-2 text-xs z-50">
        <div>Loading: {loading ? 'YES' : 'NO'}</div>
        <div>Results: {results.length}</div>
        <div>Error: {error ? 'YES' : 'NO'}</div>
        <div>Using Stored: {usingStoredResults ? 'YES' : 'NO'}</div>
        <button 
          onClick={() => {
            if (!query) return;
            searchHasRunRef.current = false;
            dispatch({ type: 'RESET_SEARCH_STATE' });
            setTimeout(() => {
              const checkRecent = async () => {
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    performNormalSearch(user.id);
                  } else {
                    dispatch({ type: 'SET_ERROR', payload: "User not logged in" });
                    dispatch({ type: 'SET_LOADING', payload: false });
                  }
                } catch (err) {
                  console.error("Error forcing search:", err);
                  dispatch({ type: 'SET_LOADING', payload: false });
                }
              };
              checkRecent();
            }, 100);
          }}
          className="mt-1 bg-red-500 text-white px-2 py-1 text-xs rounded"
        >
          Force New Search
        </button>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-gray-50">
      <SearchBar placeholder="Ask anything..." />
      
      <div className="pt-24 pb-10">
        <div className="w-full max-w-screen-xl mx-auto px-4">
          {/* Header with styling from listing page */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-800">
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
            
            {usingStoredResults && (
              <div className="mt-2 flex items-center bg-blue-50 border-l-4 border-blue-500 p-2 rounded text-blue-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Using previously generated results 
              </div>
            )}
          </div>
          
          {/* Introduction panel for better context */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-md">
            <h3 className="text-xl font-bold text-blue-800 mb-2">AI-Powered Search Results</h3>
            <p className="text-gray-700">
              Our AI has analyzed your query and found the most relevant compounds based on their 
              mechanisms of action, benefits, and scientific research. Each recommendation includes 
              a detailed explanation of why it matches your search criteria and is supported by 
              our database of peer-reviewed studies.
            </p>
          </div>
          
          {/* Loading State */}
          {loading && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white p-6 rounded-lg shadow-lg text-center max-w-md">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500 mx-auto"></div>
                <p className="mt-4 text-xl font-medium">Analyzing your question with AI...</p>
                <p className="mt-2 text-sm text-gray-600">Please don't close this page. This may take a moment.</p>
              </div>
            </div>
          )}
          
          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg mb-6 shadow-sm">
              <h3 className="font-bold text-red-800 mb-2">Unable to Complete Search</h3>
              <p className="text-red-700">{error}</p>
              
              {isSearchBlocked && (
                <button
                  onClick={() => navigate('/profile')}
                  className="mt-3 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors"
                >
                  Upgrade Subscription
                </button>
              )}
            </div>
          )}
          
          {/* Results - styled similar to the listing page */}
          {!loading && results.length > 0 && (
            <div className="space-y-6">
              {results.map((result, index) => (
                <div key={index} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
                  <div className="md:flex">
                    {/* Image */}
                    <div className="md:w-1/4 h-64 md:h-auto relative">
                      {/* Loading state indicator */}
                      {result.id && !images[result.id] && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                          <div className="animate-pulse flex space-x-2">
                            <div className="h-3 w-3 bg-blue-400 rounded-full"></div>
                            <div className="h-3 w-3 bg-blue-400 rounded-full"></div>
                            <div className="h-3 w-3 bg-blue-400 rounded-full"></div>
                          </div>
                        </div>
                      )}
                      
                      <img 
                        key={`img-${result.id || index}-${Date.now()}`} // Use index as fallback if no ID
                        src={result.id && images[result.id] ? images[result.id] : DEFAULT_PLACEHOLDER}
                        alt={result.proper_name}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => navigateToProduct(result.proper_name)}
                        onError={(e) => {
                          //console.log(`[IMAGE LOADING] Image error for ${result.proper_name}, using placeholder`);
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = DEFAULT_PLACEHOLDER;
                          
                          // Also update our images state to ensure consistent UI
                          if (result.id && isMountedRef.current) {
                            dispatch({ 
                              type: 'SET_IMAGE', 
                              payload: { id: result.id, url: DEFAULT_PLACEHOLDER } 
                            });
                          }
                        }}
                        style={{ display: 'block' }} // Ensure image is displayed
                      />
                      <div className="absolute top-2 left-2 bg-purple-100 rounded-full px-3 py-1 text-xs text-purple-800 font-medium">
                        AI Recommendation
                      </div>                    </div>
                    
                    {/* Content */}
                    <div className="p-6 md:w-3/4">
                      <h2 
                        className="text-2xl font-bold text-blue-700 hover:underline cursor-pointer"
                        onClick={() => navigateToProduct(result.proper_name)}
                      >
                        {result.proper_name}
                      </h2>
                      
                      <div className="mt-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Why it matches your query:</h3>
                        <p className="text-gray-700 bg-gray-50 p-3 rounded border-l-4 border-blue-300">{result.reason}</p>
                        
                        {result.what_it_does && (
                          <div className="mt-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-1">What it does:</h3>
                            <p className="text-gray-700">{result.what_it_does}</p>
                          </div>
                        )}
                        
                        {result.how_it_works && (
                          <div className="mt-4">
                            <h3 className="text-lg font-semibold text-gray-800 mb-1">How it works:</h3>
                            <p className="text-gray-700">{result.how_it_works}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="mt-6">
                        <button 
                          className="bg-blue-500 hover:bg-blue-700 text-white px-5 py-2 rounded-full transition-colors font-medium"
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
      
      {/* Debug component - only visible in development */}
      {process.env.NODE_ENV === 'development' && <DebugInfo />}
    </div>
  );
}

export default AISearchResults;