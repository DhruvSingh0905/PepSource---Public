import { useEffect } from "react";
import { supabase } from "../../supabaseClient";

function Logout() {
  useEffect(() => {
    const signOutUser = async () => {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error("Error during sign out:", error);
        } else {
          console.log("Sign out successful.");
        }
      } catch (err) {
        console.error("Unexpected error during sign out:", err);
      }
      // Remove user data stored locally.
      localStorage.removeItem("email");
      localStorage.removeItem("name");
      // Optionally clear all local storage if you're not storing anything else.
      // localStorage.clear();
      // Force a full page reload to ensure state is fully reset.
      window.location.href = "/";
    };
    signOutUser();
  }, []);

  return <div>Logging out...</div>;
}

export default Logout;