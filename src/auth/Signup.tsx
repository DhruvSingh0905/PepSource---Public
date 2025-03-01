import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";

function Signup() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Handle sign-up using email and password.
  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      console.log(error);
      setError(error.message);
    } else {
      // Redirect to a "Check Your Email" page after a successful sign-up.
      navigate("/check-email");
    }
    setLoading(false);
  };

  // Handle Google OAuth signup.
  const handleGoogleSignup = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://127.0.0.1:8000/finishLogin",
      },
    });
    if (error) {
      setError(error.message);
    }
    // Redirection is handled automatically.
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
        <h2 className="text-xl font-semibold mb-4">Sign Up</h2>
        {error && <p className="text-red-500 mb-2">{error}</p>}
        {/* Email/Password Signup Form */}
        <form onSubmit={handleEmailSignup} className="mb-4">
          <input
            type="text"
            placeholder="Full Name"
            className="w-full border border-gray-300 rounded p-2 mb-2 bg-white"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
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
          className="w-full bg-red-500 text-white py-2 px-4 rounded-lg flex items-center justify-center hover:bg-red-600 transition"
        >
          <img src="/google-icon.svg" alt="Google" className="w-5 h-5 mr-2" />
          Sign Up with Google
        </button>
        {/* Link to Login */}
        <div className="mt-4 text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-500 hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Signup;