/// <reference types="node" />
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

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
      // After successful login, navigate to the main page.
      navigate("/");
    }
    setLoading(false);
  };

  // Google OAuth login handler
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://127.0.0.1:8000/finishLogin",
      },
    });
    if (error) {
      setError(error.message);
    }
    // Supabase handles redirection automatically.
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
        <h2 className="text-xl font-semibold mb-4">Sign In</h2>
        {error && <p className="text-red-500 mb-2">{error}</p>}
        {/* Email/Password Login Form */}
        <form onSubmit={handleEmailLogin} className="mb-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full border border-gray-300 rounded p-2 mb-2 bg-white"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full border border-gray-300 rounded p-2 mb-2 bg-white"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition"
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
          className="w-full bg-red-500 text-white py-2 px-4 rounded-lg flex items-center justify-center hover:bg-red-600 transition"
        >
          <img src="/google-icon.svg" alt="Google" className="w-5 h-5 mr-2" />
          Sign in with Google
        </button>
        {/* Link to Signup */}
        <div className="mt-4 text-sm">
          Don't have an account?{" "}
          <Link to="/signup" className="text-blue-500 hover:underline">
            Sign Up
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;