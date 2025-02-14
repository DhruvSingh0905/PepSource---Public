import { useState, useEffect } from 'react';
import SearchBar from './SearchBar';
import { useLocation } from "react-router-dom";

interface Vendor {
  id: number;
  name: string;
  price: string;
  size: string;
  // other vendor fields as needed
}

interface DrugDetails {
  id: number;
  name: string;         // matching field in lowercase
  proper_name: string;  // properly capitalized name for display
  what_it_does: string;
  how_it_works: string;
}

function Listing() {
  const location = useLocation();
  // We expect the drug name and image to be passed from Home
  const { name: passedDrugName, img: passedImg } = location.state || {};
  
  const [drug, setDrug] = useState<DrugDetails | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!passedDrugName) {
      setError("No drug name provided.");
      setLoading(false);
      return;
    }
    // Fetch drug details and vendors using the passed drug name.
    fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(passedDrugName)}/vendors`)
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          setDrug(data.drug);
          setVendors(data.vendors);
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

  // Helper: Compute cost per mg
  const computeCostPerMg = (priceStr: string, sizeStr: string): number => {
    const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
    const size = parseFloat(sizeStr.replace(/[^0-9.]/g, '')) || 1; // avoid division by zero
    return price / size;
  };

  // Compute best vendor per unique vendor name (lowest cost per mg)
  const bestVendorMap: { [vendorName: string]: Vendor & { costPerMg: number } } = {};
  vendors.forEach(vendor => {
    const vName = vendor.name || "Unknown";
    const costPerMg = computeCostPerMg(vendor.price, vendor.size);
    if (!bestVendorMap[vName] || costPerMg < bestVendorMap[vName].costPerMg) {
      bestVendorMap[vName] = { ...vendor, costPerMg };
    }
  });
  const bestVendors = Object.values(bestVendorMap);

  return (
    <div>
      <div className="pl-[20px] pb-[20px]">
        <SearchBar />
      </div>
      {loading && <p className="text-center">Loading drug details...</p>}
      {error && <p className="text-center text-red-500">Error: {error}</p>}
      {drug && (
        <div className="flex justify-center w-full min-h-full">
          <div className="relative flex space-x-4 p-6 bg-white shadow-lg rounded-lg w-[1500px] h-screen">
            {/* Left: Image Section */}
            <div>
              <img
                src={passedImg}
                alt={drug.proper_name}
                className="w-[400px] h-[400px] object-cover rounded-lg"
              />
            </div>
  
            {/* Center: Drug Details */}
            <div className="text-lg font-semibold text-gray-800 flex-1">
              <h2 className="text-[50px] pt-2 pb-[20px]">{drug.proper_name}</h2>
              <p className="mb-4">
                <strong>What it does:</strong> {drug.what_it_does}
              </p>
              <p className="mb-4">
                <strong>How it works:</strong> {drug.how_it_works}
              </p>
            </div>
  
            {/* Right: Vendors List */}
            <div className="absolute top-[450px] right-[10px] w-[400px]">
              <h2 className="text-[35px] font-semibold text-gray-800 mb-2">Vendors</h2>
              {bestVendors.length > 0 ? (
                bestVendors.map(vendor => (
                  <div
                    key={vendor.id}
                    className="vendor-item border p-2 rounded flex items-center mb-2"
                  >
                    <div className="vendor-name flex-2">{vendor.name}</div>
                    <div className="vendor-price flex-1 text-center bg-gray-100 p-1 mx-1">
                      {vendor.price}
                    </div>
                    <div className="vendor-size flex-1 text-center bg-gray-100 p-1 mx-1">
                      {vendor.size}
                    </div>
                    <div className="vendor-price-mg flex-1 text-center bg-gray-100 p-1 mx-1">
                      $/mg {vendor.costPerMg.toFixed(2)}
                    </div>
                  </div>
                ))
              ) : (
                <p>No vendors found for this drug.</p>
              )}
            </div>
  
            {/* Bottom Left: Recent News Section */}
            <div className="absolute top-[450px] left-[10px]">
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