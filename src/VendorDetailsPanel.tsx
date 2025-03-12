import { useState, useEffect } from "react";

// ------------------- Type Definitions -------------------
interface VendorDetails {
  vendor_id: number;
  name: string;
  internal_coa: string | null;
  external_coa: string | null;
  latest_batch_test_date: string | null;
  endotoxin_test: string | null;
  sterility_test: string | null;
  years_in_business: number | null;
  external_coa_provider: string | null;
  contact: string | null;
  refund: boolean | null;
  reimburse_test: string | null;
  comission: string | null;
  shipping: string | null;
  test_rating: number | null;
  pros_cons: string | null;
  region: string | null;
  small_order_rating: number | null;
  large_order_rating: number | null;
  ai_rating: string | null;
  ai_rating_number: number | null;
}

interface VendorDetailsPanelProps {
  vendorName: string;
}

// Helper: Render a value as a clickable link if it starts with "http"
function renderLink(value: string | null, fallback: string): JSX.Element | string {
  if (!value || value.trim() === "") {
    return fallback;
  }
  if (value.startsWith("http")) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
        {value}
      </a>
    );
  }
  return value;
}
const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

// ------------------- Vendor Details Panel Component -------------------
function VendorDetailsPanel({ vendorName }: VendorDetailsPanelProps) {
  const [vendorDetails, setVendorDetails] = useState<VendorDetails | null>(null);
  const [cachedVendorDetails, setCachedVendorDetails] = useState<VendorDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVendorDetails() {
      setLoading(true);
      try {
        console.log("Fetching vendor details for vendor name:", vendorName);
        const response = await fetch(`${apiUrl}/api/vendor_details?name=${encodeURIComponent(vendorName)}`);
        const responseText = await response.text();
        console.log("Complete API response:", responseText);
        const data = JSON.parse(responseText);
        if (data.status === "success" && data.vendor) {
          setVendorDetails(data.vendor);
          setCachedVendorDetails(data.vendor); // Update cache
          setError(null);
        } else {
          setError(data.message || "Vendor details not found.");
        }
      } catch (err) {
        console.error("Error fetching vendor details:", err);
        // Do not clear cached details if available.
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchVendorDetails();
  }, [vendorName]);

  // If still loading and no cached details exist, show loading message.
  if (loading && !cachedVendorDetails) return <p>Loading vendor details...</p>;
  // If an error occurred and no cached details exist, show the error.
  if (error && !cachedVendorDetails) return <p className="text-red-500">Error: {error}</p>;

  // Otherwise, use the most recent details (either freshly fetched or cached).
  const detailsToShow = vendorDetails || cachedVendorDetails;

  if (!detailsToShow) return <p>No vendor details available.</p>;

  return (
    <div className="border p-6 rounded shadow-lg bg-white text-left">
      <h2 className="text-2xl font-bold mb-4">
        Vendor Details{" "}
        {detailsToShow.ai_rating_number !== null && (
          <span className="text-xl text-green-600 ml-2">
            Overall Vendor Rating: {detailsToShow.ai_rating_number}/10
          </span>
        )}
      </h2>
      
      {/* AI Rating Explanation */}
      {detailsToShow.ai_rating && (
        <div className="mb-4 p-4 bg-gray-50 rounded border">
          <h3 className="text-xl font-semibold mb-2">Rating Explanation</h3>
          <p className="whitespace-pre-line">{detailsToShow.ai_rating}</p>
        </div>
      )}
      
      <div className="space-y-3 text-lg">
        <p><strong>Contact:</strong> {detailsToShow.contact || "N/A"}</p>
        <p><strong>Internal COA:</strong> {renderLink(detailsToShow.internal_coa, "Not provided")}</p>
        <p><strong>External COA:</strong> {renderLink(detailsToShow.external_coa, "Not provided")}</p>
        <p><strong>COA Provider:</strong> {detailsToShow.external_coa_provider || "Not provided"}</p>
        <p>
          <strong>Latest Batch Test:</strong>{" "}
          {detailsToShow.latest_batch_test_date
            ? new Date(detailsToShow.latest_batch_test_date).toLocaleDateString()
            : "N/A"}
        </p>
        <p><strong>Endotoxin Test:</strong> {detailsToShow.endotoxin_test || "Not provided"}</p>
        <p><strong>Sterility Test:</strong> {detailsToShow.sterility_test || "Not provided"}</p>
        <p>
          <strong>Refund Policy:</strong>{" "}
          {detailsToShow.refund !== null ? (detailsToShow.refund ? "Yes" : "No") : "N/A"}
        </p>
        <p><strong>Reimbursement:</strong> {detailsToShow.reimburse_test || "Not provided"}</p>
        {detailsToShow.comission &&
          detailsToShow.comission.toLowerCase() === "true" && (
            <p><strong>Commission:</strong> {detailsToShow.comission}</p>
          )}
        <p><strong>Shipping:</strong> {detailsToShow.shipping || "N/A"}</p>
        <p><strong>Region:</strong> {detailsToShow.region || "N/A"}</p>
      </div>
    </div>
  );
}

export default VendorDetailsPanel;