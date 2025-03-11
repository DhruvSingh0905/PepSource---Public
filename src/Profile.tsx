import { useState, useEffect } from 'react';
import { supabase } from "../supabaseClient";
import pfp from "./assets/pfp.jpg"; //Default pfp //TODO: allow users to choose their own and update profile table in db
import axios from "axios";

interface User {
    name: string;
    id: string;
    email: string;
    picture: string;
    avatar_url: string;
    nextPaymentDate: string | null;
    preferences: string[] | null;

}

function Profile() {
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        // Retrieve user from Supabase
        async function fetchUser() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                let dummy = user.user_metadata as User;
                dummy.id = user.id;
                const { data: preferences } = await axios.get("http://127.0.0.1:8000/api/getUser", {
                    params: { id: dummy.id },
                });
                dummy.preferences = preferences.user_info.preferences;
                
                setUser(dummy);
            }
        }
        fetchUser();
    }, [])

    useEffect(() =>{
        console.log(user);
    }, [user])

    
    return (
        <div className="min-h-screen p-4 pt-20">
      {/* Outer container with a max width and white background */}
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6 flex flex-col gap-6">
        
        {/* Profile Picture and User Name */}
        <div className="flex flex-col items-center">
            <img
                src={pfp}
                alt="banner"
                className="w-32 h-32 rounded-full bg-gray-300"
            />            
          <h2 className="mt-4 text-xl font-bold text-gray-800">{user?.name}</h2>
          <h2 className="mt-4 text-xl font-bold text-gray-800">{user?.email}</h2>

        </div>

        {/* Interested In */}
        <div>
          <h3 className="text-lg font-semibold mb-2 text-gray-800">Interested in:</h3>
          <div className="bg-black opacity-10 text-white p-4 rounded">
            <ol className="list-decimal list-inside space-y-1">
              
            </ol>
          </div>
        </div>

        {/* Subscription Information */}
        <div>
          <h3 className="text-lg font-semibold mb-2 text-gray-800">Subscription Information</h3>
          <p className="text-gray-700">Next Payment: {user?.nextPaymentDate}</p>
          <button
            className="mt-2 text-blue-600 hover:underline"
            // onClick={onCancelSubscription}
          >
            Cancel Subscription
          </button>
        </div>

      </div>
    </div>
    )
};

export default Profile;