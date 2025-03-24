import { useState, useEffect } from "react";
import { supabase } from "../../supabaseClient";

function Logout() {
  const [showConfirmation, setShowConfirmation] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error during sign out:", error);
      } else {
        console.log("Sign out successful.");
      }
    } catch (err) {
      console.error("Unexpected error during sign out:", err);
    }
    
    // Remove user data stored locally.
    localStorage.removeItem("email");
    localStorage.removeItem("name");
    // Optionally clear all local storage if you're not storing anything else.
    // localStorage.clear();
    
    // Force a full page reload to ensure state is fully reset.
    window.location.href = "/";
  };

  const handleCancel = () => {
    // Redirect back to the previous page or home
    window.history.back();
    // If there's no previous page in history, redirect to home
    setTimeout(() => {
      if (window.location.pathname === "/logout") {
        window.location.href = "/";
      }
    }, 100);
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      {showConfirmation ? (
        <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
          <h2 className="text-xl font-semibold mb-4">Confirm Logout</h2>
          
          <p className="text-gray-600 mb-6">
            Are you sure you want to log out of your account?
          </p>
          
          <div className="flex space-x-4">
            <button
              onClick={handleCancel}
              className="flex-1 py-2 px-4 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            
            <button
              onClick={handleLogout}
              className="flex-1 py-2 px-4 bg-[#3294b4] text-white rounded-md hover:bg-blue-600 transition"
            >
              Yes, Logout
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
          <h2 className="text-xl font-semibold mb-4">Logging Out</h2>
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3294b4] mx-auto"></div>
          <p className="text-gray-600 mt-4">Please wait...</p>
        </div>
      )}
    </div>
  );
}

export default Logout;