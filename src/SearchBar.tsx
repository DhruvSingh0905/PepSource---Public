import React, { useState, useEffect, useRef } from "react";
import logo from "./assets/logo.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

interface Drug {
  id: number;
  name: string;
  proper_name: string;
  img?: string;
}

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = "Type here..." }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownRefAccount = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Periodically update local "allDrugs" from localStorage
    const interval = setInterval(() => {
      const storedDrugs = JSON.parse(localStorage.getItem("drugs") || "[]");
      setAllDrugs(storedDrugs);
    }, 5000);

    return () => clearInterval(interval);
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (!value.trim()) {
      setFilteredDrugs([]);
      setDropdownOpen(false);
    } else {
      const results = allDrugs.filter((drug) =>
        drug.proper_name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredDrugs(results);
      setDropdownOpen(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    navigate("/listing", { state: { name: query } });
  };

  const handleSuggestionClick = (drug: Drug) => {
    setQuery(drug.proper_name);
    setDropdownOpen(false);
    navigate("/listing", { state: { name: drug.proper_name } });
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
            className="h-8 w-auto sm:h-16 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>

        {/* Search (center) */}
        <div className="flex-1 px-4">
          <div className="relative w-full max-w-md mx-auto">
            <form
              onSubmit={handleSubmit}
              className="flex items-center bg-white shadow-md rounded-full px-4 border border-gray-300 h-12 sm:h-14"
            >
              <input
                type="text"
                value={query}
                onChange={handleInputChange}
                onFocus={() => {
                  if (query.trim() !== "") setDropdownOpen(true);
                }}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 
                           focus:outline-none focus:ring-2 focus:ring-blue-500 
                           rounded-full px-6 py-2"
              />
            </form>

            {dropdownOpen && filteredDrugs.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 w-full bg-white border 
                           border-gray-300 rounded-b-md shadow-md z-60"
              >
                {filteredDrugs.map((drug) => (
                  <div
                    key={drug.id}
                    className="cursor-pointer flex items-center p-2 
                               border-b last:border-0 hover:bg-gray-100"
                    onClick={() => handleSuggestionClick(drug)}
                  >
                    <img
                      src={drug.img || "/placeholder.png"}
                      alt={drug.proper_name}
                      className="w-10 h-10 object-cover rounded mr-2"
                    />
                    <span>{drug.proper_name}</span>
                  </div>
                ))}
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
            className="flex items-center text-xs sm:text-sm cursor-pointer"
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