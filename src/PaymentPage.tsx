import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import axios from "axios";
import { supabase } from "../supabaseClient";

// Load your Stripe public key from environment variables.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);
const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL

// Fetch user from Supabase
async function fetchUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user || null;
}

// Add interface for subscription type right after the fetchUser function
interface SubscriptionInfo {
  status: string;
  message?: string;
  subscriptionId?: string;
  nextPaymentDate?: string;
  paymentMethod?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  } | null;
  isCanceled?: boolean;
  warning?: string;
}

// Add AxiosErrorResponse interface after SubscriptionInfo
interface AxiosErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
}

// SubscriptionForm component
const SubscriptionForm: React.FC<{isMobile: boolean}> = ({ isMobile }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const apiUrl: string = import.meta.env.VITE_BACKEND_PRODUCTION_URL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setMessage("");
    setSuccess(false);

    try {
      const user = await fetchUser();
      // Map user to subscription in your backend
      const { data: userInfo } = await axios.post(`${apiUrl}/map-user-subscription`, {
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
      await axios.post(`${apiUrl}/create-subscription`, {
        user_id: user?.id,
        customerId: customerId,
        user_email: user?.email,
        payment_method_id: paymentMethodId,
      });

      setSuccess(true);
      setMessage("Subscription created successfully!");
    } catch (error: unknown) {
      const axiosError = error as AxiosErrorResponse;
      setMessage(axiosError.response?.data?.message || "An error occurred");
    }
    setLoading(false);
  };

  // Mobile version
  if (isMobile) {
    return (
      <div className="w-full">
        {success ? (
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="w-12 h-12 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-green-800 mb-2">Subscription Activated!</h3>
            <p className="text-green-700 text-sm mb-4">
              Thank you for subscribing to PepSource Premium. You now have full access to all our features.
            </p>
            <a
              href="/profile"
              className="inline-block px-4 py-2 bg-[#3294b4] text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors"
            >
              Go to Your Account
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-lg shadow-md p-4 border border-gray-100">
            <div className="mb-3">
              <h3 className="text-base font-bold text-gray-800 mb-1">Payment Details</h3>
              <p className="text-xs text-gray-500">
                Secure payment processing powered by Stripe
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Card Information
              </label>
              <div className="border border-gray-300 rounded-lg p-3 bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#3294b4] focus-within:border-[#3294b4] transition-colors">
                <CardElement
                  options={{
                    style: {
                      base: {
                        fontSize: "14px",
                        color: "#424770",
                        fontFamily: "'Inter', sans-serif",
                        "::placeholder": { color: "#aab7c4" },
                        iconColor: "#3294b4",
                      },
                      invalid: { color: "#e53e3e", iconColor: "#e53e3e" },
                    },
                    hidePostalCode: true,
                  }}
                />
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                <span>Subscription Total:</span>
                <span>$10.00 / month</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                You'll be charged now, then monthly. Cancel anytime from your account.
              </p>
            </div>

            {message && (
              <div className={`p-2 rounded text-xs ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={!stripe || loading}
              className="w-full py-2 px-4 rounded-full text-white text-sm font-medium bg-[#3294b4] hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                "Subscribe Now"
              )}
            </button>
            
            <div className="flex items-center justify-center mt-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="text-xs text-gray-500">
                Secure payment powered by Stripe
              </span>
            </div>
          </form>
        )}
      </div>
    );
  }

  // Desktop version (unchanged)
  return (
    <div className="w-full max-w-md">
      {success ? (
        <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200">
          <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-green-800 mb-2">Subscription Activated!</h3>
          <p className="text-green-700 mb-4">
            Thank you for subscribing to PepSource Premium. You now have full access to all our features.
          </p>
          <a
            href="/profile"
            className="inline-block px-6 py-2 bg-[#3294b4] text-white rounded-full font-medium hover:bg-blue-600 transition-colors"
          >
            Go to Your Account
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-lg shadow-lg p-6 border border-gray-100">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Payment Details</h3>
            <p className="text-sm text-gray-500">
              Secure payment processing powered by Stripe
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Card Information
            </label>
            <div className="border border-gray-300 rounded-lg p-4 bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#3294b4] focus-within:border-[#3294b4] transition-colors">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: "16px",
                      color: "#424770",
                      fontFamily: "'Inter', sans-serif",
                      "::placeholder": { color: "#aab7c4" },
                      iconColor: "#3294b4",
                    },
                    invalid: { color: "#e53e3e", iconColor: "#e53e3e" },
                  },
                  hidePostalCode: true,
                }}
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
              <span>Subscription Total:</span>
              <span>$5.00 / month</span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              You'll be charged now, then monthly. Cancel anytime from your account.
            </p>
          </div>

          {message && (
            <div className={`p-3 rounded ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={!stripe || loading}
            className="w-full py-3 px-4 rounded-full text-white font-medium bg-[#3294b4] hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              "Subscribe Now"
            )}
          </button>
          
          <div className="flex items-center justify-center mt-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xs text-gray-500">
              Secure payment powered by Stripe
            </span>
          </div>
        </form>
      )}
    </div>
  );
};

// Main PaymentPage component
const PaymentPage: React.FC = () => {
  const [userSubscription, setUserSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  // Add state for tracking screen width
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const apiUrl: string = import.meta.env.VITE_BACKEND_PRODUCTION_URL;
  
  // Set up screen width detection
  useEffect(() => {
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    checkScreenWidth();
    
    // Add event listener
    window.addEventListener('resize', checkScreenWidth);
    
    // Clean up
    return () => {
      window.removeEventListener('resize', checkScreenWidth);
    };
  }, []);

  useEffect(() => {
    async function fetchSubscriptionInfo() {
      setLoading(true);
      try {
        const user = await fetchUser();
        if (user) {
          // First try to get detailed subscription info to check status
          try {
            const { data: subInfo } = await axios.get(`${apiUrl}/api/getSubscriptionInfo`, {
              params: { id: user.id },
            });
            
            // If subscription is active in Stripe (status is "active"), set userSubscription to true
            if (subInfo && subInfo.status === "active") {
              setUserSubscription(true);
              setSubscription(subInfo);
              
              // If it's also marked as canceled, set canceledSubscription
              if (subInfo.isCanceled) {
                setCanceledSubscription(true);
              }
              
              setLoading(false);
              return;
            }
          } catch (error: unknown) {
            console.error("Error fetching subscription info from Stripe:", error);
            // Continue to try the fallback method
          }
          
          // Fallback to checking Supabase directly
          const { data: info } = await axios.get(`${apiUrl}/user-subscription`, {
            params: { user_id: user?.id },
          });
          
          // Check for active or canceled subscription
          if (info?.info) {
            const subscriptionData = info.info;
            // If has_subscription is true, user has an active subscription
            if (subscriptionData.has_subscription) {
              setUserSubscription(true);
              setSubscription(subscriptionData);
            } 
            // If has_subscription is false but canceled is true, it's a canceled subscription
            else if (subscriptionData.canceled) {
              setCanceledSubscription(true);
              setSubscription(subscriptionData);
            }
          }
        }
      } catch (error: unknown) {
        console.error("Error fetching subscription info:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchSubscriptionInfo();
  }, [apiUrl]);

  // Add state for canceled subscription
  const [canceledSubscription, setCanceledSubscription] = useState<boolean>(false);
  const [reactivating, setReactivating] = useState<boolean>(false);
  const [reactivationError, setReactivationError] = useState<string>("");
  const [reactivationSuccess, setReactivationSuccess] = useState<boolean>(false);

  // Add reactivation function
  const handleReactivateSubscription = async () => {
    const currentUser = await fetchUser();
    if (!currentUser) return;
    
    setReactivating(true);
    setReactivationError("");
    
    try {
      const { data } = await axios.post(`${apiUrl}/api/reactivateSubscription`, {
        id: currentUser.id
      });
      
      if (data.status === "success") {
        setReactivationSuccess(true);
        // Fetch updated subscription details after reactivation
        const { data: updatedSubscription } = await axios.get(`${apiUrl}/api/getSubscriptionInfo`, {
          params: { id: currentUser.id },
        });
        setUserSubscription(true);
        setCanceledSubscription(false);
        setSubscription(updatedSubscription);
      }
    } catch (error: unknown) {
      const axiosError = error as AxiosErrorResponse;
      console.error("Error reactivating subscription:", error);
      setReactivationError(axiosError.response?.data?.message || "Failed to reactivate your subscription. Please try again or contact support.");
    } finally {
      setReactivating(false);
    }
  };

  useEffect(() => {
    // Log subscription data whenever it changes (for debugging purposes)
    if (subscription) {
      console.log('Subscription status updated:', subscription.status);
    }
  }, [subscription]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3294b4]"></div>
      </div>
    );
  }

  // Skip showing the subscription options if user already has an active sub
  // Check for active non-canceled subscription first
  if (userSubscription && !canceledSubscription) {
    return (
      <div className="min-h-screen pt-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-[#3294b4] text-white p-6">
              <h1 className="text-2xl font-bold">Active Subscription</h1>
              <p className="text-sm opacity-80">You already have an active PepSource Premium subscription</p>
            </div>
            
            <div className="p-6">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              
              <h2 className="text-xl font-bold text-center mb-6">Your Premium Benefits</h2>
              
              <div className="grid gap-4 md:grid-cols-2 mb-6">
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">AI-Powered Drug Discovery</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Use our advanced AI search to find the perfect compounds tailored to your specific health goals.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">Vendor Ratings & Price Efficiency</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Access expert analysis of vendor quality and price comparisons.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">Latest Research Summaries</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Stay informed with AI-powered summaries of the latest scientific findings.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">Community Access</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Join our exclusive community of health enthusiasts sharing insights.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center">
                <a
                  href="/profile"
                  className="px-6 py-3 bg-[#3294b4] text-white rounded-full font-medium hover:bg-blue-600 transition-colors"
                >
                  Manage Your Subscription
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show reactivation UI for canceled subscriptions in desktop view
  if (canceledSubscription) {
    return (
      <div className="min-h-screen pt-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-[#3294b4] text-white p-6">
              <h1 className="text-2xl font-bold">Reactivate Your Subscription</h1>
              <p className="text-sm opacity-80">Your subscription is currently canceled</p>
            </div>
            
            <div className="p-6">
              {reactivationSuccess ? (
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-3">Subscription Reactivated!</h2>
                  <p className="text-gray-600 mb-4">
                    Your subscription has been successfully reactivated. You now have full access to all premium features.
                  </p>
                  <a
                    href="/profile"
                    className="inline-block px-6 py-2 bg-[#3294b4] text-white rounded-full font-medium hover:bg-blue-600 transition-colors"
                  >
                    Go to Your Account
                  </a>
                </div>
              ) : (
                <>
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
                    <p className="text-yellow-700">
                      Your subscription was canceled but hasn't expired yet. You can reactivate it to continue your premium access without interruption.
                    </p>
                  </div>
                  
                  <h2 className="text-xl font-bold text-gray-800 mb-4">Reactivate Now</h2>
                  <p className="text-gray-600 mb-4">
                    Reactivating your subscription will:
                  </p>
                  
                  <div className="grid md:grid-cols-2 gap-4 mb-6">
                    <div className="flex items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-700">
                        Continue your access without interruption
                      </span>
                    </div>
                    <div className="flex items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-700">
                        Use your existing payment method
                      </span>
                    </div>
                    <div className="flex items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-700">
                        Resume billing at your next scheduled payment date
                      </span>
                    </div>
                    <div className="flex items-start">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-700">
                        Keep all your existing premium benefits
                      </span>
                    </div>
                  </div>
                  
                  {reactivationError && (
                    <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg">
                      {reactivationError}
                    </div>
                  )}
                  
                  <div className="flex space-x-4">
                    <button
                      className="py-2 px-6 bg-[#3294b4] hover:bg-blue-600 text-white rounded-full font-medium transition-colors"
                      onClick={handleReactivateSubscription}
                      disabled={reactivating}
                    >
                      {reactivating ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span>
                      ) : "Reactivate My Subscription"}
                    </button>
                    <a
                      href="/profile"
                      className="py-2 px-6 border border-gray-300 text-gray-700 rounded-full font-medium text-center hover:bg-gray-50 transition-colors"
                    >
                      Return to Profile
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MOBILE VERSION - Active Subscription
  if (userSubscription && isMobile) {
    return (
      <div className="min-h-screen pt-16 bg-gray-50 px-3">
        <div className="mx-auto">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#3294b4] text-white p-4">
              <h1 className="text-xl font-bold">Active Subscription</h1>
              <p className="text-xs opacity-80">You already have an active PepSource Premium subscription</p>
            </div>
            
            <div className="p-4">
              <div className="flex items-center justify-center mb-4">
                <div className="w-12 h-12 bg-green-100 text-green-500 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              
              <h2 className="text-lg font-bold text-center mb-4">Your Premium Benefits</h2>
              
              <div className="grid gap-3">
                <div className="flex items-start p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5">
                    <span className="font-bold text-xs">1</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800 text-sm">AI-Powered Drug Discovery</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Use our advanced AI search to find the perfect compounds tailored to your specific health goals.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5">
                    <span className="font-bold text-xs">2</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800 text-sm">Vendor Ratings & Price Efficiency</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Access expert analysis of vendor quality and price comparisons.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5">
                    <span className="font-bold text-xs">3</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800 text-sm">Latest Research Summaries</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Stay informed with AI-powered summaries of the latest scientific findings.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-0.5">
                    <span className="font-bold text-xs">4</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800 text-sm">Community Access</h3>
                    <p className="text-xs text-gray-600 mt-1">
                      Join our exclusive community of health enthusiasts sharing insights.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-center">
                <a
                  href="/profile"
                  className="px-4 py-2 bg-[#3294b4] text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors"
                >
                  Manage Your Subscription
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MOBILE VERSION - Canceled Subscription
  if (canceledSubscription && isMobile) {
    return (
      <div className="min-h-screen pt-16 bg-gray-50 px-3">
        <div className="mx-auto">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#3294b4] text-white p-4">
              <h1 className="text-xl font-bold">Reactivate Your Subscription</h1>
              <p className="text-xs opacity-80">Your subscription is currently canceled</p>
            </div>
            
            <div className="p-4">
              {reactivationSuccess ? (
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-800 mb-3">Subscription Reactivated!</h2>
                  <p className="text-gray-600 mb-4 text-sm">
                    Your subscription has been successfully reactivated. You now have full access to all premium features.
                  </p>
                  <a
                    href="/profile"
                    className="inline-block px-4 py-2 bg-[#3294b4] text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors"
                  >
                    Go to Your Account
                  </a>
                </div>
              ) : (
                <>
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                    <p className="text-sm text-yellow-700">
                      Your subscription was canceled but hasn't expired yet. You can reactivate it to continue your premium access without interruption.
                    </p>
                  </div>
                  
                  <h2 className="text-lg font-bold text-gray-800 mb-3">Reactivate Now</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    Reactivating your subscription will:
                  </p>
                  
                  <ul className="space-y-2 mb-4">
                    <li className="flex">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-700 text-sm">
                        Continue your access without interruption
                      </span>
                    </li>
                    <li className="flex">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-700 text-sm">
                        Use your existing payment method
                      </span>
                    </li>
                    <li className="flex">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-gray-700 text-sm">
                        Resume billing at your next scheduled payment date
                      </span>
                    </li>
                  </ul>
                  
                  {reactivationError && (
                    <div className="mb-4 p-2 bg-red-50 text-red-700 text-sm rounded-md">
                      {reactivationError}
                    </div>
                  )}
                  
                  <div className="flex flex-col space-y-3">
                    <button
                      className="w-full py-2 px-4 bg-[#3294b4] hover:bg-blue-600 text-white rounded-full text-sm font-medium transition-colors"
                      onClick={handleReactivateSubscription}
                      disabled={reactivating}
                    >
                      {reactivating ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span>
                      ) : "Reactivate My Subscription"}
                    </button>
                    <a
                      href="/profile"
                      className="py-2 px-4 border border-gray-300 text-gray-700 rounded-full text-sm font-medium text-center hover:bg-gray-50 transition-colors"
                    >
                      Return to Profile
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MOBILE VERSION - Upgrade Page  
  if (isMobile) {
    return (
      <div className="min-h-screen pt-16 bg-gray-50 px-3">
        {/* Header - Mobile */}
        <h1 className="text-xl font-bold text-center text-gray-800 mb-2">Upgrade to Premium</h1>
        <p className="text-center text-gray-600 text-sm mb-6">
          Access expert analysis, research data, and exclusive benefits
        </p>
        
        <div className="space-y-4">
          {/* Free Plan - Mobile */}
          <div className={`bg-white rounded-lg shadow-sm overflow-hidden ${!userSubscription ? "ring-1 ring-[#3294b4]" : ""}`}>
            <div className="bg-gray-200 p-4 text-gray-800">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-base font-bold mb-0.5">Free Plan</h2>
                  <div className="flex items-baseline">
                    <span className="text-xl font-bold">$0</span>
                    <span className="ml-1 text-xs opacity-80">forever</span>
                  </div>
                </div>
                {!userSubscription && (
                  <div className="bg-[#3294b4] text-white px-2 py-0.5 rounded-full text-xs">
                    Current Plan
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Free Features
                </h3>
                
                <ul className="space-y-2">
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Vendor Price Comparisons</strong> - See prices from various vendors
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Basic Information</strong> - Access fundamental details
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Community Reviews</strong> - Read and write reviews
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Regular Search</strong> - Basic search functionality
                    </span>
                  </li>
                </ul>
              </div>
              
              {!userSubscription ? (
                <div className="mt-4 text-center">
                  <span className="inline-block px-3 py-1.5 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                    Your Current Plan
                  </span>
                </div>
              ) : (
                <div className="mt-4 text-center">
                  <button 
                    onClick={() => console.log("Downgrade to free plan")} 
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full text-xs font-medium hover:bg-gray-50 transition-colors"
                  >
                    Downgrade to Free
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Premium Plan - Mobile */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="bg-[#3294b4] p-4 text-white">
              <h2 className="text-base font-bold mb-0.5">PepSource Premium</h2>
              <div className="flex items-baseline">
                <span className="text-xl font-bold">$10</span>
                <span className="ml-1 text-xs opacity-80">/ month</span>
              </div>
            </div>
            
            <div className="p-4">
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Premium Benefits
                </h3>
                
                <ul className="space-y-2">
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>AI-Powered Drug Discovery</strong> - Find the perfect compounds
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Vendor Quality Ratings</strong> - Expert analysis
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>New Vendor Reports</strong> - Expanding vendor database
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Price Efficiency Analysis</strong> - Find the best value
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Research Summaries</strong> - AI-powered analysis
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Side Effects Database</strong> - Comprehensive information
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700 text-xs">
                      <strong>Cancel Anytime</strong> - No long-term commitment
                    </span>
                  </li>
                </ul>
              </div>
              
              <div className="border-t border-gray-100 pt-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Pricing Summary
                </h3>
                
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monthly subscription</span>
                    <span className="text-gray-800 font-medium">$10.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax</span>
                    <span className="text-gray-800 font-medium">$0.00</span>
                  </div>
                  <div className="border-t border-gray-100 pt-1 mt-1">
                    <div className="flex justify-between font-semibold">
                      <span>Total due today</span>
                      <span className="text-[#3294b4]">$10.00</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Form - Mobile */}
          <div className="bg-white rounded-lg shadow-sm overflow-hidden p-4">
            <Elements stripe={stripePromise}>
              <SubscriptionForm isMobile={true} />
            </Elements>
          </div>
        </div>
      </div>
    );
  }

  // Skip showing the subscription options if user already has an active sub
  if (userSubscription) {
    return (
      <div className="min-h-screen pt-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-[#3294b4] text-white p-6">
              <h1 className="text-2xl font-bold">Active Subscription</h1>
              <p className="text-sm opacity-80">You already have an active PepSource Premium subscription</p>
            </div>
            
            <div className="p-6">
              <div className="flex items-center justify-center mb-6">
                <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              
              <h2 className="text-xl font-bold text-center mb-6">Your Premium Benefits</h2>
              
              <div className="grid gap-4 md:grid-cols-2 mb-6">
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">AI-Powered Drug Discovery</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Use our advanced AI search to find the perfect compounds tailored to your specific health goals.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">Vendor Ratings & Price Efficiency</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Access expert analysis of vendor quality and price comparisons.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">3</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">Latest Research Summaries</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Stay informed with AI-powered summaries of the latest scientific findings.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start p-4 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0 bg-[#3294b4] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 mt-0.5">
                    <span className="font-bold">4</span>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-800">Community Access</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Join our exclusive community of health enthusiasts sharing insights.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center">
                <a
                  href="/profile"
                  className="px-6 py-3 bg-[#3294b4] text-white rounded-full font-medium hover:bg-blue-600 transition-colors"
                >
                  Manage Your Subscription
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // DESKTOP VERSION - Original component (unchanged)
  return (
    <div className="min-h-screen pt-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <h1 className="text-3xl font-bold text-center text-gray-800 mb-2">Upgrade to PepSource Premium</h1>
        <p className="text-center text-gray-600 mb-8">
          Access expert analysis, comprehensive research data, and exclusive community benefits
        </p>
        
        <div className="grid md:grid-cols-3 gap-6">
          {/* Left side: Free Plan */}
          <div className={`bg-white rounded-lg shadow-md overflow-hidden ${!userSubscription ? "ring-2 ring-[#3294b4]" : ""}`}>
            <div className="bg-gray-200 p-6 text-gray-800">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold mb-1">Free Plan</h2>
                  <div className="flex items-baseline">
                    <span className="text-3xl font-bold">$0</span>
                    <span className="ml-1 text-sm opacity-80">forever</span>
                  </div>
                </div>
                {!userSubscription && (
                  <div className="bg-[#3294b4] text-white px-3 py-1 rounded-full text-sm">
                    Current Plan
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center text-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Free Features
                </h3>
                
                <ul className="space-y-3">
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Vendor Price Comparisons</strong> - See prices from various vendors
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Basic Compound Information</strong> - Access fundamental details about compounds
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Community Reviews</strong> - Read and write product reviews
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Regular Search</strong> - Basic search functionality
                    </span>
                  </li>
                </ul>
              </div>
              
              {!userSubscription ? (
                <div className="mt-6 text-center">
                  <span className="inline-block px-6 py-3 bg-gray-100 text-gray-800 rounded-full font-medium">
                    Your Current Plan
                  </span>
                </div>
              ) : (
                <div className="mt-6 text-center">
                  <button 
                    onClick={() => console.log("Downgrade to free plan")} 
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-50 transition-colors"
                  >
                    Downgrade to Free
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Middle: Premium Plan */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="bg-[#3294b4] p-6 text-white">
              <h2 className="text-xl font-bold mb-1">PepSource Premium</h2>
              <div className="flex items-baseline">
                <span className="text-3xl font-bold">$5</span>
                <span className="ml-1 text-sm opacity-80">/ month</span>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-6">
                <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Premium Benefits
                </h3>
                
                <ul className="space-y-3">
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>AI-Powered Drug Discovery</strong> - Find the perfect compounds for your health goals
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Vendor Quality Ratings</strong> - Make informed decisions with our expert analysis
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Access to New Vendor Reports</strong> - Get exclusive access to our constantly expanding vendor database
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Price Efficiency Analysis</strong> - Find the best value for your purchases
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Research Summaries</strong> - Access AI-powered analysis of scientific studies
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Side Effects Database</strong> - Comprehensive information on potential effects
                    </span>
                  </li>
                  <li className="flex">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">
                      <strong>Cancel Anytime</strong> - No long-term commitment required
                    </span>
                  </li>
                </ul>
              </div>
              
              <div className="border-t border-gray-100 pt-3">
                <h3 className="text-sm font-semibold mb-2 flex items-center text-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Pricing Summary
                </h3>
                
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monthly subscription</span>
                    <span className="text-gray-800 font-medium">$5.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tax</span>
                    <span className="text-gray-800 font-medium">$0.00</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 mt-2">
                    <div className="flex justify-between font-semibold">
                      <span>Total due today</span>
                      <span className="text-[#3294b4]">$5.00</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right side: payment form */}
          <div className="flex items-start justify-center">
            <Elements stripe={stripePromise}>
              <SubscriptionForm isMobile={false} />
            </Elements>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentPage;