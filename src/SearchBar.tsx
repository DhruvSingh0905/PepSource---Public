import React, { useState, useEffect, useRef } from "react";
import logo from "./assets/logo.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

interface Drug {
  id: number;
  name: string;         // Matching field (lowercase)
  proper_name: string;  // Display field (capitalized)
  img?: string;         // Random vendor image
}

interface AiRecommendation {
  proper_name: string;
  reason: string;
}

interface SearchBarProps {
  placeholder?: string;
}

const normalizeSize = (size: string) =>
  size.trim().toLowerCase().replace(/\s/g, '');

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = "Type here..."}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<"manual" | "ai">("manual");
  const [isLoading, setIsLoading] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<AiRecommendation[]>([]);
  
  // Add debouncing for AI search
  const searchTimeoutRef = useRef<number | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownRefAccount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const storedDrugs = JSON.parse(localStorage.getItem("drugs") || "[]");
      setAllDrugs(storedDrugs);
    }, 5000); // Adjust interval time as needed (e.g., every 5 seconds)
  
    return () => clearInterval(interval); // Cleanup interval on component unmount
  }, []);

  useEffect(() => {
    // Retrieve user from Supabase auth
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? null);
      } else {
        setUserEmail(null);
      }
    }
    fetchUser();

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (
        dropdownRefAccount.current &&
        !dropdownRefAccount.current.contains(event.target as Node)
      ) {
        setAccountDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      // Clear any pending timeouts when component unmounts
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [allDrugs]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value.trim() === "") {
      setFilteredDrugs([]);
      setAiRecommendations([]);
      setDropdownOpen(false);
      
      // Clear any pending search
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    } else if (searchMode === "manual") {
      // Manual mode - filter drugs by name
      const results = allDrugs.filter((drug) =>
        drug.proper_name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredDrugs(results);
      setDropdownOpen(true);
    } else if (searchMode === "ai" && value.length > 2) {
      // AI mode - debounce to prevent too many API calls
      setIsLoading(true);
      setDropdownOpen(true);
      
      // Clear previous timeout
      if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
      }
      
      // Set a new timeout for the search
      searchTimeoutRef.current = window.setTimeout(() => {
        generateAiRecommendations(value);
      }, 500); // 500ms debounce time
    }
  };

  // This function will call the AI endpoint
  const generateAiRecommendations = async (searchQuery: string) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/ai-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery }),
      });
      
      const data = await response.json();
      
      if (data.status === "success") {
        setAiRecommendations(data.recommendations || []);
      } else {
        console.error("Error from AI search API:", data.message);
        setAiRecommendations([]);
      }
    } catch (error) {
      console.error('Error fetching AI recommendations:', error);
      
      // Fallback to simple keyword matching if the API fails
      const fallbackResults = allDrugs
        .filter(drug => drug.proper_name.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 5)
        .map(drug => ({
          proper_name: drug.proper_name,
          reason: `This may be relevant to your search for "${searchQuery}"`
        }));
      
      setAiRecommendations(fallbackResults);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    
    if (searchMode === "manual" || query.trim() === "") {
      // Manual mode - navigate directly
      navigate("/drug/" + encodeURIComponent(query), { state: { name: query } });
    } else if (aiRecommendations.length > 0) {
      // If there are AI recommendations, navigate to the first one
      navigate("/drug/" + encodeURIComponent(aiRecommendations[0].proper_name), { 
        state: { name: aiRecommendations[0].proper_name } 
      });
    } else {
      // Fallback to manual search if no AI recommendations
      navigate("/drug/" + encodeURIComponent(query), { state: { name: query } });
    }
  };

  const handleSuggestionClick = (drugName: string) => {
    setQuery(drugName);
    setDropdownOpen(false);
    navigate("/drug/" + encodeURIComponent(drugName), { state: { name: drugName } });
  };

  const toggleSearchMode = () => {
    setSearchMode(prevMode => prevMode === "manual" ? "ai" : "manual");
    // Clear previous results when switching modes
    setFilteredDrugs([]);
    setAiRecommendations([]);
    setDropdownOpen(false);
  };

  return (
    <div className="fixed top-0 w-full z-50">
      <div className="flex items-center justify-center pt-4 pb-4 border-b border-gray-200 bg-[#F8F8F8] px-4">
        <img
          src={logo}
          alt="logo"
          className="absolute left-4 w-36 h-auto object-contain rounded-md opacity-85 cursor-pointer"
          onClick={() => navigate("/")}
        />
        <div className="relative w-[500px]">
          <div className="flex items-center mb-2 justify-end">
            <div className="bg-gray-200 rounded-full p-1 flex items-center mr-2">
              <button
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  searchMode === "manual" 
                    ? "bg-white text-blue-600 shadow-sm" 
                    : "text-gray-600"
                }`}
                onClick={() => setSearchMode("manual")}
              >
                Manual
              </button>
              <button
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  searchMode === "ai" 
                    ? "bg-white text-blue-600 shadow-sm" 
                    : "text-gray-600"
                }`}
                onClick={() => setSearchMode("ai")}
              >
                AI Assist
              </button>
            </div>
          </div>
          
          <form
            onSubmit={handleSubmit}
            className="w-full h-14 flex items-center bg-white shadow-md rounded-full px-4 border border-gray-300"
          >
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => {
                if (query.trim() !== "") setDropdownOpen(true);
              }}
              placeholder={searchMode === "manual" 
                ? "Search by compound name..." 
                : "Describe what you're looking for..."}
              className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full px-6 py-2"
            />
            {searchMode === "ai" && isLoading && (
              <div className="mr-2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              </div>
            )}
          </form>
          
          {dropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-b-md shadow-md z-60 max-h-96 overflow-y-auto"
            >
              {isLoading && searchMode === "ai" && (
                <div className="p-4 text-center text-gray-500">
                  Analyzing your request...
                </div>
              )}
              
              {searchMode === "manual" && filteredDrugs.length > 0 && (
                filteredDrugs.map((drug) => (
                  <div
                    key={drug.id}
                    className="cursor-pointer flex items-center p-2 border-b last:border-0 hover:bg-gray-100"
                    onClick={() => handleSuggestionClick(drug.proper_name)}
                  >
                    <img
                      src={drug.img || "/placeholder.png"}
                      alt={drug.proper_name}
                      className="w-10 h-10 object-cover rounded mr-2"
                    />
                    <span>{drug.proper_name}</span>
                  </div>
                ))
              )}
              
              {searchMode === "ai" && aiRecommendations.length > 0 && (
                aiRecommendations.map((recommendation, index) => (
                  <div
                    key={index}
                    className="cursor-pointer p-3 border-b last:border-0 hover:bg-gray-50"
                    onClick={() => handleSuggestionClick(recommendation.proper_name)}
                  >
                    <div className="font-medium">{recommendation.proper_name}</div>
                    <div className="text-sm text-gray-600 mt-1">{recommendation.reason}</div>
                  </div>
                ))
              )}
              
              {((searchMode === "manual" && filteredDrugs.length === 0 && query.trim() !== "") ||
                (searchMode === "ai" && aiRecommendations.length === 0 && !isLoading && query.trim() !== "")) && (
                <div className="p-3 text-center text-gray-500">
                  No matches found for "{query}"
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="flex items-center relative" ref={dropdownRefAccount}>
          <div
            className="ml-4 flex items-center cursor-pointer"
            onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
          >
            <span className="text-xs font-medium">
              {userEmail || "Not Logged In"}
            </span>
            <span className="ml-1 text-xs text-gray-600">▼</span>
          </div>
          {accountDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-28 bg-white border border-gray-300 rounded-md shadow-md py-1">
              <div
                className="px-2 py-1 cursor-pointer hover:bg-gray-100 text-center text-xs"
                onClick={() => navigate("/profile")}
              >
                Account
              </div>
              <div
                className="px-2 py-1 cursor-pointer hover:bg-gray-100 text-center text-xs"
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