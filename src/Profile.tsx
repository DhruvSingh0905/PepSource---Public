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
interface PaymentMethod {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  }

interface SubscriptionInfo {
    subscriptionId: string;
    nextPaymentDate: string;
    paymentMethod: PaymentMethod | null;
}
const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

function Profile() {
    const [user, setUser] = useState<User | null>(null);
    const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);

    useEffect(() => {
        // Retrieve user from Supabase
        async function fetchUser() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                let dummy = user.user_metadata as User;
                dummy.id = user.id;
                const { data: preferences } = await axios.get(`${apiUrl}/api/getUser`, {
                    params: { id: dummy.id },
                });
                console.log(preferences);
                dummy.preferences = preferences.user_info.preferences;
                
                setUser(dummy);
                try {
                  const { data: info } = await axios.get(`${apiUrl}/user-subscription`, {
                    params: { user_id: user?.id },
                  });
                  if (info?.info?.has_subscription) {
                    const { data } = await axios.get(`${apiUrl}/api/getSubscriptionInfo`, {
                      params: { id: user.id },
                    });
                    setSubscriptionInfo(data);
                  }
                }
                catch (error) {
                  console.error("Error fetching subscription info:", error);
                }
            }
        }
        fetchUser();
    }, [])

    // useEffect(() =>{
    //     console.log(user);
    // }, [user])

    async function onCancelSubscription() {
        if (!user) return;
        try {
        const { data } = await axios.post(`${apiUrl}/api/cancelSubscription`, {
            id: user.id,
        });
        console.log("Subscription canceled:", data);
        // You might want to refetch subscription info or set state to null
        setSubscriptionInfo(null);
        } catch (error) {
        console.error("Error canceling subscription:", error);
        }
    }
    return (
        <div className="min-h-screen pt-20 px-4">
    {/* A container that limits the width and centers it */}
    <div className="max-w-6xl h-screen mx-auto bg-white rounded-lg shadow-md p-6 flex flex-col gap-6">
      
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
        <h3 className="text-lg font-semibold mb-2 text-gray-800">
          Interested in:
        </h3>
        <div className="p-4 rounded">
          <ol className="list-decimal list-inside space-y-1 text-black">
            {user?.preferences && user.preferences.map((pref, index) => (
              <p key={index}>
                {index + 1}. {pref}
              </p>
            ))}
          </ol>
        </div>
      </div>

      {/* Subscription Information */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-800">
          Subscription Information
        </h3>
        {subscriptionInfo ? (
          <>
            <p className="text-gray-700">
              Next Payment: {subscriptionInfo.nextPaymentDate}
            </p>
            {subscriptionInfo.paymentMethod && (
              <p className="text-gray-700">
                Payment Method on file:{" "}
                {subscriptionInfo.paymentMethod.brand.toUpperCase()} ****
                {subscriptionInfo.paymentMethod.last4} (exp{" "}
                {subscriptionInfo.paymentMethod.exp_month}/
                {subscriptionInfo.paymentMethod.exp_year})
              </p>
            )}
            <button
              className="mt-2 text-blue-600 hover:underline"
              onClick={onCancelSubscription}
            >
              Cancel Subscription
            </button>
          </>
        ) : (
          <p className="text-gray-700">No active subscription found.</p>
        )}
      </div>
    </div>
  </div>
    )
};

export default Profile;