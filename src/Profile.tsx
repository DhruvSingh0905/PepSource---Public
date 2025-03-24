import { useState, useEffect } from 'react';
import { supabase } from "../supabaseClient";
import pfp from "./assets/pfp.jpg";
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
    status: string;
    message?: string;
    subscriptionId?: string;
    nextPaymentDate?: string;
    paymentMethod?: PaymentMethod | null;
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

function Profile() {
    const [user, setUser] = useState<User | null>(null);
    const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [subscriptionLoading, setSubscriptionLoading] = useState<boolean>(true);
    const [transactionsLoading, setTransactionsLoading] = useState<boolean>(true);
    const [cancellingSubscription, setCancellingSubscription] = useState<boolean>(false);

    useEffect(() => {
        // Retrieve user from Supabase
        async function fetchUser() {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    let userData = user.user_metadata as User;
                    userData.id = user.id;
                    
                    const { data: preferences } = await axios.get(`${apiUrl}/api/getUser`, {
                        params: { id: userData.id },
                    });
                    
                    userData.preferences = preferences.user_info.preferences;
                    setUser(userData);
                    
                    // Fetch subscription info
                    setSubscriptionLoading(true);
                    try {
                        const { data } = await axios.get(`${apiUrl}/api/getSubscriptionInfo`, {
                            params: { id: user.id },
                        });
                        setSubscriptionInfo(data);
                        
                        // If subscription is active, fetch transaction history
                        if (data.status === "active") {
                            setTransactionsLoading(true);
                            try {
                                const { data: transactionData } = await axios.get(`${apiUrl}/api/transaction-history`, {
                                    params: { user_id: user.id },
                                });
                                
                                if (transactionData.status === "success") {
                                    setTransactions(transactionData.transactions);
                                }
                            } catch (error) {
                                console.error("Error fetching transaction history:", error);
                            } finally {
                                setTransactionsLoading(false);
                            }
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
    }, []);

    async function onCancelSubscription() {
        if (!user) return;
        
        setCancellingSubscription(true);
        try {
            const { data } = await axios.post(`${apiUrl}/api/cancelSubscription`, {
                id: user.id,
            });
            console.log("Subscription canceled:", data);
            // Set subscription to inactive after cancellation
            setSubscriptionInfo({ status: "inactive", message: "Subscription has been canceled" });
            // Clear transactions
            setTransactions([]);
        } catch (error) {
            console.error("Error canceling subscription:", error);
        } finally {
            setCancellingSubscription(false);
        }
    }

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
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="mb-4 pb-4 border-b border-gray-200">
                                    <div className="flex items-center mb-1">
                                        <span className="font-medium text-gray-700 w-40">Status:</span>
                                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Active</span>
                                    </div>
                                    <div className="flex items-center">
                                        <span className="font-medium text-gray-700 w-40">Next Payment:</span>
                                        <span className="text-gray-800">{subscriptionInfo.nextPaymentDate}</span>
                                    </div>
                                </div>
                                
                                {subscriptionInfo.paymentMethod && (
                                    <div className="mb-4">
                                        <div className="flex items-center">
                                            <span className="font-medium text-gray-700 w-40">Payment Method:</span>
                                            <div className="flex items-center">
                                                <span className="capitalize mr-2">{subscriptionInfo.paymentMethod.brand}</span>
                                                <span className="text-gray-800">
                                                    •••• {subscriptionInfo.paymentMethod.last4}
                                                </span>
                                                <span className="text-gray-500 text-sm ml-2">
                                                    (Expires {subscriptionInfo.paymentMethod.exp_month}/{subscriptionInfo.paymentMethod.exp_year})
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                <button
                                    className={`mt-4 px-4 py-2 rounded-full text-sm font-medium transition-colors
                                        ${cancellingSubscription 
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                    onClick={onCancelSubscription}
                                    disabled={cancellingSubscription}
                                >
                                    {cancellingSubscription ? (
                                        <span className="flex items-center">
                                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-red-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            Processing...
                                        </span>
                                    ) : (
                                        'Cancel Subscription'
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <div className="flex items-center mb-2">
                                    <span className="font-medium text-gray-700 w-40">Status:</span>
                                    <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full">Inactive</span>
                                </div>
                                {subscriptionInfo?.message && (
                                    <p className="text-gray-600 mb-4">{subscriptionInfo.message}</p>
                                )}
                                <p className="text-gray-700 mb-4">You don't have an active subscription.</p>
                                <a 
                                    href="/subscription" 
                                    className="px-4 py-2 bg-[#3294b4] text-white rounded-full inline-block text-sm font-medium hover:bg-blue-600 transition-colors"
                                >
                                    Upgrade your account
                                </a>
                            </div>
                        )}
                    </div>
                    
                    {/* Transaction History Section - Only shown if subscription is active */}
                    {subscriptionInfo && subscriptionInfo.status === "active" && (
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