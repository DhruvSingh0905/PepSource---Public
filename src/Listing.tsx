import { useState, useEffect } from 'react';
import SearchBar from './SearchBar';
import { useLocation } from "react-router-dom";

interface Vendor {
  id: number;
  name: string;
  price: string;
  size: string;
  product_link: string;
  cloudinary_product_image: string;
}

interface DrugDetails {
  id: number;
  name: string;
  proper_name: string;
  what_it_does: string;
  how_it_works: string;
}

const normalizeSize = (size: string) => 
  size.trim().toLowerCase().replace(/\s/g, '');

function Listing() {
  const location = useLocation();
  const { name: passedDrugName, description, img: passedImg } = location.state || {};

  const [drug, setDrug] = useState<DrugDetails | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedSize, setSelectedSize] = useState<string>("Best Price");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch drug data
  useEffect(() => {
    if (!passedDrugName) {
      setError("No drug name provided.");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(passedDrugName)}/vendors`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setDrug(data.drug);
          setVendors(data.vendors);
          setSelectedSize("Best Price");
        } else {
          setError(data.message || "Error fetching drug details.");
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.toString());
        setLoading(false);
      });
  }, [passedDrugName]);

  // Automatically select first vendor when vendors or size changes
  useEffect(() => {
    const filtered = selectedSize === "Best Price" 
      ? vendors 
      : vendors.filter(v => normalizeSize(v.size) === selectedSize);
    
    setSelectedVendor(filtered[0] || null);
  }, [vendors, selectedSize]);

  // Get unique size options
  const sizeOptions = Array.from(new Set(vendors.map(v => normalizeSize(v.size))));
  sizeOptions.sort((a, b) => parseFloat(a) - parseFloat(b));
  const allSizeOptions = ["Best Price", ...sizeOptions];

  return (
    <div>
      <div className="pl-[20px] pb-[20px]">
        <SearchBar />
      </div>
      {loading && <p className="text-center">Loading drug details...</p>}
      {error && <p className="text-center text-red-500">Error: {error}</p>}
      {drug && (
        <div className="flex justify-center w-full min-h-full">
          <div className="relative flex bg-white shadow-lg rounded-lg w-[1500px] h-screen">
            {/* Image Section */}
            <div className="w-[400px] p-6">
              <img
                src={selectedVendor?.cloudinary_product_image || passedImg}
                alt={drug.proper_name}
                className="w-full h-[400px] object-contain rounded-lg"
              />
            </div>

            {/* Details Section */}
            <div className="flex-1 p-6 flex flex-col space-y-6">
              {/* Drug Info */}
              <div>
                <h2 className="text-[50px] font-semibold pb-[20px]">{drug.proper_name}</h2>
                <p className="mb-4"><strong>What it does:</strong> {drug.what_it_does}</p>
                <p className="mb-4"><strong>How it works:</strong> {drug.how_it_works}</p>
                {description && <p className="mb-4 max-h-[200px] overflow-y-auto">{description}</p>}
              </div>

              {/* Size Selector */}
              <div>
                <h3 className="text-xl font-semibold mb-2">Sizes</h3>
                <div className="flex gap-2 mb-4">
                  {allSizeOptions.map(option => (
                    <button
                      key={option}
                      onClick={() => setSelectedSize(option)}
                      className={`border rounded px-3 py-1 text-sm transition-colors ${
                        selectedSize === option
                          ? "bg-blue-500 text-white"
                          : "bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vendors List */}
              <div className="flex-1 overflow-y-auto">
                <h3 className="text-xl font-semibold mb-2">Vendors</h3>
                <div className="flex flex-col gap-2">
                  {vendors.length > 0 ? (
                    vendors
                      .filter(v => selectedSize === "Best Price" 
                        ? true 
                        : normalizeSize(v.size) === selectedSize
                      )
                      .map(vendor => (
                        <div
                          key={vendor.id}
                          onClick={() => setSelectedVendor(vendor)}
                          className="cursor-pointer border p-2 rounded flex items-center hover:bg-gray-100"
                        >
                          <div className="flex-1">{vendor.name}</div>
                          <div className="flex-1 text-center bg-gray-100 p-1 mx-1">
                            {vendor.price}
                          </div>
                          <div className="flex-1 text-center bg-gray-100 p-1 mx-1">
                            {normalizeSize(vendor.size)}
                          </div>
                        </div>
                      ))
                  ) : (
                    <p>No vendors found for this drug.</p>
                  )}
                </div>
              </div>

              {/* Selected Vendor Info */}
              {selectedVendor && (
                <div className="mt-4 border p-4 rounded">
                  <p className="text-lg">
                    Price: <span className="font-bold">{selectedVendor.price}</span>
                  </p>
                  <a
                    href={selectedVendor.product_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Go to Item
                  </a>
                </div>
              )}
            </div>

            {/* News Section */}
            <div className="absolute bottom-4 left-4">
              <h2 className="text-[35px] font-semibold text-gray-800">Recent News</h2>
              <p className="pl-[3px]">News entered here</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Listing;