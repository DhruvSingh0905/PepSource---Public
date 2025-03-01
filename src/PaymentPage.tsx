import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import axios from "axios";
import { supabase } from "../supabaseClient";

// Load your Stripe public key from environment variables.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);

async function fetchUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        return user;
    } else {
        return null;
    }
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
            console.log(user)
            const { data: userInfo } = await axios.post("http://127.0.0.1:8000/map-user-subscription", {
                user_email: user?.email,
                user_id: user?.id
            });
            const customerId = userInfo?.subscription.stripe_id;
            // Create a PaymentMethod using the card element.
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
            //const priceId = "price_your_price_id"; (handling this in the server)     

            // Call the backend endpoint to create a subscription.
            const { data } = await axios.post("http://127.0.0.1:8000/create-subscription", {
                customerId: customerId, // Optional: if omitted, the backend creates a new customer.
                user_email: user?.email,
                payment_method_id: paymentMethodId,
            });

            //TODO: Maybe get this working? 
            //!If additional card authentication is required, Stripe will include a payment intent client secret.
            // const clientSecret = data.latest_invoice?.payment_intent?.client_secret;
            // if (clientSecret) {
            //     console.log("HOWHODOWHDOHOWDHODH");
            //     const result = await stripe.confirmCardPayment(clientSecret, {
            //         payment_method: {
            //         card: elements.getElement(CardElement)!,
            //         },
            //     });
            //     if (result.error) {
            //         console.log("MADEMIETMITM");
            //         setMessage(result.error.message || "Payment failed");
            //         setLoading(false);
            //         return;
            //     }
            // }

            setMessage("Subscription created successfully!"); 
        } catch (error: any) {
            setMessage(error.response?.data?.error || "An error occurred");
        }
        setLoading(false);
    };

  return (
    <div className="w-[1000px] mx-auto p-6 bg-white shadow-lg rounded-lg">
      <h2 className="text-xl font-bold mb-4">Subscribe for $10/month</h2>
      <form onSubmit={handleSubmit}>
        <CardElement className="p-3 border border-gray-300 rounded-md" />
        <button
          type="submit"
          disabled={!stripe || loading}
          className="mt-4 w-full bg-blue-500 text-white py-2 rounded-md disabled:opacity-50"
        >
          {loading ? "Processing..." : "Subscribe"}
        </button>
      </form>
      {message && <p className="mt-4 text-red-500">{message}</p>}
    </div>
  );
};

const PaymentPage: React.FC = () => {
    const [userSubscription, setUserSubscription] = useState<boolean>(false);
    // Retrieve user from Supabase auth

    useEffect(() => {
        // Retrieve user from Supabase auth
        async function fetchSubscriptionInfo() {
            const user = await fetchUser();
            const { data: info } = await axios.get("http://127.0.0.1:8000/user-subscription", {
                params: { user_id: user?.id }
            });
            console.log(info);
            if (info?.has_subscription)
            {setUserSubscription(true);}
        }
        fetchSubscriptionInfo();
    }, []);

  return (
    <div className="mt-32">
    {userSubscription && <p className="mt-4 text-[50px] text-black">You Already have a subscription!</p>}

    {!userSubscription && (
        <Elements stripe={stripePromise}>
            <SubscriptionForm />
        </Elements>
    )}
    </div>
  );
};

export default PaymentPage;