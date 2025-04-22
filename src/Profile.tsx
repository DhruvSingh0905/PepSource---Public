import { useState, useEffect } from 'react';
import { supabase } from "../supabaseClient";
import pfp from "./assets/pfp.jpg";
import { useNavigate } from 'react-router-dom';

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
    status: string;
    message?: string;
    subscriptionId?: string;
    nextPaymentDate?: string;
    paymentMethod?: PaymentMethod | null;
    isCanceled: boolean;
}

interface Transaction {
    id: string;
    date: string;
    amount: number;
    currency: string;
    description: string;
    status: string;
    receipt_url: string;
}

const apiUrl:string = import.meta.env.VITE_BACKEND_PRODUCTION_URL; //import.meta.env.VITE_BACKEND_DEV_URL
const apiSecret:string = import.meta.env.VITE_PEPSECRET;

function Profile() {
    const [user, setUser] = useState<User | null>(null);
    const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [subscriptionLoading, setSubscriptionLoading] = useState<boolean>(true);
    const [transactionsLoading, setTransactionsLoading] = useState<boolean>(true);
    
    // Add state for tracking screen width
    const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
    const navigate = useNavigate();
    
    // Add state for reactivation functionality
    const [updatingSubscription, setUpdatingSubscription] = useState<boolean>(false);
    const [subscriptionUpdateSuccess, setSubscriptionUpdateSuccess] = useState<string>("");
    const [subscriptionUpdateError, setSubscriptionUpdateError] = useState<string>("");
    
    // Add state for payment method warnings
    const [paymentMethodWarning, setPaymentMethodWarning] = useState<string | null>(null);
    
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
        // Retrieve user from Supabase
        async function fetchUser() {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const userData = user.user_metadata as User;
                    userData.id = user.id;
                    
                    const response = await fetch(
                        `${apiUrl}/api/getUser?id=${encodeURIComponent(userData.id)}`,
                        {
                          method: 'GET',
                          headers: {
                            'Authorization': `Bearer ${apiSecret}`,
                          },
                        }
                      );
                      
                      // (Optional) check for errors
                    if (!response.ok) {
                        const errText = await response.text();
                        throw new Error(`Request failed (${response.status}): ${errText}`);
                    }
                      
                      const preferences = await response.json();
                    
                    userData.preferences = preferences.user_info.preferences;
                    setUser(userData);
                    
                    // Fetch subscription info
                    setSubscriptionLoading(true);
                    try {
                        const response = await fetch(
                            `${apiUrl}/api/getSubscriptionInfo?id=${encodeURIComponent(user.id)}`,
                            {
                              method: 'GET',
                              headers: {
                                'Authorization': `Bearer ${apiSecret}`,
                              },
                            }
                          );
                          
                          // (Optional) error handling
                        if (!response.ok) {
                            const errText = await response.text();
                            throw new Error(`Request failed (${response.status}): ${errText}`);
                        }
                          
                        const data = await response.json();
                        
                        setSubscriptionInfo(data);
                        
                        // Fetch transaction history regardless of subscription status
                        setTransactionsLoading(true);
                        try {
                            const response = await fetch(
                                `${apiUrl}/api/transaction-history?user_id=${encodeURIComponent(user.id)}`,
                                {
                                  method: 'GET',
                                  headers: {
                                    'Authorization': `Bearer ${apiSecret}`,
                                  },
                                }
                              );
                              
                              // (Optional) error handling
                            if (!response.ok) {
                                const errText = await response.text();
                                throw new Error(`Request failed (${response.status}): ${errText}`);
                            }
                              
                            const transactionData = await response.json();
                            
                            if (transactionData.status === "success") {
                                setTransactions(transactionData.transactions);
                            }
                        } catch (error) {
                            console.error("Error fetching transaction history:", error);
                        } finally {
                            setTransactionsLoading(false);
                        }
                    } catch (error) {
                        console.error("Error fetching subscription info:", error);
                    } finally {
                        setSubscriptionLoading(false);
                    }
                }
            } catch (error) {
                console.error("Error fetching user:", error);
            } finally {
                setLoading(false);
            }
        }
        
        fetchUser();
    }, [apiUrl]);

    // Update the reactivation function to handle payment warnings
    const handleReactivateSubscription = async () => {
        if (!user) return;
        
        try {
            setUpdatingSubscription(true);
            setPaymentMethodWarning(null);
            
            const response = await fetch(`${apiUrl}/api/reactivateSubscription`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiSecret}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ id: user.id }),
              });
              
            // (Optional) check for errors
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Request failed (${response.status}): ${errText}`);
            }
            
            const data = await response.json();
            
            if (data.status === "success") {
                // Check if there's a payment method warning
                if (data.warning) {
                    setPaymentMethodWarning(data.warning);
                }
                
                // Fetch updated subscription information
                const response = await fetch(
                    `${apiUrl}/api/getSubscriptionInfo?id=${encodeURIComponent(user.id)}`,
                    {
                      method: 'GET',
                      headers: {
                        'Authorization': `Bearer ${apiSecret}`,
                      },
                    }
                  );
                  
                  // (Optional) check for errors
                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Request failed (${response.status}): ${errText}`);
                }
                  
                  const updatedSubscription = await response.json();
                
                setSubscriptionInfo(updatedSubscription);
                setSubscriptionUpdateSuccess("Your subscription has been successfully reactivated.");
                
                // Clear success message after 5 seconds
                setTimeout(() => {
                    setSubscriptionUpdateSuccess("");
                }, 5000);
            }
        } catch (error) {
            console.error("Error reactivating subscription:", error);
            setSubscriptionUpdateError("Failed to reactivate your subscription. Please try again or contact support.");
            
            // Clear error message after 5 seconds
            setTimeout(() => {
                setSubscriptionUpdateError("");
            }, 5000);
        } finally {
            setUpdatingSubscription(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen pt-20 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3294b4]"></div>
            </div>
        );
    }

    // Helper function to format currency
    const formatCurrency = (amount: number, currency: string) => {
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', 
            currency: currency || 'USD' 
        }).format(amount);
    };

    // MOBILE VERSION
    if (isMobile) {
        return (
            <div className="min-h-screen pt-16 px-3 bg-gray-50">
                <div className="mx-auto">
                    {/* Header Section - Mobile */}
                    <div className="bg-[#3294b4] text-white p-4 rounded-t-lg shadow-sm">
                        <h1 className="text-xl font-bold">Your Account</h1>
                        <p className="text-xs opacity-80 mt-1">Manage your profile and subscription</p>
                    </div>
                    
                    {/* Main Content - Mobile */}
                    <div className="bg-white rounded-b-lg shadow-sm overflow-hidden">
                        {/* Profile Section - Mobile */}
                        <div className="p-4 border-b border-gray-200">
                            <div className="flex items-center">
                                <img
                                    src={pfp}
                                    alt="Profile"
                                    className="w-16 h-16 rounded-full object-cover border-2 border-[#3294b4]"
                                />
                                <div className="ml-4">
                                    <h2 className="text-lg font-bold text-gray-800">{user?.name}</h2>
                                    <p className="text-sm text-gray-600">{user?.email}</p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Preferences Section - Mobile */}
                        <div className="p-4 border-b border-gray-200">
                            <h3 className="text-base font-semibold mb-3 text-[#3294b4] flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                Interested In
                            </h3>
                            
                            {user?.preferences && user.preferences.length > 0 ? (
                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <ul className="space-y-2">
                                        {user.preferences.map((pref, index) => (
                                            <li key={index} className="flex items-center">
                                                <span className="w-5 h-5 flex items-center justify-center bg-[#3294b4] text-white rounded-full text-xs mr-2">
                                                    {index + 1}
                                                </span>
                                                <span className="text-gray-700 text-sm">{pref}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="text-gray-500 italic text-sm">No preferences set</p>
                            )}
                        </div>
                        
                        {/* Subscription Section - Mobile */}
                        <div className="p-4 border-b border-gray-200">
                            <h3 className="text-base font-semibold mb-3 text-[#3294b4] flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                </svg>
                                Subscription Information
                            </h3>
                            
                            {subscriptionLoading ? (
                                <div className="flex items-center justify-center py-6">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3294b4]"></div>
                                    <span className="ml-3 text-gray-600 text-sm">Loading subscription details...</span>
                                </div>
                            ) : subscriptionInfo && subscriptionInfo.status === "active" ? (
                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <div className="mb-3 pb-3 border-b border-gray-200">
                                        <div className="flex items-center mb-1">
                                            <span className="font-medium text-gray-700 w-32 text-sm">Status:</span>
                                            {subscriptionInfo.isCanceled ? (
                                                <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                                                    Canceled
                                                </span>
                                            ) : (
                                                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center">
                                            <span className="font-medium text-gray-700 w-32 text-sm">
                                                {subscriptionInfo.isCanceled ? "Access Until:" : "Next Payment:"}
                                            </span>
                                            <span className="text-gray-800 text-sm">{subscriptionInfo.nextPaymentDate}</span>
                                        </div>
                                    </div>
                                    
                                    {/* Display success/error messages */}
                                    {subscriptionUpdateSuccess && (
                                        <div className="mb-3 px-2 py-1.5 bg-green-50 text-green-600 text-sm rounded">
                                            {subscriptionUpdateSuccess}
                                        </div>
                                    )}
                                    {subscriptionUpdateError && (
                                        <div className="mb-3 px-2 py-1.5 bg-red-50 text-red-600 text-sm rounded">
                                            {subscriptionUpdateError}
                                        </div>
                                    )}
                                    
                                    {/* Message about cancellation status if applicable */}
                                    {subscriptionInfo.isCanceled && subscriptionInfo.message && (
                                        <div className="mb-3 pb-3 border-b border-gray-200">
                                            <p className="text-sm text-orange-700">{subscriptionInfo.message}</p>
                                        </div>
                                    )}

                                    {subscriptionInfo?.paymentMethod && (
                                        <div className="mb-3">
                                            <div className="flex items-center">
                                                <span className="font-medium text-gray-700 w-32 text-sm">Payment Method:</span>
                                                <div className="text-sm">
                                                    <span className="capitalize mr-1">{subscriptionInfo.paymentMethod.brand}</span>
                                                    <span className="text-gray-800">
                                                        •••• {subscriptionInfo.paymentMethod.last4}
                                                    </span>
                                                    <div className="text-gray-500 text-xs mt-1">
                                                        (Expires {subscriptionInfo.paymentMethod.exp_month}/{subscriptionInfo.paymentMethod.exp_year})
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => navigate('/payment-methods')}
                                                className="mt-2 w-full py-1.5 px-3 border border-[#3294b4] text-[#3294b4] rounded-full text-xs font-medium hover:bg-blue-50 transition-colors"
                                            >
                                                Update Payment Method
                                            </button>
                                        </div>
                                    )}
                                    
                                    {/* Conditionally show either Cancel or Reactivate button */}
                                    {subscriptionInfo.isCanceled ? (
                                        <button
                                            className="mt-2 px-3 py-1.5 bg-[#3294b4] text-white rounded-full text-xs font-medium hover:bg-blue-600 transition-colors w-full"
                                            onClick={handleReactivateSubscription}
                                            disabled={updatingSubscription}
                                        >
                                            {updatingSubscription ? (
                                                <span className="flex items-center justify-center">
                                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Processing...
                                                </span>
                                            ) : "Reactivate Subscription"}
                                        </button>
                                    ) : (
                                        <button
                                            className="mt-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                                            onClick={() => navigate('/cancel-subscription')}
                                        >
                                            Cancel Subscription
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-gray-50 p-3 rounded-lg">
                                    <div className="flex items-center mb-2">
                                        <span className="font-medium text-gray-700 w-32 text-sm">Status:</span>
                                        <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">Inactive</span>
                                    </div>
                                    {subscriptionInfo?.message && (
                                        <p className="text-gray-600 mb-3 text-sm">{subscriptionInfo.message}</p>
                                    )}
                                    <p className="text-gray-700 mb-3 text-sm">You don't have an active subscription.</p>
                                    <a 
                                        href="/subscription" 
                                        className="px-3 py-1.5 bg-[#3294b4] text-white rounded-full inline-block text-xs font-medium hover:bg-blue-600 transition-colors"
                                    >
                                        Upgrade your account
                                    </a>
                                </div>
                            )}

                            {/* Add this inside the mobile subscription section */}
                            {paymentMethodWarning && (
                                <div className="mt-3 mb-3 p-2 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 text-sm">
                                    <div className="flex">
                                        <svg className="h-5 w-5 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        <span>{paymentMethodWarning}</span>
                                    </div>
                                    <div className="mt-2">
                                        <button 
                                            className="text-xs bg-yellow-500 text-white py-1 px-2 rounded hover:bg-yellow-600 transition-colors"
                                            onClick={() => navigate('/payment-methods')}
                                        >
                                            Update Payment Method
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Transaction History Section - Mobile - Only shown if subscription is active */}
                        {transactions && transactions.length > 0 && (
                            <div className="p-4">
                                <h3 className="text-base font-semibold mb-3 text-[#3294b4] flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Transaction History
                                </h3>
                                
                                {transactionsLoading ? (
                                    <div className="flex items-center justify-center py-6">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3294b4]"></div>
                                        <span className="ml-3 text-gray-600 text-sm">Loading transaction history...</span>
                                    </div>
                                ) : transactions.length > 0 ? (
                                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                                        {/* Mobile transaction cards instead of table */}
                                        <div className="space-y-3 p-3">
                                            {transactions.map((transaction) => (
                                                <div key={transaction.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div className="text-sm font-medium text-gray-800">
                                                            {formatCurrency(transaction.amount, transaction.currency)}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {transaction.date}
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-gray-700 mb-2">
                                                        {transaction.description}
                                                    </div>
                                                    <a 
                                                        href={transaction.receipt_url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="text-[#3294b4] text-xs hover:text-blue-700 transition-colors"
                                                    >
                                                        View Receipt →
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-gray-500 italic text-sm">No transaction history available</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // DESKTOP VERSION - Original component remains unchanged
    return (
        <div className="min-h-screen pt-20 px-4 bg-gray-50">
            <div className="max-w-4xl mx-auto">
                {/* Header Section */}
                <div className="bg-[#3294b4] text-white p-6 rounded-t-lg shadow-md">
                    <h1 className="text-2xl font-bold">Your Account</h1>
                    <p className="text-sm opacity-80 mt-1">Manage your profile and subscription</p>
                </div>
                
                {/* Main Content */}
                <div className="bg-white rounded-b-lg shadow-md overflow-hidden">
                    {/* Profile Section */}
                    <div className="p-6 border-b border-gray-200">
                        <div className="flex items-center">
                            <img
                                src={pfp}
                                alt="Profile"
                                className="w-20 h-20 rounded-full object-cover border-4 border-[#3294b4]"
                            />
                            <div className="ml-6">
                                <h2 className="text-xl font-bold text-gray-800">{user?.name}</h2>
                                <p className="text-gray-600">{user?.email}</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Preferences Section */}
                    <div className="p-6 border-b border-gray-200">
                        <h3 className="text-lg font-semibold mb-4 text-[#3294b4] flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            Interested In
                        </h3>
                        
                        {user?.preferences && user.preferences.length > 0 ? (
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <ul className="space-y-2">
                                    {user.preferences.map((pref, index) => (
                                        <li key={index} className="flex items-center">
                                            <span className="w-6 h-6 flex items-center justify-center bg-[#3294b4] text-white rounded-full text-xs mr-3">
                                                {index + 1}
                                            </span>
                                            <span className="text-gray-700">{pref}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-gray-500 italic">No preferences set</p>
                        )}
                    </div>
                    
                    {/* Subscription Section */}
                    <div className="p-6 border-b border-gray-200">
                        <h3 className="text-lg font-semibold mb-4 text-[#3294b4] flex items-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                            </svg>
                            Subscription Information
                        </h3>
                        
                        {subscriptionLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3294b4]"></div>
                                <span className="ml-3 text-gray-600">Loading subscription details...</span>
                            </div>
                        ) : subscriptionInfo && subscriptionInfo.status === "active" ? (
                            <>
                                <div className="mb-4 pb-4 border-b border-gray-200">
                                    <div className="flex items-center mb-1">
                                        <span className="font-medium text-gray-700 w-40">Status:</span>
                                        {subscriptionInfo.isCanceled ? (
                                            <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full">
                                                Canceled
                                            </span>
                                        ) : (
                                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center">
                                        <span className="font-medium text-gray-700 w-40">
                                            {subscriptionInfo.isCanceled ? "Access Until:" : "Next Payment:"}
                                        </span>
                                        <span className="text-gray-800">{subscriptionInfo.nextPaymentDate}</span>
                                    </div>
                                </div>
                                
                                {/* Display success/error messages */}
                                {subscriptionUpdateSuccess && (
                                    <div className="mb-4 px-3 py-2 bg-green-50 text-green-600 rounded">
                                        {subscriptionUpdateSuccess}
                                    </div>
                                )}
                                {subscriptionUpdateError && (
                                    <div className="mb-4 px-3 py-2 bg-red-50 text-red-600 rounded">
                                        {subscriptionUpdateError}
                                    </div>
                                )}
                                
                                {/* Message about cancellation status if applicable */}
                                {subscriptionInfo.isCanceled && subscriptionInfo.message && (
                                    <div className="mb-4 pb-4 border-b border-gray-200">
                                        <p className="text-orange-700">{subscriptionInfo.message}</p>
                                    </div>
                                )}

                                {subscriptionInfo?.paymentMethod && (
                                    <div className="mb-4">
                                        <div className="flex items-center">
                                            <span className="font-medium text-gray-700 w-40">Payment Method:</span>
                                            <div>
                                                <span className="capitalize mr-1">{subscriptionInfo.paymentMethod.brand}</span>
                                                <span className="text-gray-800">
                                                    •••• {subscriptionInfo.paymentMethod.last4}
                                                </span>
                                                <div className="text-gray-500 text-sm mt-1">
                                                    (Expires {subscriptionInfo.paymentMethod.exp_month}/{subscriptionInfo.paymentMethod.exp_year})
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-2 ml-40">
                                            <button
                                                onClick={() => navigate('/payment-methods')}
                                                className="py-1.5 px-4 border border-[#3294b4] text-[#3294b4] rounded-full text-sm font-medium hover:bg-blue-50 transition-colors"
                                            >
                                                Update Payment Method
                                            </button>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Conditionally show either Cancel or Reactivate button */}
                                {subscriptionInfo.isCanceled ? (
                                    <button
                                        className="mt-4 px-4 py-2 bg-[#3294b4] text-white rounded-full text-sm font-medium hover:bg-blue-600 transition-colors"
                                        onClick={handleReactivateSubscription}
                                        disabled={updatingSubscription}
                                    >
                                        {updatingSubscription ? (
                                            <span className="flex items-center justify-center">
                                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Processing...
                                            </span>
                                        ) : "Reactivate Subscription"}
                                    </button>
                                ) : (
                                    <button
                                        className="mt-4 px-4 py-2 rounded-full text-sm font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                                        onClick={() => navigate('/cancel-subscription')}
                                    >
                                        Cancel Subscription
                                    </button>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="mb-4 pb-4 border-b border-gray-200">
                                    <div className="flex items-center mb-1">
                                        <span className="font-medium text-gray-700 w-40">Status:</span>
                                        <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">Inactive</span>
                                    </div>
                                </div>
                                {subscriptionInfo?.message && (
                                    <p className="text-gray-600 mb-4">{subscriptionInfo.message}</p>
                                )}
                                <p className="text-gray-700 mb-4">You don't have an active subscription.</p>
                                <a 
                                    href="/subscription" 
                                    className="px-5 py-2 bg-[#3294b4] text-white rounded-full inline-block text-sm font-medium hover:bg-blue-600 transition-colors"
                                >
                                    Upgrade your account
                                </a>
                            </>
                        )}

                        {/* Add this inside the desktop subscription section */}
                        {paymentMethodWarning && (
                            <div className="mt-3 mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700">
                                <div className="flex">
                                    <svg className="h-6 w-6 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span>{paymentMethodWarning}</span>
                                </div>
                                <div className="mt-2">
                                    <button 
                                        className="text-sm bg-yellow-500 text-white py-1 px-3 rounded hover:bg-yellow-600 transition-colors"
                                        onClick={() => navigate('/payment-methods')}
                                    >
                                        Update Payment Method
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* Transaction History Section - Only shown if subscription is active */}
                    {transactions && transactions.length > 0 && (
                        <div className="p-6">
                            <h3 className="text-lg font-semibold mb-4 text-[#3294b4] flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                Transaction History
                            </h3>
                            
                            {transactionsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3294b4]"></div>
                                    <span className="ml-3 text-gray-600">Loading transaction history...</span>
                                </div>
                            ) : transactions.length > 0 ? (
                                <div className="bg-gray-50 rounded-lg overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-100">
                                                <tr>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Date
                                                    </th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Description
                                                    </th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Amount
                                                    </th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Receipt
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {transactions.map((transaction) => (
                                                    <tr key={transaction.id}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                            {transaction.date}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                                                            {transaction.description}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                                                            {formatCurrency(transaction.amount, transaction.currency)}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                            <a 
                                                                href={transaction.receipt_url} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                className="text-[#3294b4] hover:text-blue-700 transition-colors"
                                                            >
                                                                View Receipt
                                                            </a>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-500 italic">No transaction history available</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Profile;