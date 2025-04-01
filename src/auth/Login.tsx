import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";

const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // CSS style to ensure inputs have white background and black text
  const styles = `
    .login-input {
      background-color: white !important;
      color: black !important;
    }
    
    .login-input::placeholder {
      color: #999 !important;
    }
    
    .login-input:-webkit-autofill,
    .login-input:-webkit-autofill:hover, 
    .login-input:-webkit-autofill:focus,
    .login-input:-webkit-autofill:active {
      -webkit-box-shadow: 0 0 0 30px white inset !important;
      -webkit-text-fill-color: black !important;
    }
  `;

  // Email and password login handler
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      // After a successful login, get the user data from Supabase
      navigate("/");
    }
    setLoading(false);
  };

  // Google OAuth login handler
  const handleGoogleLogin = async () => {
    const apiUrl = import.meta.env.VITE_BACKEND_PRODUCTION_URL;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${apiUrl}/finishLogin`,
      },
    });
    if (error) {
      setError(error.message);
    }
    // Supabase handles redirection automatically.
  };

  return (
    <>
      <style>{styles}</style>
      <div className="flex justify-center items-center min-h-screen bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
          <h2 className="text-xl font-semibold mb-4">Sign In</h2>
          {error && <p className="text-red-500 mb-2">{error}</p>}
          {/* Email/Password Login Form */}
          <form onSubmit={handleEmailLogin} className="mb-4">
            <input
              type="email"
              placeholder="Email"
              className="w-full border border-gray-300 rounded p-2 mb-2 login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full border border-gray-300 rounded p-2 mb-2 login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            
            <div className="flex justify-end mb-4">
              <Link to="/forgot-password" className="text-sm text-[#3294b4] hover:underline">
                Forgot your password?
              </Link>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#3294b4] text-white py-2 rounded hover:bg-blue-600 transition"
            >
              {loading ? "Signing in..." : "Sign in with Email"}
            </button>
          </form>
          {/* Separator */}
          <div className="flex items-center justify-center mb-2">
            <span className="border-b w-1/3"></span>
            <span className="mx-2 text-sm text-gray-500">or</span>
            <span className="border-b w-1/3"></span>
          </div>
          {/* Google OAuth Login */}
          <button
            onClick={handleGoogleLogin}
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
            Sign in with Google
          </button>
          {/* Link to Signup */}
          <div className="mt-4 text-sm">
            Don't have an account?{" "}
            <Link to="/signup" className="text-[#3294b4] hover:underline">
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;