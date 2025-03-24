import { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import logo from "./assets/logo.png"; // Adjust the import path as needed

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
 subscriptionStatus: boolean;
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

// Info tooltips for each field
const fieldInfos = {
 contact: "Contact information for the vendor, including email, phone, or website. Essential for reaching out with questions about products, orders, or potential issues.",
 
 internal_coa: "Certificate of Analysis issued by the vendor's own laboratory. Should be taken with a grain of salt - internal COAs are only as trustworthy as the company itself. If you don't know the company well, internal COAs should not be considered definitive proof of quality.",
 
 external_coa: "Certificate of Analysis from an independent third-party laboratory. These are the most trustworthy verification of product quality and purity. External COAs provide unbiased confirmation of what's actually in the product.",
 
 external_coa_provider: "The name of the independent laboratory that conducted third-party testing. Reputable labs add credibility to test results. Some labs specialize in specific types of compounds or testing methods.",
 
 latest_batch_test_date: "The date when the most recent batch of products was tested. Important for seeing how frequently a vendor tests their products. Regular, recent testing indicates active quality control and freshness of inventory.",
 
 endotoxin_test: "Testing for bacterial endotoxins that can cause adverse reactions. Not commonly provided by vendors, but it's an excellent sign of superior quality control when available. Considered a significant plus.",
 
 sterility_test: "Verification that the product is free from contaminating microorganisms. Not standard practice among most vendors, but a strong positive indicator when offered. Shows exceptional commitment to product safety.",
 
 refund: "The vendor's policy on returns and refunds. These are not common in this industry given the nature of chemical products, and it's not necessarily a red flag if a vendor doesn't offer refunds. However, it's a nice bonus when available.",
 
 reimburse_test: "Whether the vendor will cover costs if you independently test their product and it fails quality checks. This is an important indicator of a vendor's confidence in their product quality and commitment to customer satisfaction.",
 
 comission: "We receive a commission on sales from these vendors. We maintain complete transparency about this relationship, and it does not influence our ratings or evaluations in any way. Our assessments remain objective despite these arrangements.",
 
 shipping: "Simple day range for expected delivery times. Helps with planning your order timeline.",
 
 region: "The geographic location where the vendor operates or ships from. Affects shipping times, customs considerations, and applicable regulations.",
 
 ai_rating: "A comprehensive assessment based on multiple data points, including testing practices, customer feedback, industry standing, and historical performance. Provides an objective overview of vendor quality.",
 
 ai_rating_number: "Overall quality score out of 10, calculated using weighted factors including testing rigor, transparency, customer satisfaction, and business practices. Higher scores indicate more reliable vendors with better quality control."
};

const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

// Component for info tooltip
const InfoTooltip = ({ field }: { field: string }) => {
 const info = fieldInfos[field as keyof typeof fieldInfos] || "Additional information about this field";
 
 return (
   <div className="group relative inline-block ml-1">
     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor">
       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
     </svg>
     <div className="opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity duration-300 absolute z-10 w-64 -translate-x-1/2 left-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 text-white text-xs rounded shadow-lg">
       {info}
       <div className="absolute left-1/2 top-full -translate-x-1/2 overflow-hidden w-4 h-2">
         <div className="h-4 w-4 bg-gray-800 -translate-y-1/2 rotate-45 transform origin-top-left"></div>
       </div>
     </div>
   </div>
 );
};

// ------------------- Vendor Details Panel Component -------------------
function VendorDetailsPanel({ vendorName, subscriptionStatus }: VendorDetailsPanelProps) {
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
           Overall Vendor Rating: {
             subscriptionStatus 
               ? `${detailsToShow.ai_rating_number}/10`
               : (
                 <span>
                   <span className="inline-block px-3 py-1 bg-gray-200 blur-sm select-none">X</span>
                   <span className="inline-block">/10</span>
                   <Link to="/subscription" className="ml-2 text-xs font-bold text-[#3294b4] underline">
                     Subscribe to view
                   </Link>
                 </span>
               )
           }
           <InfoTooltip field="ai_rating_number" />
         </span>
       )}
     </h2>
     
     {detailsToShow.ai_rating && (
       <div className="relative mb-4 p-4 bg-gray-50 rounded border">
         <h3 className="text-xl font-semibold mb-2">
           Rating Explanation
           <InfoTooltip field="ai_rating" />
         </h3>
         
         {subscriptionStatus ? (
           // Subscribed users see the actual content
           <p className="whitespace-pre-line">{detailsToShow.ai_rating}</p>
         ) : (
           // Non-subscribed users see the subscription prompt
           <Link
             to="/subscription"
             className="block relative p-6 bg-white text-center"
           >
             <img src={logo} alt="Logo" className="w-36 h-18 mx-auto mb-4" />
             <h3 className="text-xl font-bold text-[#3294b4] mb-2">Access Expert Vendor Analysis</h3>
             <p className="text-gray-700 mb-4 max-w-md mx-auto">
               Subscribe to view our detailed vendor quality assessment, including third-party testing verification and reputation analysis.
             </p>
             <button className="bg-[#3294b4] text-white px-6 py-2 rounded-full hover:bg-blue-600 transition-colors">
               Upgrade Now
             </button>
           </Link>
         )}
       </div>
     )}
     
     {subscriptionStatus ? (
       // Subscribed users see all vendor details
       <div className="space-y-3 text-lg">
         <p>
           <strong>Contact:</strong>
           <InfoTooltip field="contact" />
           {" "}{detailsToShow.contact || "N/A"}
         </p>
         <p>
           <strong>Internal COA:</strong>
           <InfoTooltip field="internal_coa" />
           {" "}{renderLink(detailsToShow.internal_coa, "Not provided")}
         </p>
         <p>
           <strong>External COA:</strong>
           <InfoTooltip field="external_coa" />
           {" "}{renderLink(detailsToShow.external_coa, "Not provided")}
         </p>
         <p>
           <strong>COA Provider:</strong>
           <InfoTooltip field="external_coa_provider" />
           {" "}{detailsToShow.external_coa_provider || "Not provided"}
         </p>
         <p>
           <strong>Latest Batch Test:</strong>
           <InfoTooltip field="latest_batch_test_date" />
           {" "}
           {detailsToShow.latest_batch_test_date
             ? new Date(detailsToShow.latest_batch_test_date).toLocaleDateString()
             : "N/A"}
         </p>
         <p>
           <strong>Endotoxin Test:</strong>
           <InfoTooltip field="endotoxin_test" />
           {" "}{detailsToShow.endotoxin_test || "Not provided"}
         </p>
         <p>
           <strong>Sterility Test:</strong>
           <InfoTooltip field="sterility_test" />
           {" "}{detailsToShow.sterility_test || "Not provided"}
         </p>
         <p>
           <strong>Refund Policy:</strong>
           <InfoTooltip field="refund" />
           {" "}
           {detailsToShow.refund !== null ? (detailsToShow.refund ? "Yes" : "No") : "N/A"}
         </p>
         <p>
           <strong>Reimbursement:</strong>
           <InfoTooltip field="reimburse_test" />
           {" "}{detailsToShow.reimburse_test || "Not provided"}
         </p>
         {detailsToShow.comission &&
           detailsToShow.comission.toLowerCase() === "true" && (
             <p>
               <strong>Commission:</strong>
               <InfoTooltip field="comission" />
               {" "}{detailsToShow.comission}
             </p>
           )}
         <p>
           <strong>Shipping:</strong>
           <InfoTooltip field="shipping" />
           {" "}{detailsToShow.shipping || "N/A"}
         </p>
         <p>
           <strong>Region:</strong>
           <InfoTooltip field="region" />
           {" "}{detailsToShow.region || "N/A"}
         </p>
       </div>
     ) : (
       // Non-subscribed users see only the section header, not additional text
       <div className="text-center p-4">
         {/* Removed duplicate subscription message */}
       </div>
     )}
   </div>
 );
}

export default VendorDetailsPanel;