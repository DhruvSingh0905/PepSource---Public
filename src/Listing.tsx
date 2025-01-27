import { useState } from 'react'
import SearchBar from './SearchBar';
import { useLocation } from "react-router-dom";

interface ItemProps {
    name: string;
    description: string;
    img: string;
}
function Listing() {
    const location = useLocation();
    const { name, description, img } = location.state || {}; // Extract passed data
    //TOOD: Use Hooks to pull data from server and display it as text through states
    
  return (
    <div>
        <div className="pl-[20px] pb-[20px]">
            <SearchBar />
        </div>
        <div className="flex justify-center w-full min-h-full">
            <div className="relative flex space-x-4 p-6 bg-white shadow-lg rounded-lg w-[1500px] h-screen">
            {/* Image */}
            <div>
                <img
                src={img}
                alt={name}
                className="w-[400px] h-[400px] object-cover rounded-lg"
                />
            </div>

            {/* Title and paragraph */}
            <div className="text-lg font-semibold text-gray-800">
                <h2 className="text-[50px] pt-2 pb-[20px]">{name}</h2>
                <p className="text-left max-h-[340px] overflow-y-auto">{description}</p>
            </div>

            {/* Recent News heading (positioned below the image, aligned left) */}
            <div className="absolute top-[450px] left-[10px]">
                <h2 className=" text-[35px] font-semibold text-gray-800">
                    Recent News
                </h2>
                <p className="pl-[3px]">News entered here</p>
            </div>

            </div>
        </div>
    </div>
    )
}

export default Listing
