import React, { useState, useEffect, useRef, useMemo } from "react";
import logo from "./assets/logo.png";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../supabaseClient";
import debounce from 'lodash/debounce';

interface Drug {
  id: number;
  name: string;
  proper_name: string;
  img?: string;
  similarity?: number;
}

interface AIUsageInfo {
  allowed: boolean;
  subscription_type: string;
  searches_used: number;
  searches_remaining: number | string;
  searches_limit?: number;
  message: string;
}

interface SearchBarProps {
  placeholder?: string;
}

interface SearchItem {
  query: string;
  results?: any;
}

const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = "Type here..." }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  
  // AI Search states
  const [useAISearch, setUseAISearch] = useState<boolean>(false);
  const [aiUsageInfo, setAIUsageInfo] = useState<AIUsageInfo | null>(null);
  const [canUseAISearch, setCanUseAISearch] = useState<boolean>(false);
  const [aiInfoTooltipOpen, setAIInfoTooltipOpen] = useState<boolean>(false);
  const [recentAISearches, setRecentAISearches] = useState<Array<SearchItem>>([]);
  const [loadingPermission, setLoadingPermission] = useState<boolean>(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownRefAccount = useRef<HTMLDivElement>(null);
  const aiTooltipRef = useRef<HTMLDivElement>(null);
  const searchCache = useRef<{[key: string]: Drug[]}>({});
  
  // Store previous route to detect navigation changes
  const prevPathRef = useRef<string>("");

  // Set query from URL params if on search page
  useEffect(() => {
    // Skip if we're still waiting for permission check
    if (loadingPermission) return;
    
    const currentPath = location.pathname;
    
    if (currentPath.startsWith('/search/')) {
      const searchQuery = decodeURIComponent(currentPath.replace('/search/', ''));
      setQuery(searchQuery);
      setUseAISearch(false);
    } else if (currentPath.startsWith('/ai-search/')) {
      const searchQuery = decodeURIComponent(currentPath.replace('/ai-search/', ''));
      setQuery(searchQuery);
      
      // Only set AI search mode if the user is allowed to use it
      if (canUseAISearch) {
        setUseAISearch(true);
      } else {
        // Only redirect if this is a new navigation, not on initial component mount
        if (prevPathRef.current && prevPathRef.current !== currentPath) {
          // Redirect to regular search if not allowed to use AI search
          navigate(`/search/${encodeURIComponent(searchQuery)}`);
        }
      }
    }
    
    // Update previous path
    prevPathRef.current = currentPath;
  }, [location.pathname, canUseAISearch, navigate, loadingPermission]);

  // Retrieve user from Supabase
  useEffect(() => {
    async function fetchUser() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      
      if (data.session?.user) {
        const user = data.session.user;
        setUserName(user.user_metadata.name);
        setUserEmail(user.email ?? null);
        setUserId(user.id);
        
        // If user is logged in, fetch AI usage info
        await fetchAIUsageInfo(user.id);
        await fetchRecentSearches(user.id);
      } else {
        setUserName(null);
        setUserEmail(null);
        setUserId(null);
        setSession(null);
        setAIUsageInfo(null);
        setCanUseAISearch(false);
        setRecentAISearches([]);
        
        // If user is on an AI search page but not logged in, redirect to regular search
        if (location.pathname.startsWith('/ai-search/')) {
          const searchQuery = decodeURIComponent(location.pathname.replace('/ai-search/', ''));
          navigate(`/search/${encodeURIComponent(searchQuery)}`);
        }
      }
    }
    
    fetchUser();
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUserName(session.user.user_metadata.name);
          setUserEmail(session.user.email ?? null);
          setUserId(session.user.id);
          setSession(session);
          
          // If user is logged in, fetch AI usage info
          fetchAIUsageInfo(session.user.id);
          fetchRecentSearches(session.user.id);
        } else {
          setUserName(null);
          setUserEmail(null);
          setUserId(null);
          setSession(null);
          setAIUsageInfo(null);
          setCanUseAISearch(false);
          setRecentAISearches([]);
        }
      }
    );
    
    return () => subscription.unsubscribe();
  }, [location.pathname, navigate]);

  // Setup event listeners for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
      if (
        dropdownRefAccount.current &&
        !dropdownRefAccount.current.contains(event.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
      if (
        aiTooltipRef.current &&
        !aiTooltipRef.current.contains(event.target as Node)
      ) {
        setAIInfoTooltipOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch AI usage info for the user
  const fetchAIUsageInfo = async (userId: string) => {
    if (!userId) return;
    
    setLoadingPermission(true);
    
    try {
      const accessToken = session?.access_token;
      
      const response = await fetch(`${apiUrl}/api/ai-search/check-usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ 
          user_id: userId,
          increment: false // Just check, don't increment
        }),
      });
      
      const data = await response.json();
      
      if (data.status === "success") {
        setAIUsageInfo(data);
        // Update the state to reflect if the user can use AI search
        setCanUseAISearch(data.allowed === true || data.subscription_type === "admin");
        
        // If current mode is AI search but user is not allowed, switch to regular
        // Only do this when the component first loads, not on every API call
        if (useAISearch && !data.allowed && !prevPathRef.current) {
          setUseAISearch(false);
          
          // If on an AI search path, redirect to regular search
          if (location.pathname.startsWith('/ai-search/')) {
            const searchQuery = decodeURIComponent(location.pathname.replace('/ai-search/', ''));
            navigate(`/search/${encodeURIComponent(searchQuery)}`);
          }
        }
      } else {
        console.error("Error fetching AI usage info:", data.message);
        setCanUseAISearch(false);
      }
    } catch (error) {
      console.error("Failed to fetch AI usage info:", error);
      setCanUseAISearch(false);
    } finally {
      setLoadingPermission(false);
    }
  };

const fetchRecentSearches = async (userId: string) => {
  if (!userId) return;
  
  try {
    const accessToken = session?.access_token;
    
    // console.log('[RECENT SEARCHES] Fetching recent searches for user', userId);
    
    const response = await fetch(`${apiUrl}/api/ai-search/recent?user_id=${userId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const data = await response.json();
    
    if (data.status === "success") {
      // Log which searches have stored results
      if (data.recent_searches && data.recent_searches.length > 0) {
        const searchesWithResults = data.recent_searches.filter((item: any) => 
          item.results && item.results.length > 0
        );
        
        // console.log('[RECENT SEARCHES] Searches with stored results:', 
        //   searchesWithResults.length, 
        //   searchesWithResults.map((item: any) => item.query)
        // );
        
        // Log the ones without stored results too
        const searchesWithoutResults = data.recent_searches.filter((item: any) => 
          !item.results || item.results.length === 0
        );
        
        if (searchesWithoutResults.length > 0) {
          // console.log('[RECENT SEARCHES] Searches without stored results:', 
          //   searchesWithoutResults.length,
          //   searchesWithoutResults.map((item: any) => item.query)
          // );
        }
      }
      
      setRecentAISearches(data.recent_searches || []);
    } else {
      console.error("Error fetching recent searches:", data.message);
      
      // Fall back to localStorage if API fails
      const storedSearches = JSON.parse(localStorage.getItem("recentAISearches") || "[]");
      setRecentAISearches(storedSearches.map((query: string) => ({ query })));
    }
  } catch (error) {
    console.error("Failed to fetch recent searches:", error);
    
    // Fall back to localStorage if API fails
    const storedSearches = JSON.parse(localStorage.getItem("recentAISearches") || "[]");
    setRecentAISearches(storedSearches.map((query: string) => ({ query })));
  }
};
  
  // Create a debounced search function
  const debouncedSearch = useMemo(() => {
    return debounce(async (searchQuery: string) => {
      if (searchQuery.trim() === "") {
        setFilteredDrugs([]);
        setIsLoading(false);
        return;
      }
      
      // Don't perform AI searches in the dropdown - only regular searches
      // AI searches will only happen when the form is submitted
      
      // Check cache first
      if (searchCache.current[searchQuery]) {
        setFilteredDrugs(searchCache.current[searchQuery]);
        setIsLoading(false);
        return;
      }
      
      try {
        const response = await fetch(`${apiUrl}/api/search/drugs?query=${encodeURIComponent(searchQuery)}&limit=10&threshold=0.6`);
        const data = await response.json();
        
        if (data.status === "success") {
          setFilteredDrugs(data.drugs);
          // Store in cache
          searchCache.current[searchQuery] = data.drugs;
        } else {
          console.error("Error in search:", data.message);
          setFilteredDrugs([]);
        }
      } catch (error) {
        console.error("API request failed:", error);
        setFilteredDrugs([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value.trim() === "") {
      setFilteredDrugs([]);
      setDropdownOpen(false);
    } else {
      // In AI search mode, we always want to show the recent searches
      // regardless of what the user types
      if (useAISearch) {
        // Show dropdown with recent searches when in AI mode
        // but don't filter the recent searches based on input
        setDropdownOpen(true);
      } else {
        // For regular search, perform live search as before
        setIsLoading(true);
        setDropdownOpen(true);
        debouncedSearch(value);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (query.trim() === "") return;
    
    setDropdownOpen(false);
    
    if (useAISearch) {
      // Double-check if user is allowed to use AI search before submitting
      if (!canUseAISearch) {
        // If not allowed, show tooltip and don't navigate
        setAIInfoTooltipOpen(true);
        return;
      }
      
      // Persist the AI search mode in localStorage to help with state persistence
      localStorage.setItem("searchMode", "ai");
      
      // Navigate to AI search page
      navigate(`/ai-search/${encodeURIComponent(query)}`);
      
      // We don't need to manually update recent searches anymore
      // The server will handle this when the AI search is performed
    } else {
      // Persist the search mode in localStorage
      localStorage.setItem("searchMode", "regular");
      
      // Regular search
      navigate(`/search/${encodeURIComponent(query)}`);
    }
  };

  const handleSuggestionClick = (drug: Drug) => {
    setQuery(drug.proper_name);
    setDropdownOpen(false);
    navigate(`/${encodeURIComponent(drug.proper_name)}`, { 
      state: { name: drug.proper_name, img: drug.img } 
    });
  };

// In the SearchBar component

const handleRecentAISearchClick = (searchItem: SearchItem | string) => {
  const searchQuery = typeof searchItem === 'string' ? searchItem : searchItem.query;
  setQuery(searchQuery);
  setDropdownOpen(false);
  
  // Only proceed if the user is allowed to use AI search
  if (canUseAISearch) {
    // Make sure useAISearch is true
    setUseAISearch(true);
    localStorage.setItem("searchMode", "ai");
    
    // Check if we have stored results for this query
    const hasStoredResults = typeof searchItem !== 'string' && 
                            searchItem.results && 
                            searchItem.results.length > 0;
    
    if (hasStoredResults) {
      // Log clear confirmation
      console.log('%c[STORED RESULTS DISPATCHED]', 
        'background: green; color: white; padding: 2px 5px; border-radius: 3px;', 
        `Using ${(searchItem as SearchItem).results.length} cached results for "${searchQuery}"`);
      
      // Create and dispatch a custom event with the stored results
      // This MUST happen BEFORE the navigation to prevent extra search
      const storedResultsEvent = new CustomEvent('storedSearchResults', {
        detail: {
          query: searchQuery,
          results: (searchItem as SearchItem).results
        }
      });
      
      window.dispatchEvent(storedResultsEvent);
      
      // Add visual indicator when in development
      if (process.env.NODE_ENV === 'development') {
        // Visual indicator for developers
        const indicator = document.createElement('div');
        indicator.style.position = 'fixed';
        indicator.style.bottom = '10px';
        indicator.style.left = '10px';
        indicator.style.backgroundColor = 'green';
        indicator.style.color = 'white';
        indicator.style.padding = '5px 10px';
        indicator.style.borderRadius = '5px';
        indicator.style.zIndex = '9999';
        indicator.style.fontSize = '12px';
        indicator.textContent = `➤ DISPATCHED ${(searchItem as SearchItem).results.length} STORED RESULTS`;
        document.body.appendChild(indicator);
        
        // Remove after 3 seconds
        setTimeout(() => {
          if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }, 3000);
      }
      
      // Short delay before navigation to ensure event is handled
      setTimeout(() => {
        // Navigate to AI search page with fromRecent parameter
        navigate(`/ai-search/${encodeURIComponent(searchQuery)}?fromRecent=true`);
      }, 50);
    } else {
      console.log('[RECENT SEARCH] No stored results for query:', searchQuery);
      // Normal navigation for searches without stored results
      navigate(`/ai-search/${encodeURIComponent(searchQuery)}?fromRecent=true`);
    }
  } else {
    setAIInfoTooltipOpen(true);
  }
};

const logRecentSearchesStatus = () => {
  console.log('[RECENT SEARCHES STATUS]', {
    total: recentAISearches.length,
    withResults: recentAISearches.filter(item => 
      typeof item !== 'string' && item.results && item.results.length > 0
    ).length,
    queries: recentAISearches.map(item => 
      typeof item === 'string' ? item : item.query
    )
  });
};


const toggleSearchMode = () => {
    // For admin accounts, the "canUseAISearch" should be true, but let's handle this case explicitly
    if (!useAISearch && !canUseAISearch && 
        !(aiUsageInfo?.subscription_type === "admin")) {
      setAIInfoTooltipOpen(true);
      return;
    }
    
    const newMode = !useAISearch;
    setUseAISearch(newMode);
    localStorage.setItem("searchMode", newMode ? "ai" : "regular");
    setDropdownOpen(false);
    
    // Instead of navigating, just update the URL without triggering a new search
    if (location.pathname.startsWith('/search/') && newMode) {
      const searchQuery = decodeURIComponent(location.pathname.replace('/search/', ''));
      window.history.pushState(null, '', `/ai-search/${encodeURIComponent(searchQuery)}`);
    } else if (location.pathname.startsWith('/ai-search/') && !newMode) {
      const searchQuery = decodeURIComponent(location.pathname.replace('/ai-search/', ''));
      window.history.pushState(null, '', `/search/${encodeURIComponent(searchQuery)}`);
    }
  };
    
  const highlightMatch = (text: string, searchQuery: string) => {
    if (!searchQuery) return text;
    
    // Create a case-insensitive pattern to match the query characters in sequence
    const normalizedText = text.toLowerCase();
    const normalizedQuery = searchQuery.toLowerCase();
    
    // Find the first occurrence of the query within the text
    const index = normalizedText.indexOf(normalizedQuery);
    
    if (index !== -1) {
      // If found, create parts for before, highlight, and after
      const before = text.substring(0, index);
      const match = text.substring(index, index + searchQuery.length);
      const after = text.substring(index + searchQuery.length);
      
      return (
        <>
          {before}
          <span className="font-bold text-blue-700">{match}</span>
          {after}
        </>
      );
    }
    
    // Try fuzzy matching if exact substring isn't found
    let result = [];
    let textIndex = 0;
    let queryIndex = 0;
    
    while (textIndex < text.length && queryIndex < normalizedQuery.length) {
      if (normalizedText[textIndex] === normalizedQuery[queryIndex]) {
        // Current character matches the search query
        result.push(
          <span key={textIndex} className="font-bold text-blue-700">
            {text[textIndex]}
          </span>
        );
        queryIndex++;
      } else {
        // No match, keep the original character
        result.push(text[textIndex]);
      }
      textIndex++;
    }
    
    // Add any remaining text
    while (textIndex < text.length) {
      result.push(text[textIndex]);
      textIndex++;
    }
    
    return <>{result}</>;
  };

  // Get the correct placeholder based on search mode
  const getPlaceholder = () => {
    if (useAISearch) {
      return "Ask anything... (e.g., 'weight loss')";
    }
    return placeholder;
  };

  // Show/hide the dropdown based on search mode and focus state
  const handleInputFocus = () => {
    if (useAISearch) {
      // In AI mode, always show recent searches on focus, regardless of query content
      setDropdownOpen(true);
    } else if (query.trim() !== "") {
      // In regular mode, only show dropdown if there's a query
      setDropdownOpen(true);
    }
  };

  // Check saved search mode when component mounts
  useEffect(() => {
    const savedMode = localStorage.getItem("searchMode");
    if (savedMode === "ai" && canUseAISearch) {
      setUseAISearch(true);
    } else {
      // Default to regular search if no preference or can't use AI search
      setUseAISearch(false);
    }
  }, [canUseAISearch]);
  
  // Ensure AI search mode persists after navigation
  useEffect(() => {
    // If we're on an AI search page, ensure AI search is enabled
    if (location.pathname.startsWith('/ai-search/') && canUseAISearch) {
      setUseAISearch(true);
      localStorage.setItem("searchMode", "ai");
    }
  }, [location.pathname, canUseAISearch]);

  return (
    <div className="fixed top-0 left-0 w-screen z-50 bg-[#F8F8F8] border-b border-gray-200">
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
        
        {/* Logo (left) */}
        <div className="flex-shrink-0">
          <img
            src={logo}
            alt="logo"
            className="h-8 w-0 sm:w-auto sm:h-16 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>

        {/* Search (center) */}
        <div className="flex-1 sm:px-4 px-1 justify-start">
          <div className="relative w-full max-w-md mx-auto">
            <form
              onSubmit={handleSubmit}
              className="w-full h-14 flex items-center bg-white shadow-md rounded-full px-4 border border-gray-300"
            >
              {/* Search Mode Toggle */}
              <div className="relative mr-2">
                <button
                  type="button"
                  onClick={toggleSearchMode}
                  className={`flex items-center px-3 py-1 rounded-full text-xs transition-colors ${
                    useAISearch
                      ? "bg-purple-500 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  } ${!canUseAISearch ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                  disabled={loadingPermission}
                >
                  {loadingPermission ? (
                    <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-purple-500 rounded-full animate-spin"></span>
                  ) : useAISearch ? (
                    <>
                      AI Search
                      <span className="ml-1 text-[10px] bg-yellow-400 text-purple-800 px-1 rounded-full">Beta</span>
                    </>
                  ) : (
                    "Regular"
                  )}
                </button>
                
                {/* AI Info Tooltip */}
                {aiInfoTooltipOpen && (
                  <div 
                    ref={aiTooltipRef}
                    className="absolute top-full mt-2 left-0 w-64 bg-white border border-gray-200 rounded-md shadow-lg p-3 z-50"
                  >
                    {!userId ? (
                      <div>
                        <p className="text-sm font-medium mb-2">Login Required</p>
                        <p className="text-xs text-gray-600">Please log in to use AI Search.</p>
                        <button 
                          onClick={() => navigate('/login')}
                          className="mt-2 text-xs bg-blue-500 text-white px-3 py-1 rounded-full"
                        >
                          Login
                        </button>
                      </div>
                    ) : !canUseAISearch ? (
                      <div>
                        <p className="text-sm font-medium mb-2">Subscription Required</p>
                        <p className="text-xs text-gray-600 mb-2">{aiUsageInfo?.message || "AI Search is only available for paid subscribers."}</p>
                        <button 
                          onClick={() => navigate('/profile')}
                          className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full"
                        >
                          Upgrade
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm font-medium mb-2">AI Search</p>
                        <p className="text-xs text-gray-600">
                          You have {aiUsageInfo?.searches_remaining} searches remaining this period.
                        </p>
                      </div>
                    )}
                    <button
                      className="absolute top-1 right-1 text-gray-400 hover:text-gray-600"
                      onClick={() => setAIInfoTooltipOpen(false)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
              
              <input
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                placeholder={getPlaceholder()}
                className="flex-1 bg-transparent text-gray-800 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full px-6 py-2"
                />
              
              {/* Search Info - shows remaining searches for AI mode */}
              {useAISearch && canUseAISearch && (
                <div 
                  className="mx-2 text-xs text-gray-500 cursor-pointer"
                  onClick={() => setAIInfoTooltipOpen(true)}
                >
                  {typeof aiUsageInfo?.searches_remaining === 'string' 
                    ? aiUsageInfo.searches_remaining
                    : `${aiUsageInfo?.searches_remaining}/${aiUsageInfo?.searches_limit}`}
                </div>
              )}
              
              <button 
                type="submit"
                className={`ml-2 text-gray-500 hover:text-blue-500 focus:outline-none ${
                  useAISearch && !canUseAISearch ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                disabled={useAISearch && !canUseAISearch}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              
              {isLoading && (
                <div className="mr-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                </div>
              )}
            </form>
            
            {dropdownOpen && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-b-md shadow-md z-60"
              >
                {useAISearch ? (
                  // AI Search Dropdown - show recent searches
                  recentAISearches.length > 0 ? (
                    <div>
                      <div className="p-2 text-xs text-gray-500 border-b">Recent AI Searches</div>
                      {recentAISearches.map((searchItem, index) => {
                        const searchQuery = typeof searchItem === 'string' ? searchItem : searchItem.query;
                        const hasResults = typeof searchItem !== 'string' && searchItem.results;
                        
                        return (
                          <div
                            key={index}
                            className="cursor-pointer flex items-center p-2 border-b last:border-0 hover:bg-gray-100"
                            onClick={() => handleRecentAISearchClick(searchItem)}
                          >
                            <div className="text-purple-500 mr-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                            </div>
                            <span>{searchQuery}</span>
                            {hasResults && (
                              <span className="ml-auto text-xs text-gray-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 text-center text-gray-500">
                      <p>Try AI-powered search for better results</p>
                      <p className="text-xs mt-1">Example: "weight loss" or "improve memory"</p>
                    </div>
                  )
                ) : (
                  // Regular Search Dropdown
                  isLoading ? (
                    <div className="p-3 text-center text-gray-500">Searching...</div>
                  ) : filteredDrugs.length > 0 ? (
                    filteredDrugs.map((drug) => (
                      <div
                        key={drug.id}
                        className="cursor-pointer flex items-center p-2 border-b last:border-0 hover:bg-gray-100"
                        onClick={() => handleSuggestionClick(drug)}
                      >
                        <img
                          src={drug.img || "/placeholder.png"}
                          alt={drug.proper_name}
                          className="w-10 h-10 object-cover rounded mr-2"
                        />
                        <span className="flex-1">
                          {highlightMatch(drug.proper_name, query)}
                        </span>
                        {drug.similarity && (
                          <span className={`text-xs ml-2 ${
                            drug.similarity >= 0.95 ? "text-green-600 font-semibold" : 
                            drug.similarity >= 0.8 ? "text-blue-600" : 
                            drug.similarity >= 0.7 ? "text-yellow-600" : 
                            "text-gray-500"
                          }`}>
                            {Math.round(drug.similarity * 100)}% match
                          </span>
                        )}
                      </div>
                    ))
                  ) : query.trim() !== "" && (
                    <div className="p-3 text-center text-gray-500">
                      No matches found for "{query}"
                      <div className="mt-1 text-sm">
                        <button 
                          onClick={handleSubmit}
                          className="text-blue-500 hover:underline"
                        >
                          Search for "{query}" anyway
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Account Info (right) */}
        <div
          className="relative flex-shrink-0"
          ref={dropdownRefAccount}
        >
          <div
            className="flex items-center text-xs sm:text-sm cursor-pointer pr-5"
            onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
          >
            <span className="font-medium">
              {userName || "Not Logged In"}
            </span>
            <span className="ml-1 text-gray-600">▼</span>
          </div>

          {accountDropdownOpen && (
            <div
              className="absolute right-0 top-full mt-1 w-28 bg-white border 
                         border-gray-300 rounded-md shadow-md py-1"
            >
              <div
                className="px-2 py-1 cursor-pointer hover:bg-gray-100 
                           text-center text-xs"
                onClick={() => navigate("/profile")}
              >
                Account
              </div>
              <div
                className="px-2 py-1 cursor-pointer hover:bg-gray-100 
                           text-center text-xs"
                onClick={() => navigate(userEmail ? "/logout" : "/login")}
              >
                {userEmail ? "Logout" : "Login"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;