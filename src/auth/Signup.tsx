import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import axios from "axios";

// Constants
const API_BASE_URL = import.meta.env.VITE_BACKEND_PRODUCTION_URL;

function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMatch, setPasswordMatch] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [returnUrl, setReturnUrl] = useState<string>("/");

  // Parse query parameters to get returnUrl if available
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const returnPath = params.get('returnUrl');
    if (returnPath) {
      setReturnUrl(returnPath);
    }
  }, [location]);

  // Check password match when either password field changes
  useEffect(() => {
    // Only validate if both fields have values
    if (password && confirmPassword) {
      setPasswordMatch(password === confirmPassword);
    } else {
      // Don't show mismatch error when fields are empty
      setPasswordMatch(true);
    }
  }, [password, confirmPassword]);

  // CSS style to ensure inputs have white background and black text
  const styles = `
    .signup-input {
      background-color: white !important;
      color: black !important;
    }
    
    .signup-input::placeholder {
      color: #999 !important;
    }
    
    .signup-input:-webkit-autofill,
    .signup-input:-webkit-autofill:hover, 
    .signup-input:-webkit-autofill:focus,
    .signup-input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 30px white inset !important;
      -webkit-text-fill-color: black !important;
    }
  `;

  // Check if email exists via server API
  const checkEmailExists = async (emailToCheck: string): Promise<boolean> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/check-user-exists`, {
        email: emailToCheck
      });
      
      return response.data.exists;
    } catch (error) {
      console.error("Error checking if user exists:", error);
      // Default to false on error to allow signup attempt
      // The signup will fail properly if the user actually exists
      return false;
    }
  };

  // Handle sign-up using email and password.
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password match
    if (password !== confirmPassword) {
      setPasswordMatch(false);
      return;
    }
    
    // Reset states
    setLoading(true);
    setError(null);
    setExistingAccount(false);

    try {
      // Check if the email already exists using the secure server API
      const emailExists = await checkEmailExists(email);
      
      if (emailExists) {
        setExistingAccount(true);
        setError("This email is already registered. Please sign in instead.");
        setLoading(false);
        return;
      }

      // Combine first and last name
      const fullName = `${firstName} ${lastName}`.trim();

      // If the email doesn't exist, proceed with signup
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name: fullName },
        },
      });

      if (error) {
        console.log("Signup error:", error);
        
        // Still check for specific error messages that indicate an existing account
        if (
          error.message.includes("already registered") || 
          error.message.includes("already exists") ||
          error.message.includes("already taken") ||
          error.message.includes("User already registered")
        ) {
          setExistingAccount(true);
          setError("This email is already registered. Please sign in instead.");
        } else {
          setError(error.message);
        }
      } else if (data?.user?.identities?.length === 0) {
        // Supabase sometimes returns success but with identities length 0, 
        // which indicates the email already exists
        setExistingAccount(true);
        setError("This email is already registered. Please sign in instead.");
      } else {
        // Redirect to a "Check Your Email" page after a successful sign-up.
        navigate("/check-email");
      }
    } catch (err) {
      console.error("Error during signup process:", err);
      setError("An unexpected error occurred. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  // Handle Google OAuth signup.
  const handleGoogleSignup = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${API_BASE_URL}/finishLogin?returnUrl=${encodeURIComponent(returnUrl)}`,
      },
    });
    if (error) {
      setError(error.message);
    }
    // Redirection is handled automatically.
  };

  // Navigate to login page (used when existing account is detected)
  const goToLogin = () => {
    navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`, { state: { email } });
  };

  return (
    <>
      <style>{styles}</style>
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
          <h2 className="text-xl font-semibold mb-4">Sign Up</h2>
          
          {returnUrl !== "/" && (
            <p className="text-sm text-gray-600 mb-4">
              Please create an account to access this page
            </p>
          )}
          
          {/* Existing Account Alert */}
          {existingAccount ? (
            <div className="mb-6">
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-blue-700 text-left">
                      This email is already registered. Would you like to sign in instead?
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={goToLogin}
                  className="flex-1 bg-[#3294b4] text-white py-2 px-4 rounded hover:bg-blue-600 transition"
                >
                  Go to Login
                </button>
                <button
                  onClick={() => setExistingAccount(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300 transition"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : (
            <>
              {error && <p className="text-red-500 mb-2">{error}</p>}
              {/* Email/Password Signup Form */}
              <form onSubmit={handleEmailSignup} className="mb-4">
                {/* Name fields in a two-column layout */}
                <div className="flex space-x-2 mb-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="First Name"
                      className="w-full border border-gray-300 rounded p-2 signup-input"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="Last Name"
                      className="w-full border border-gray-300 rounded p-2 signup-input"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                
                <input
                  type="email"
                  placeholder="Email"
                  className="w-full border border-gray-300 rounded p-2 mb-2 signup-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full border border-gray-300 rounded p-2 mb-2 signup-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                
                <div className="mb-2">
                  <input
                    type="password"
                    placeholder="Confirm Password"
                    className={`w-full border ${!passwordMatch ? 'border-red-500' : 'border-gray-300'} rounded p-2 signup-input`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  {!passwordMatch && (
                    <p className="text-red-500 text-xs text-left mt-1">
                      Passwords do not match
                    </p>
                  )}
                </div>
                
                <button
                  type="submit"
                  disabled={loading || !passwordMatch}
                  className={`w-full ${!passwordMatch ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#3294b4] hover:bg-blue-600'} text-white py-2 rounded transition`}
                >
                  {loading ? "Signing up..." : "Sign Up with Email"}
                </button>
              </form>
              {/* Separator */}
              <div className="flex items-center justify-center mb-2">
                <span className="border-b w-1/3"></span>
                <span className="mx-2 text-sm text-gray-500">or</span>
                <span className="border-b w-1/3"></span>
              </div>
              {/* Google OAuth Signup */}
              <button
                onClick={handleGoogleSignup}
                className="w-full bg-white text-gray-700 py-2 px-4 rounded-lg flex items-center justify-center border border-gray-300 hover:bg-gray-50 transition"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 48 48" 
                  className="w-5 h-5 mr-2"
                >
                  <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                  <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                  <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                  <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                </svg>
                Sign Up with Google
              </button>
            </>
          )}
          
          {/* Link to Login */}
          <div className="mt-4 text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-[#3294b4] hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default Signup;