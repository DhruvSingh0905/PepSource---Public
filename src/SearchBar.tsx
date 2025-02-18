import React, { useState, useEffect, useRef } from 'react';
import logo from './assets/logo.png';
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

interface Drug {
  id: number;
  name: string;         // Matching field (lowercase)
  proper_name: string;  // Display field (capitalized)
  img?: string;         // Random vendor image
}

interface SearchBarProps {
  placeholder?: string;
}

const normalizeSize = (size: string) =>
  size.trim().toLowerCase().replace(/\s/g, '');

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = 'Type here...' }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownRefAccount = useRef<HTMLDivElement>(null);

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

    // Fetch drugs data
    fetch("http://127.0.0.1:8000/api/drugs/names")
      .then(response => response.json())
      .then(async data => {
        if (data && data.drugs) {
          const drugs: Drug[] = data.drugs;
          const drugsWithImages = await Promise.all(
            drugs.map(async (drug) => {
              try {
                const res = await fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(drug.name)}/random-image`);
                const randomData = await res.json();
                return { 
                  ...drug, 
                  img: randomData.status === "success" ? randomData.random_vendor_image : '' 
                };
              } catch (error) {
                console.error("Error fetching random image for", drug.name, error);
                return { ...drug, img: '' };
              }
            })
          );
          setAllDrugs(drugsWithImages);
        }
      })
      .catch(err => console.error("Error fetching drugs for search suggestions:", err));

    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (dropdownRefAccount.current && !dropdownRefAccount.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (value.trim() === "") {
      setFilteredDrugs([]);
      setDropdownOpen(false);
    } else {
      const results = allDrugs.filter(drug =>
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
    <div className="fixed top-0 w-full z-50">
    {/* Header: full-width container */}
    <div className="flex items-center justify-center pt-4 pb-4 border-b border-gray-200 bg-[#F8F8F8] px-4">
      {/* Logo at far left */}
      <img
        src={logo}
        alt="logo"
        className="absolute left-4 w-36 h-auto object-contain rounded-md opacity-85 cursor-pointer"
        onClick={() => navigate("/")}
      />
      {/* Search Bar Container (centered) */}
      <div className="relative w-[500px]">
        <form onSubmit={handleSubmit} className="w-full h-14 flex items-center bg-white shadow-md rounded-full px-4 border border-gray-300">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={() => { if(query.trim() !== "") setDropdownOpen(true); }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full px-6 py-2"
          />
        </form>
        {dropdownOpen && filteredDrugs.length > 0 && (
          <div ref={dropdownRef} className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-b-md shadow-md z-60">
            {filteredDrugs.map(drug => (
              <div
                key={drug.id}
                className="cursor-pointer flex items-center p-2 border-b last:border-0 hover:bg-gray-100"
                onClick={() => handleSuggestionClick(drug)}
              >
                <img
                  src={drug.img || '/placeholder.png'}
                  alt={drug.proper_name}
                  className="w-10 h-10 object-cover rounded mr-2"
                />
                <span>{drug.proper_name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Account Dropdown (display email with downward arrow) */}
      <div className="flex items-center relative" ref={dropdownRefAccount}>
          <div className="ml-4 flex items-center cursor-pointer" onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}>
            <span className="text-xs font-medium">
              {userEmail || "Not Logged In"}
            </span>
            <span className="ml-1 text-xs text-gray-600">▼</span>
          </div>
          {accountDropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-28 bg-white border border-gray-300 rounded-md shadow-md py-1">
              <div className="px-2 py-1 cursor-pointer hover:bg-gray-100 text-center text-xs" onClick={() => navigate('/profile')}>
                Account
              </div>
              <div className="px-2 py-1 cursor-pointer hover:bg-gray-100 text-center text-xs" onClick={() => navigate(userEmail ? '/logout' : '/login')}>
                {userEmail ? 'Logout' : 'Login'}
              </div>
            </div>
          )}
        </div>
    </div>
  </div>
  );
};

export default SearchBar;