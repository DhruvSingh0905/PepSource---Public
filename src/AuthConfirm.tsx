import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient"; // Adjust import path as needed

function AuthConfirm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Function to handle the hash fragment sent by Supabase
    const handleHashChange = async () => {
      try {
        // When Supabase redirects back, it includes auth data in the URL hash
        // This method will attempt to parse that hash and extract the session
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Session error:", error);
          setError("Authentication failed. Please try again.");
          setLoading(false);
          return;
        }

        if (data && data.session) {
          // Session exists, redirect to password update page
          navigate("/account/update-password");
        } else {
          // Handle URL parameters for email confirmation
          const params = new URLSearchParams(window.location.search);
          const tokenHash = params.get("token_hash");
          const type = params.get("type");
          
          if (!tokenHash || !type) {
            setError("Invalid confirmation link. Missing required parameters.");
            setLoading(false);
            return;
          }

          // Verify the OTP (One-Time Password)
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });

          if (otpError) {
            console.error("OTP verification error:", otpError);
            setError(otpError.message);
            setLoading(false);
            return;
          }

          // Successfully verified
          if (type === "email" || type === "signup") {
            // Email confirmation - redirect to homepage or dashboard
            navigate("/");
          } else if (type === "recovery") {
            // Password reset - redirect to update password page
            navigate("/account/update-password");
          } else {
            // Default redirect
            navigate("/");
          }
        }
      } catch (err) {
        console.error("Authentication confirmation error:", err);
        setError("An unexpected error occurred. Please try again later.");
        setLoading(false);
      }
    };

    handleHashChange();
  }, [navigate]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
        {loading ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">Verifying...</h2>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#3294b4] mx-auto"></div>
            <p className="text-gray-600 mt-4">Please wait while we verify your request.</p>
          </div>
        ) : error ? (
          <div>
            <h2 className="text-xl font-semibold mb-4">Verification Failed</h2>
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="bg-[#3294b4] text-white py-2 px-4 rounded hover:bg-blue-600 transition"
            >
              Back to Sign In
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default AuthConfirm;