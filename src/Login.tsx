/// <reference types="node" />
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

function Login() {

   // Fetch user information from Google's OAuth2 API
  
  const handleGoogleLogin = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    console.log(clientId);
    const redirectUri = "http://127.0.0.1:8000/finishLogin";
    window.location.href = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=email%20profile%20openid&access_type=offline&prompt=consent`;
    };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
          <button
            onClick={handleGoogleLogin}
            className="w-full bg-red-500 text-white py-2 px-4 rounded-lg flex items-center justify-center hover:bg-red-600 transition"
          >
            <img src="/google-icon.svg" alt="Google" className="w-5 h-5 mr-2" />
            Sign in with Google
          </button>
        
      </div>
    </div>
  );
}

export default Login;
