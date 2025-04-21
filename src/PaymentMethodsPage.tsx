import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, CardElement } from "@stripe/react-stripe-js";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

// Load Stripe public key
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// Fetch user from Supabase
async function fetchUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user || null;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  isDefault: boolean;
}

// Implement a custom AxiosError interface
interface AxiosErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
}
const apiUrl: string = import.meta.env.VITE_BACKEND_PRODUCTION_URL;
const apiSecret:string = import.meta.env.VITE_PEPSECRET;
// PaymentMethodForm component
const PaymentMethodForm: React.FC<{isMobile: boolean}> = ({ isMobile }) => {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [paymentMethodToDelete, setPaymentMethodToDelete] = useState<string | null>(null);
  

  // Fetch existing payment methods
  useEffect(() => {
    async function fetchPaymentMethods() {
      setLoadingMethods(true);
      try {
        const user = await fetchUser();
        if (user) {
          const { data } = await axios.get(`${apiUrl}/api/payment-methods`, {
            headers:{'Authorization': `Bearer ${apiSecret}`,},
            params: { user_id: user.id }
          });
          
          if (data.status === "success" && data.payment_methods) {
            // Filter unique payment methods by card fingerprint or last4+brand combination
            const uniqueMethods: PaymentMethod[] = [];
            const seenKeys = new Set<string>();
            
            data.payment_methods.forEach((method: PaymentMethod) => {
              // Create a unique key for each payment method
              const key = `${method.brand}-${method.last4}-${method.exp_month}-${method.exp_year}`;
              
              // Only add if we haven't seen this key before
              if (!seenKeys.has(key)) {
                seenKeys.add(key);
                uniqueMethods.push(method);
              } else {
                // If this is a default method, ensure the default flag is set on the unique one
                if (method.isDefault) {
                  const existingMethod = uniqueMethods.find(m => 
                    `${m.brand}-${m.last4}-${m.exp_month}-${m.exp_year}` === key
                  );
                  if (existingMethod) {
                    existingMethod.isDefault = true;
                  }
                }
              }
            });
            
            setPaymentMethods(uniqueMethods);
          }
        }
      } catch (error) {
        console.error("Error fetching payment methods:", error);
      } finally {
        setLoadingMethods(false);
      }
    }
    
    fetchPaymentMethods();
  }, [apiUrl]);

  const handleAddPaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setMessage("");
    setSuccess(false);

    try {
      const user = await fetchUser();
      if (!user) {
        setMessage("User not found. Please log in again.");
        setLoading(false);
        return;
      }

      // Create PaymentMethod
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        setMessage("Card element not found.");
        setLoading(false);
        return;
      }
      
      const paymentMethodResult = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
      });

      if (paymentMethodResult.error) {
        setMessage(paymentMethodResult.error.message || "Error creating payment method");
        setLoading(false);
        return;
      }

      const paymentMethodId = paymentMethodResult.paymentMethod?.id;
      if (!paymentMethodId) {
        setMessage("Failed to create payment method");
        setLoading(false);
        return;
      }

      // Call backend to attach the payment method to customer
      const response = await axios.post(`${apiUrl}/api/update-payment-method`, {
        headers:{'Authorization': `Bearer ${apiSecret}`,},
        user_id: user.id,
        payment_method_id: paymentMethodId,
        set_as_default: true
      });

      if (response.data.status === "success") {
        setSuccess(true);
        setMessage("Payment method updated successfully!");
        
        // Refresh payment methods list
        const { data } = await axios.get(`${apiUrl}/api/payment-methods`, {
          headers:{'Authorization': `Bearer ${apiSecret}`,},
          params: { user_id: user.id }
        });
        
        if (data.status === "success" && data.payment_methods) {
          setPaymentMethods(data.payment_methods);
        }
      } else {
        setMessage(response.data.message || "An error occurred");
      }
    } catch (error: unknown) {
      const axiosError = error as AxiosErrorResponse;
      setMessage(axiosError.response?.data?.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefaultPaymentMethod = async (paymentMethodId: string) => {
    try {
      setLoading(true);
      const user = await fetchUser();
      if (!user) {
        setMessage("User not found. Please log in again.");
        setLoading(false);
        return;
      }
      
      const response = await axios.post(`${apiUrl}/api/set-default-payment-method`, {
        headers:{'Authorization': `Bearer ${apiSecret}`,},
        user_id: user.id,
        payment_method_id: paymentMethodId
      });
      
      if (response.data.status === "success") {
        // Update the local state to reflect the change
        const updatedMethods = paymentMethods.map(method => ({
          ...method,
          isDefault: method.id === paymentMethodId
        }));
        
        setPaymentMethods(updatedMethods);
        setMessage("Default payment method updated");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error: unknown) {
      const axiosError = error as AxiosErrorResponse;
      setMessage(axiosError.response?.data?.message || "Failed to update default payment method");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    setPaymentMethodToDelete(paymentMethodId);
    setShowDeleteModal(true);
  };

  const confirmDeletePaymentMethod = async () => {
    if (!paymentMethodToDelete) return;
    
    try {
      setLoading(true);
      const user = await fetchUser();
      if (!user) {
        setMessage("User not found. Please log in again.");
        setLoading(false);
        setShowDeleteModal(false);
        return;
      }
      
      const response = await axios.post(`${apiUrl}/api/delete-payment-method`, {
        headers:{'Authorization': `Bearer ${apiSecret}`,},
        user_id: user.id,
        payment_method_id: paymentMethodToDelete
      });
      
      if (response.data.status === "success") {
        // Remove the deleted method from local state
        const updatedMethods = paymentMethods.filter(method => method.id !== paymentMethodToDelete);
        setPaymentMethods(updatedMethods);
        setMessage("Payment method deleted");
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error: unknown) {
      const axiosError = error as AxiosErrorResponse;
      setMessage(axiosError.response?.data?.message || "Failed to delete payment method");
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setPaymentMethodToDelete(null);
    }
  };

  // MOBILE VERSION
  if (isMobile) {
    return (
      <div className="w-full">
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100 mb-4">
          <h3 className="text-base font-bold text-gray-800 mb-3">Your Payment Methods</h3>
          
          {loadingMethods ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3294b4]"></div>
              <span className="ml-2 text-gray-600 text-sm">Loading payment methods...</span>
            </div>
          ) : paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.map((method) => (
                <div key={method.id} className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <div className="flex items-center">
                        <span className="text-gray-800 capitalize">{method.brand}</span>
                        <span className="ml-1 text-gray-600">•••• {method.last4}</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        Expires {method.exp_month}/{method.exp_year}
                      </div>
                    </div>
                    {method.isDefault && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  
                  <div className="flex space-x-2 mt-2">
                    {!method.isDefault && (
                      <button
                        onClick={() => handleSetDefaultPaymentMethod(method.id)}
                        className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                        disabled={loading}
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePaymentMethod(method.id)}
                      className="px-2 py-1 text-xs border border-red-300 rounded text-red-700 hover:bg-red-50 transition-colors"
                      disabled={loading || method.isDefault}
                    >
                      {method.isDefault ? "Cannot Delete Default" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-sm py-2">No payment methods found</p>
          )}
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <h3 className="text-base font-bold text-gray-800 mb-3">
            {paymentMethods.length > 0 ? "Add New Payment Method" : "Add Payment Method"}
          </h3>
          
          <form onSubmit={handleAddPaymentMethod} className="space-y-4">
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

            {message && (
              <div className={`p-2 rounded text-xs ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message}
              </div>
            )}

            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={!stripe || loading}
                className="flex-1 py-2 px-4 rounded-full text-white text-sm font-medium bg-[#3294b4] hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : "Add Payment Method"}
              </button>
              
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="py-2 px-4 border border-gray-300 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
        
        {/* Delete confirmation modal */}
        <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center ${showDeleteModal ? '' : 'hidden'}`}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-red-50 p-4 border-b border-red-100">
              <h3 className="text-lg font-bold text-red-700">Delete Payment Method</h3>
            </div>
            <div className="p-4">
              <p className="text-gray-700 mb-4">
                Are you sure you want to delete this payment method? This action cannot be undone.
              </p>
              
              {/* Find the payment method to show its details */}
              {paymentMethodToDelete && paymentMethods.find(m => m.id === paymentMethodToDelete) && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <span className="font-medium capitalize">
                      {paymentMethods.find(m => m.id === paymentMethodToDelete)?.brand}
                    </span>
                    <span className="ml-2 text-gray-600">
                      •••• {paymentMethods.find(m => m.id === paymentMethodToDelete)?.last4}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Expires {paymentMethods.find(m => m.id === paymentMethodToDelete)?.exp_month}/
                    {paymentMethods.find(m => m.id === paymentMethodToDelete)?.exp_year}
                  </div>
                </div>
              )}
              
              <div className={`${isMobile ? 'flex flex-col space-y-2' : 'flex justify-end space-x-3'}`}>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className={`${isMobile ? 'w-full' : ''} px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors`}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeletePaymentMethod}
                  className={`${isMobile ? 'w-full' : ''} px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors`}
                  disabled={loading}
                >
                  {loading ? 
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </span>
                    : "Delete Payment Method"
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // DESKTOP VERSION
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="grid gap-6">
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">Your Payment Methods</h3>
          
          {loadingMethods ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3294b4]"></div>
              <span className="ml-3 text-gray-600">Loading payment methods...</span>
            </div>
          ) : paymentMethods.length > 0 ? (
            <div className="space-y-4">
              {paymentMethods.map((method) => (
                <div key={method.id} className="p-4 border border-gray-200 rounded-lg flex justify-between items-center">
                  <div>
                    <div className="flex items-center">
                      <span className="text-gray-800 font-medium capitalize">{method.brand}</span>
                      <span className="ml-2 text-gray-600">•••• {method.last4}</span>
                      {method.isDefault && (
                        <span className="ml-3 px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      Expires {method.exp_month}/{method.exp_year}
                    </div>
                  </div>
                  
                  <div className="flex space-x-3">
                    {!method.isDefault && (
                      <button
                        onClick={() => handleSetDefaultPaymentMethod(method.id)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                        disabled={loading}
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      onClick={() => handleDeletePaymentMethod(method.id)}
                      className="px-3 py-1.5 text-sm border border-red-300 rounded text-red-700 hover:bg-red-50 transition-colors"
                      disabled={loading || method.isDefault}
                    >
                      {method.isDefault ? "Cannot Delete Default" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 py-4">No payment methods found</p>
          )}
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            {paymentMethods.length > 0 ? "Add New Payment Method" : "Add Payment Method"}
          </h3>
          
          <form onSubmit={handleAddPaymentMethod} className="space-y-6">
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

            {message && (
              <div className={`p-3 rounded ${success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                {message}
              </div>
            )}

            <div className="flex space-x-4">
              <button
                type="submit"
                disabled={!stripe || loading}
                className="flex-1 py-2 px-4 rounded-full text-white font-medium bg-[#3294b4] hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                ) : "Add Payment Method"}
              </button>
              
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="py-2 px-4 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-50 transition-colors"
              >
                Return to Profile
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Delete confirmation modal */}
      <div className={`fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center ${showDeleteModal ? '' : 'hidden'}`}>
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="bg-red-50 p-4 border-b border-red-100">
            <h3 className="text-lg font-bold text-red-700">Delete Payment Method</h3>
          </div>
          <div className="p-4">
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete this payment method? This action cannot be undone.
            </p>
            
            {/* Find the payment method to show its details */}
            {paymentMethodToDelete && paymentMethods.find(m => m.id === paymentMethodToDelete) && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="font-medium capitalize">
                    {paymentMethods.find(m => m.id === paymentMethodToDelete)?.brand}
                  </span>
                  <span className="ml-2 text-gray-600">
                    •••• {paymentMethods.find(m => m.id === paymentMethodToDelete)?.last4}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  Expires {paymentMethods.find(m => m.id === paymentMethodToDelete)?.exp_month}/
                  {paymentMethods.find(m => m.id === paymentMethodToDelete)?.exp_year}
                </div>
              </div>
            )}
            
            <div className={`${isMobile ? 'flex flex-col space-y-2' : 'flex justify-end space-x-3'}`}>
              <button
                onClick={() => setShowDeleteModal(false)}
                className={`${isMobile ? 'w-full' : ''} px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors`}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletePaymentMethod}
                className={`${isMobile ? 'w-full' : ''} px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors`}
                disabled={loading}
              >
                {loading ? 
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </span>
                  : "Delete Payment Method"
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main PaymentMethodsPage component
const PaymentMethodsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  const navigate = useNavigate();
  
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
    async function checkAuthentication() {
      setLoading(true);
      try {
        const user = await fetchUser();
        if (!user) {
          // Redirect to login if no user
          navigate('/login');
        }
      } catch (error) {
        console.error("Error checking authentication:", error);
        navigate('/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuthentication();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3294b4]"></div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isMobile ? 'pt-16' : 'pt-20'} bg-gray-50 px-3`}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-[#3294b4] text-white p-6 rounded-t-lg shadow-md">
          <h1 className={`${isMobile ? 'text-xl' : 'text-2xl'} font-bold`}>Payment Methods</h1>
          <p className="text-sm opacity-80 mt-1">Manage your payment details</p>
        </div>
        
        {/* Main Content */}
        <div className="bg-white rounded-b-lg shadow-md overflow-hidden p-6">
          <Elements stripe={stripePromise}>
            <PaymentMethodForm isMobile={isMobile} />
          </Elements>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodsPage; 