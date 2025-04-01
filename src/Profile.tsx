import { useState, useEffect } from 'react';
import { supabase } from "../supabaseClient";
import pfp from "./assets/pfp.jpg";
import axios from "axios";
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

function Profile() {
    const [user, setUser] = useState<User | null>(null);
    const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [subscriptionLoading, setSubscriptionLoading] = useState<boolean>(true);
    const [transactionsLoading, setTransactionsLoading] = useState<boolean>(true);
    
    // Add state for tracking screen width
    const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
    const apiUrl: string = import.meta.env.VITE_BACKEND_PRODUCTION_URL;
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
        // Retrieve user from Supabase
        async function fetchUser() {
            setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const userData = user.user_metadata as User;
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
                        
                        // Fetch transaction history regardless of subscription status
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
                                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Active</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="font-medium text-gray-700 w-32 text-sm">Next Payment:</span>
                                            <span className="text-gray-800 text-sm">{subscriptionInfo.nextPaymentDate}</span>
                                        </div>
                                    </div>
                                    
                                    {subscriptionInfo.paymentMethod && (
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
                                        </div>
                                    )}
                                    
                                    <button
                                        className="mt-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                                        onClick={() => navigate('/cancel-subscription')}
                                    >
                                        Cancel Subscription
                                    </button>
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
                                    className="mt-4 px-4 py-2 rounded-full text-sm font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200"
                                    onClick={() => navigate('/cancel-subscription')}
                                >
                                    Cancel Subscription
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