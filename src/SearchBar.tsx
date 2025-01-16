import React, { useState } from 'react';

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ placeholder = 'Search...' }) => {
    const [query, setQuery] = useState('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent) => { //TODO Make sure this works even if user presses enter key
        e.preventDefault();
        console.log('Search query:', query);
    };

    return (
        <div className="flex justify-center pt-[20px] border-b border-gray-200">
            <form
            onSubmit={handleSubmit}
            className="w-[1400px] flex items-center bg-white shadow-md rounded-full px-4 py-2 mx-auto border border-gray-300"
            >
            <input
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder={placeholder}
                className="flex-1 bg-transparent text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full px-6 py-4"
            />
            <button
                type="submit"
                className="bg-[#6689A1] bg-opacity-80 hover:bg-blue-600 text-white rounded-full px-6 py-4 ml-2 transition-all "
            >
                Search
            </button>
            </form>
        </div>
    );
};

export default SearchBar;