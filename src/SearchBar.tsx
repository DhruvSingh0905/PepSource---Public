import React, { useState, useEffect, useRef, useMemo } from "react";
import logo from "./assets/logo.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import debounce from 'lodash/debounce';

interface Drug {
  id: number;
  name: string;
  proper_name: string;
  img?: string;
  similarity?: number;
}

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = "Type here..." }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownRefAccount = useRef<HTMLDivElement>(null);
  const searchCache = useRef<{[key: string]: Drug[]}>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const storedDrugs = JSON.parse(localStorage.getItem("drugs") || "[]");
      setAllDrugs(storedDrugs);
    }, 5000); // Adjust interval time as needed (e.g., every 5 seconds)
  
    return () => clearInterval(interval); // Cleanup interval on component unmount
  }, []);

  useEffect(() => {
    // Retrieve user from Supabase
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserName(user.user_metadata.name);
        setUserEmail(user.email ?? null);
      } else {
        setUserName(null);
        setUserEmail(null);
      }
    }
    fetchUser();

    // Close dropdowns if user clicks outside
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
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Create a debounced search function using useMemo to avoid ESLint warnings
  const debouncedSearch = useMemo(() => {
    return debounce(async (searchQuery: string) => {
      if (searchQuery.trim() === "") {
        setFilteredDrugs([]);
        setIsLoading(false);
        return;
      }
      
      // Check cache first
      if (searchCache.current[searchQuery]) {
        setFilteredDrugs(searchCache.current[searchQuery]);
        setIsLoading(false);
        return;
      }
      
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/search/drugs?query=${encodeURIComponent(searchQuery)}&limit=10&threshold=0.6`);
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
      setIsLoading(true);
      setDropdownOpen(true);
      debouncedSearch(value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    
    // If we have matches, navigate to the first one
    if (filteredDrugs.length > 0) {
      navigate(`/${encodeURIComponent(filteredDrugs[0].proper_name)}`, { 
        state: { name: filteredDrugs[0].proper_name } 
      });
    } else {
      // If no matches, still try to navigate with query
      navigate(`/${encodeURIComponent(query)}`, { 
        state: { name: query } 
      });
    }
  };

  const handleSuggestionClick = (drug: Drug) => {
    setQuery(drug.proper_name);
    setDropdownOpen(false);
    navigate(`/${encodeURIComponent(drug.proper_name)}`, { 
      state: { name: drug.proper_name, img: drug.img } 
    });
  };

  return (
    <div className="fixed top-0 left-0 w-screen z-50 bg-[#F8F8F8] border-b border-gray-200">
      {/* 
        max-w-screen-xl => keeps the bar from getting too wide on large screens
        mx-auto         => centers the bar horizontally
        flex + justify-between => stable 3-column layout
      */}
      <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
        
        {/* Logo (left) */}
        <div className="flex-shrink-0">
          <img
            src={logo}
            alt="logo"
            // h-8 on small screens, h-10 on bigger screens
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
              <input
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={() => {
                  if (query.trim() !== "") setDropdownOpen(true);
                }}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full px-6 py-2"
              />
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
                {isLoading ? (
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
                      <span className="flex-1">{drug.proper_name}</span>
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
                  </div>
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
            // text-xs on small screens, text-sm on bigger
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