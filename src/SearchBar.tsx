import React, { useState, useEffect, useRef } from 'react';
import logo from './assets/logo.png';
import { useNavigate } from "react-router-dom";

interface Drug {
  id: number;
  name: string;
  proper_name: string;
  img?: string;
}

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = 'Type here...' }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);
  const [userProfile, setUserProfile] = useState<{ profilePicture: string | null, loggedIn: boolean }>({ profilePicture: null, loggedIn: false });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
                return { ...drug, img: randomData.status === "success" ? randomData.random_vendor_image : '' };
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

    fetch("http://127.0.0.1:8000/api/user/profile")
      .then(response => response.json())
      .then(data => setUserProfile({ profilePicture: data.profilePicture || null, loggedIn: data.loggedIn }))
      .catch(err => console.error("Error fetching user profile:", err));
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setFilteredDrugs(value.trim() === "" ? [] : allDrugs.filter(drug => drug.proper_name.toLowerCase().includes(value.toLowerCase())));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/listing", { state: { name: query } });
  };

  return (
    <div className="relative w-full">
      <div className="flex items-center justify-between pt-4 pb-4 border-b border-gray-200 sticky top-0 bg-[#F8F8F8] px-4 z-50">
        <img src={logo} alt="logo" className="w-24 h-auto object-contain rounded-md opacity-85 cursor-pointer" onClick={() => navigate("/")} />
        <div className="w-1/2 flex justify-center">
          <div className="relative w-[500px]">
            <form onSubmit={handleSubmit} className="w-full h-14 flex items-center bg-white shadow-md rounded-full px-4 border border-gray-300">
              <input
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full px-6 py-2"
              />
            </form>
          </div>
        </div>
        <div className="flex items-center relative" ref={dropdownRef}>
          <div className="ml-4 cursor-pointer" onClick={() => setDropdownOpen(!dropdownOpen)}>  
            <img
              src={userProfile.profilePicture || '/default-profile.png'}
              alt="User Profile"
              className="w-12 h-12 rounded-full border border-gray-300 shadow-md object-cover"
            />
          </div>
          {dropdownOpen && (
            <div className="absolute right-0 mt-14 w-40 bg-white border border-gray-300 rounded-md shadow-md py-2">
              <div className="px-4 py-2 cursor-pointer hover:bg-gray-100" onClick={() => navigate('/profile')}>Account</div>
              <div className="px-4 py-2 cursor-pointer hover:bg-gray-100" onClick={() => navigate(userProfile.loggedIn ? '/logout' : '/login')}>
                {userProfile.loggedIn ? 'Logout' : 'Login'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
