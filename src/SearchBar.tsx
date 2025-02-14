import React, { useState, useEffect } from 'react';
import logo from './assets/logo.png';
import { useNavigate } from "react-router-dom";

interface Drug {
  id: number;
  name: string;         // Matching field (lowercase)
  proper_name: string;  // Display field (capitalized)
  img?: string;         // Random vendor image
}

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = 'Type here...' }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);

  // Fetch all drugs and update each with a random vendor image
  useEffect(() => {
    fetch("http://127.0.0.1:8000/api/drugs/names")
      .then(response => response.json())
      .then(async data => {
        if (data && data.drugs) {
          const drugs: Drug[] = data.drugs;
          // For each drug, fetch its random vendor image
          const drugsWithImages = await Promise.all(
            drugs.map(async (drug) => {
              try {
                const res = await fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(drug.name)}/random-image`);
                const randomData = await res.json();
                if (randomData.status === "success" && randomData.random_vendor_image) {
                  return { ...drug, img: randomData.random_vendor_image };
                } else {
                  return { ...drug, img: '' };
                }
              } catch (error) {
                console.error("Error fetching random image for", drug.name, error);
                return { ...drug, img: '' };
              }
            })
          );
          setAllDrugs(drugsWithImages);
        }
      })
      .catch(err => {
        console.error("Error fetching drugs for search suggestions:", err);
      });
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (value.trim() === "") {
      setFilteredDrugs([]);
    } else {
      // Filter suggestions using the properly capitalized name
      const results = allDrugs.filter(drug =>
        drug.proper_name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredDrugs(results);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Search query:', query);
    // Navigate to listing page with the query drug's proper name
    navigate("/listing", { state: { drugName: query } });
  };

  const handleSuggestionClick = (drug: Drug) => {
    // Navigate to listing page with the selected drug's proper name
    navigate("/listing", { state: { drugName: drug.proper_name } });
  };

  return (
    <div className="relative flex flex-col items-center">
      <div className="flex justify-center pt-2 pb-3 border-b border-gray-200 sticky top-0 bg-[#F8F8F8] items-center w-full">
        {/* Logo */}
        <img
          src={logo}
          alt="logo"
          className="absolute left-4 w-[10%] h-auto object-top rounded-md opacity-85 cursor-pointer"
          onClick={() => { navigate("/"); }}
        />
        {/* Search Bar */}
        <form
          onSubmit={handleSubmit}
          className="w-[1000px] h-14 flex items-center bg-white shadow-md rounded-full px-4 border border-gray-300"
        >
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full px-6 py-2"
          />
          <button
            type="submit"
            className="bg-[#6689A1] bg-opacity-80 hover:bg-blue-600 text-white rounded-full px-6 py-2 ml-2 transition-all"
          >
            Search
          </button>
        </form>
      </div>
      {/* Suggestions Dropdown */}
      {filteredDrugs.length > 0 && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-[1000px] bg-white border border-gray-300 rounded-b-md shadow-md z-10">
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
  );
};

export default SearchBar;