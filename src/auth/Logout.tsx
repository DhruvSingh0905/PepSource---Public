import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useEffect } from "react";

function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    const signOutUser = async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Error during sign out:", error);
      }
      navigate("/");
    };
    signOutUser();
  }, [navigate]);

  return <div>Logging out...</div>;
}

export default Logout;