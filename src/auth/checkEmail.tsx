import { useNavigate } from "react-router-dom";

function CheckEmail() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-96 text-center">
        <h2 className="text-xl font-semibold mb-4">Check Your Email</h2>
        <p className="mb-4">A confirmation link has been sent to your email. Please verify your email to continue.</p>
        <button
          onClick={() => navigate("/login")}
          className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 transition"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}

export default CheckEmail;