import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient"; // Adjust import path as needed

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CSS style to ensure inputs have white background and black text
  const styles = `
    .forgot-input {
      background-color: white !important;
      color: black !important;
    }
    
    .forgot-input::placeholder {
      color: #999 !important;
    }
    
    .forgot-input:-webkit-autofill,
    .forgot-input:-webkit-autofill:hover, 
    .forgot-input:-webkit-autofill:focus,
    .forgot-input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 30px white inset !important;
      -webkit-text-fill-color: black !important;
    }
  `;

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Call Supabase's reset password function with the correct redirect URL
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?type=recovery`
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again later.");
      console.error("Password reset error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
          <h2 className="text-xl font-semibold mb-4">Reset Password</h2>
          
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {success ? (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 mb-4">
              <p className="text-green-700">
                Password reset email sent! Please check your inbox (and spam folder) for instructions to reset your password.
              </p>
              <div className="mt-6">
                <Link to="/login" className="text-[#3294b4] hover:underline">
                  Return to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="mb-4">
              <p className="text-gray-600 mb-4">
                Enter your email address below and we'll send you a link to reset your password.
              </p>
              <input
                type="email"
                placeholder="Email"
                className="w-full border border-gray-300 rounded p-2 mb-4 forgot-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#3294b4] text-white py-2 rounded hover:bg-blue-600 transition"
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <div className="mt-4 text-sm">
                <Link to="/login" className="text-[#3294b4] hover:underline">
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export default ForgotPassword;