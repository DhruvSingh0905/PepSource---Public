/// <reference types="node" />
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

function Login() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ picture: string; name: string; email: string } | null>(null);
  const [token, setToken] = useState<{ access: string | null; expiresIn: string| null} | null>(null);

  // Function to extract access token from the URL fragment
  const getTokenFromUrl = (param:string) => {
    const hash = window.location.hash.substring(1); // Remove the #
    const params = new URLSearchParams(hash);
    return params.get(param);
  };

  useEffect(() => {
    const receivedToken = getTokenFromUrl("access_token");
    const expiresIn = getTokenFromUrl("expires_in");
    setToken({ access: receivedToken, expiresIn: expiresIn });
    console.log(receivedToken);
    if (receivedToken != null) { fetchUserInfo(receivedToken); }// Fetch user details from Google API
    
  }, []);
   // Fetch user information from Google's OAuth2 API
   const fetchUserInfo = async (daToken: string) => {
    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${daToken}`,
        },
      });
      console.log(response);
      const data = await response.json();
      console.log(data.name);
      setUser({
        name: data.name,
        email: data.email,
        picture: data.picture,
      });
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  };
// http://localhost:5173/login#access_token=ya29.a0AXeO80S9ldTk_fYU_hpFhKfToG8kDc1-WmRmADas6Stz6PLt3rkz2ez4Q98GK2PqU9lqRUtfFpihU-_3WHe1FDbN-TNwuP-j4yW0S032M0bwvpXPD0kg3act-6GfRAHi_5GoPDI9TIKPr2r4yrjDN9D-OpBYPIYETIgezNnGaCgYKAdgSARASFQHGX2Mi1WJAwohuzno_wLHFtys_5g0175&token_type=Bearer&expires_in=3599&scope=email%20profile%20openid%20https://www.googleapis.com/auth/userinfo.email%20https://www.googleapis.com/auth/userinfo.profile&authuser=0&prompt=none
  const handleGoogleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    console.log(clientId);
    const redirectUri = "http://localhost:5173/login";
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
