import React, { useState, useEffect } from 'react';
import logo from './assets/logo.png';
import { useNavigate } from "react-router-dom";

interface Drug {
  id: number;
  name: string;         // matching field (lowercase)
  proper_name: string;  // display field (properly capitalized)
  img?: string;         // random vendor image
}

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = 'Type here...' }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [allDrugs, setAllDrugs] = useState<Drug[]>([]);
  const [filteredDrugs, setFilteredDrugs] = useState<Drug[]>([]);

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
      const results = allDrugs.filter(drug =>
        drug.proper_name.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredDrugs(results);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("/listing", { state: { name: query } });
  };

  const handleSuggestionClick = (drug: Drug) => {
    navigate("/listing", { state: { name: drug.proper_name } });
  };

  return (
    <div className="relative w-full">
      {/* Header container */}
      <div className="flex items-center justify-between pt-4 pb-4 border-b border-gray-200 sticky top-0 bg-[#F8F8F8] px-4 z-50">
        {/* Logo on far left */}
        <div>
          <img
            src={logo}
            alt="logo"
            className="w-24 h-auto object-contain rounded-md opacity-85 cursor-pointer"
            onClick={() => navigate("/")}
          />
        </div>
        {/* Search bar container in right half */}
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
            {filteredDrugs.length > 0 && (
              <div className="absolute top-full left-0 w-full bg-white border border-gray-300 rounded-b-md shadow-md z-60">
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
        </div>
      </div>
    </div>
  );
};

export default SearchBar;