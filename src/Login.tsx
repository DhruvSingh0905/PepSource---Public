/// <reference types="node" />
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

function Login() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ picture: string; name: string; email: string } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch("http://127.0.0.1:8000/api/auth/google/user", {
          credentials: "include",
        });
        const data = await response.json();
        if (data.loggedIn) {
          setUser(data.user);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUser();
  }, []);

  const handleGoogleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = "http://127.0.0.1:8000/api/auth/google/callback";
    window.location.href = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=email%20profile`;
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
        {user ? (
          <div>
            <img src={user.picture} alt="Profile" className="w-16 h-16 rounded-full mx-auto mb-4" />
            <h2 className="text-xl font-semibold">{user.name}</h2>
            <p className="text-gray-600">{user.email}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 transition"
            >
              Continue to Home
            </button>
          </div>
        ) : (
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-red-500 text-white py-2 px-4 rounded-lg flex items-center justify-center hover:bg-red-600 transition"
          >
            <img src="/google-icon.svg" alt="Google" className="w-5 h-5 mr-2" />
            Sign in with Google
          </button>
        )}
      </div>
    </div>
  );
}

export default Login;
