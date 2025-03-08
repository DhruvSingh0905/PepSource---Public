import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import axios from "axios";
import { supabase } from "../supabaseClient";

// Load your Stripe public key from environment variables.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);

// Fetch user from Supabase
async function fetchUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user || null;
}

const SubscriptionForm: React.FC = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setMessage("");

    try {
      const user = await fetchUser();
      // Map user to subscription in your backend
      const { data: userInfo } = await axios.post("http://127.0.0.1:8000/map-user-subscription", {
        user_email: user?.email,
        user_id: user?.id,
      });
      const customerId = userInfo?.subscription.stripe_id;

      // Create PaymentMethod
      const cardElement = elements.getElement(CardElement);
      const paymentMethodResult = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement!,
      });

      if (paymentMethodResult.error) {
        setMessage(paymentMethodResult.error.message || "Error creating payment method");
        setLoading(false);
        return;
      }

      const paymentMethodId = paymentMethodResult.paymentMethod?.id;

      // Call backend to create subscription
      await axios.post("http://127.0.0.1:8000/create-subscription", {
        customerId,
        user_email: user?.email,
        payment_method_id: paymentMethodId,
      });

      setMessage("Subscription created successfully!");
    } catch (error: any) {
      setMessage(error.response?.data?.error || "An error occurred");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md w-full">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment method
          </label>
          <div className="border border-gray-300 rounded-lg p-3">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: "16px",
                    color: "#424770",
                    "::placeholder": { color: "#aab7c4" },
                  },
                  invalid: { color: "#9e2146" },
                },
              }}
            />
          </div>
        </div>

        {/* If you want extra fields like cardholder name or address, add them here */}
        {/* Example: 
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cardholder name</label>
          <input type="text" className="w-full border border-gray-300 rounded-lg p-2" />
        </div>
        */}

        {message && <p className="text-red-500">{message}</p>}

        <button
          type="submit"
          disabled={!stripe || loading}
          className="w-full py-3 rounded-md text-white font-semibold 
                     bg-gradient-to-r from-[#1fb6ff] to-[#13ce66]
                     hover:opacity-90 transition duration-200 
                     disabled:opacity-50"
        >
          {loading ? "Processing..." : "Subscribe"}
        </button>
      </form>
    </div>
  );
};

const PaymentPage: React.FC = () => {
  const [userSubscription, setUserSubscription] = useState(false);

  useEffect(() => {
    async function fetchSubscriptionInfo() {
      const user = await fetchUser();
      const { data: info } = await axios.get("http://127.0.0.1:8000/user-subscription", {
        params: { user_id: user?.id },
      });
      if (info?.info?.has_subscription) {
        setUserSubscription(true);
      }
    }
    fetchSubscriptionInfo();
  }, []);
  if (userSubscription)
  {
    return (
      <div className="flex min-h-screen w-screen pt-[80px] bg-white text-gray-800">
        <div className="w-full flex flex-col items-center mt-8">
        {/* Title */}
        <h1 className="text-center text-2xl font-bold mb-6">
          You already have a subscription
        </h1>

        {/* Perks Tile */}
        <div className="bg-white rounded-lg shadow p-6 w-full max-w-md">
          <h2 className="text-xl font-semibold mb-4">Your Subscription Perks</h2>
          <ul className="list-disc list-inside space-y-2">
            1. Access to Vendor Ratings and price efficiency <br/><br/>
            2. Access to latest Peptide research for every substance <br/><br/>
            3. Membership within a community of hundreds of avid health enthusiasts
          </ul>
        </div>
      </div>
      </div>
    )
  }
  return (
    <div className="flex min-h-screen w-screen pt-[20px] bg-white text-gray-800">
      {/* Left side: subscription details, pricing, etc. */}
      <div className="flex flex-col justify-start w-full md:w-1/2 p-8 border-r border-gray-200">
        {/* Logo */}
        <img
          src="/path/to/pepsource-logo.png"
          alt="PepSource Logo"
          className="h-10 mb-8"
        />

        {/* Title and price */}
        <h1 className="text-2xl font-bold mb-2">Subscribe to PepSource Premium</h1>
        <p className="text-xl text-gray-700 mb-6">
          $10.00 <span className="text-sm text-gray-500">/ month</span>
        </p>

        {/* Pricing details */}
        <div className="space-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-gray-600">PepSource Premium Subscription</span>
            <span className="text-gray-800 font-medium">$10.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-800 font-medium">$10.00</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax</span>
            <span className="text-gray-800 font-medium">$0.00</span>
          </div>
          <hr />
          <div className="flex justify-between font-semibold text-gray-800">
            <span>Total due today</span>
            <span>$10.00</span>
          </div>
        </div>

        <p className="text-sm text-gray-500">
          You’ll be charged now, then monthly at the frequency above. Cancel any time.
        </p>
      </div>

      {/* Right side: payment form */}
      <div className="w-full md:w-1/2 p-8 pt-[120px] flex items-start justify-center">
          <Elements stripe={stripePromise}>
            <SubscriptionForm />
          </Elements>
      </div>
    </div>
  );
};

export default PaymentPage;