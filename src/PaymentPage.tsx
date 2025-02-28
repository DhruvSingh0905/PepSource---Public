import React, { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import axios from "axios";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);

const CheckoutForm: React.FC = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setMessage("");

    try { //TODO: look up how to simulate movement of money, should be the page alr opened in arc. 
        //!YOU CANNNOT USE REAL CAARDS WHEN APP IS STILL IN TEST MODE
      // Request client secret from the backend
      const { data } = await axios.post("http://127.0.0.1:8000/create-payment-intent", { amount: 100 });

      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement)!
        }
      });

      if (result.error) {
        setMessage(result.error.message || "Payment failed");
      } else if (result.paymentIntent?.status === "succeeded") {
        setMessage("Payment successful!");
      }
    } catch (error) {
      setMessage("An error occurred");
    }

    setLoading(false);
  };

  return (
    <div className="w-[1000px] mx-auto p-6 bg-white shadow-lg rounded-lg">
      <h2 className="text-xl font-bold mb-4">Stripe Payment</h2>
      <form onSubmit={handleSubmit}>
        <CardElement className="p-3 border border-gray-300 rounded-md" />
        <button
          type="submit"
          disabled={!stripe || loading}
          className="mt-4 w-full bg-blue-500 text-white py-2 rounded-md disabled:opacity-50"
        >
          {loading ? "Processing..." : "Pay $10"}
        </button>
      </form>
      {message && <p className="mt-4 text-red-500">{message}</p>}
    </div>
  );
};

const PaymentPage: React.FC = () => {
  return (
    <div className="mt-32">
        <Elements stripe={stripePromise}>
            <CheckoutForm />
        </Elements>
    </div>
  );
};

export default PaymentPage;