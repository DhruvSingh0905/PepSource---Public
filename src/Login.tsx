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
    if (receivedToken != null) { fetchUserInfo(receivedToken); }// Fetch user details from Google API
    
  }, []);
   // Fetch user information from Google's OAuth2 API
   const fetchUserInfo = async (daToken: string) => {
    let refreshToken: string | null = null;
    try {
        const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
                Authorization: `Bearer ${daToken}`,
                },
        });
        const data = await response.json();
        setUser({
            name: data.name,
            email: data.email,
            picture: data.picture,
        });
        getRefreshTokenFromAccessToken(daToken)
        .then(rt => { refreshToken = rt;console.log(rt); }).catch(error => {console.error('Error:', error);});
        console.log(refreshToken);
        //!Here is where we implement DB call
    } catch (error) {
      console.error("Error fetching user info:", error);
    }
  };
    async function getRefreshTokenFromAccessToken(accessToken: string): Promise<any> {
        const url = 'https://oauth2.googleapis.com/token';

        // Prepare the data that needs to be sent in the request body
        const data = new URLSearchParams();
        data.append('grant_type', 'refresh_token');
        data.append('access_token', accessToken);

        // Use fetch to send the request
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: data.toString(), // Send data as application/x-www-form-urlencoded
            });

            // Check if the response is successful
            if (response.ok) {
                const result = await response.json();
                return result.refresh_token; // Return the refresh token from the response
            } else {
                throw new Error('Failed to get refresh token');
            }
        } catch (error) {
            console.error('Error fetching refresh token:', error);
            throw error; // Rethrow the error if necessary
        }
    }
  const handleGoogleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    console.log(clientId);
    const redirectUri = "http://127.0.0.1:8000/finishLogin";
    window.location.href = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile%20openid&access_type=offline&prompt=consent`;
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
