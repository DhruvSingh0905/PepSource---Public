import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from "../supabaseClient";
import axios from "axios";

interface User {
    name: string;
    id: string;
    email: string;
    picture?: string;
    avatar_url?: string;
}

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
}

function CancelSubscription() {
    const [user, setUser] = useState<User | null>(null);
    const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [cancelStep, setCancelStep] = useState<number>(1);
    const [cancelReason, setCancelReason] = useState<string>("");
    const [otherReason, setOtherReason] = useState<string>("");
    const [isAgreementChecked, setIsAgreementChecked] = useState<boolean>(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
    const [cancellationProcessing, setCancellationProcessing] = useState<boolean>(false);
    const [cancellationError, setCancellationError] = useState<string>("");
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
        async function fetchUserAndSubscription() {
            setIsLoading(true);
            try {
                const { data: { user: authUser } } = await supabase.auth.getUser();
                if (authUser) {
                    const userData: User = {
                        name: authUser.user_metadata.name || '',
                        id: authUser.id,
                        email: authUser.email || '',
                        picture: authUser.user_metadata.picture,
                        avatar_url: authUser.user_metadata.avatar_url
                    };
                    setUser(userData);
                    
                    // Fetch subscription info
                    try {
                        const { data } = await axios.get(`${apiUrl}/api/getSubscriptionInfo`, {
                            params: { id: authUser.id },
                        });
                        
                        setSubscriptionInfo(data);
                        
                        // Redirect if no active subscription
                        if (data.status !== "active") {
                            navigate('/profile');
                        }
                    } catch (error) {
                        console.error("Error fetching subscription info:", error);
                        navigate('/profile');
                    }
                } else {
                    // Redirect if not logged in
                    navigate('/login');
                }
            } catch (error) {
                console.error("Error fetching user:", error);
                navigate('/login');
            } finally {
                setIsLoading(false);
            }
        }
        
        fetchUserAndSubscription();
    }, [apiUrl, navigate]);

    const handleCancelReason = (reason: string) => {
        setCancelReason(reason);
    };

    const proceedToConfirmation = () => {
        // Validate form before proceeding
        if (!cancelReason) {
            return;
        }
        
        if (cancelReason === "Other" && !otherReason.trim()) {
            return;
        }
        
        if (!isAgreementChecked) {
            return;
        }
        
        setShowConfirmDialog(true);
    };

    const handleCancellation = async () => {
        if (!user || !subscriptionInfo || !subscriptionInfo.subscriptionId) return;
        
        setCancellationProcessing(true);
        setCancellationError("");
        
        try {
            // Include cancellation reason in the request
            const finalReason = cancelReason === "Other" ? otherReason : cancelReason;
            
            const { data } = await axios.post(`${apiUrl}/api/cancelSubscription`, {
                id: user.id,
                reason: finalReason
            });
            
            if (data.status === "success") {
                // Get the current subscription end date before moving to success step
                try {
                    console.log("Cancellation successful, fetching updated subscription info");
                    const { data: updatedSubscription } = await axios.get(`${apiUrl}/api/getSubscriptionInfo`, {
                        params: { id: user.id },
                    });
                    console.log("Updated subscription info:", updatedSubscription);
                    setSubscriptionInfo(updatedSubscription);
                    // Now transition to success step
                    setCancelStep(3);
                } catch (error) {
                    console.error("Error fetching updated subscription info:", error);
                    // If we can't get updated info, still show success but use the original date
                    setCancelStep(3);
                }
            } else {
                setCancellationError("There was an issue processing your cancellation. Please try again or contact support.");
            }
        } catch (error) {
            console.error("Error canceling subscription:", error);
            setCancellationError("An unexpected error occurred. Please try again or contact support.");
        } finally {
            setCancellationProcessing(false);
            setShowConfirmDialog(false);
        }
    };

    // Add a new useEffect for logging when the cancel step changes to success
    useEffect(() => {
        if (cancelStep === 3) {
            console.log("Displaying success step with subscription info:", subscriptionInfo);
        }
    }, [cancelStep, subscriptionInfo]);

    if (isLoading) {
        return (
            <div className="min-h-screen pt-20 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#3294b4]"></div>
            </div>
        );
    }

    // Function to format dates nicely
    const formatDate = (dateString?: string) => {
        if (!dateString) return "";
        
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric'
        });
    };

    const containerClass = isMobile
        ? "min-h-screen pt-16 px-4 bg-gray-50"
        : "min-h-screen pt-20 px-4 bg-gray-50";

    const contentContainerClass = isMobile
        ? "max-w-full mx-auto"
        : "max-w-2xl mx-auto";

    return (
        <div className={containerClass}>
            <div className={contentContainerClass}>
                {/* Header */}
                <div className="bg-[#3294b4] text-white p-5 rounded-t-lg shadow-sm">
                    <h1 className={isMobile ? "text-xl font-bold" : "text-2xl font-bold"}>
                        Cancel Your Subscription
                    </h1>
                    <p className={isMobile ? "text-xs opacity-80 mt-1" : "text-sm opacity-80 mt-1"}>
                        We're sorry to see you go
                    </p>
                </div>
                
                {/* Main Content */}
                <div className="bg-white rounded-b-lg shadow-sm overflow-hidden p-5">
                    {/* Step 1: Confirm Cancellation Intent */}
                    {cancelStep === 1 && (
                        <div>
                            <div className="mb-6">
                                <h2 className="text-lg font-semibold text-gray-800 mb-2">
                                    Your Current Subscription
                                </h2>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <p className="text-sm text-gray-700 mb-2">
                                        <span className="font-medium">Status:</span>{" "}
                                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                                            Active
                                        </span>
                                    </p>
                                    <p className="text-sm text-gray-700 mb-2">
                                        <span className="font-medium">Next Payment Date:</span>{" "}
                                        {formatDate(subscriptionInfo?.nextPaymentDate)}
                                    </p>
                                    {subscriptionInfo?.paymentMethod && (
                                        <p className="text-sm text-gray-700">
                                            <span className="font-medium">Payment Method:</span>{" "}
                                            <span className="capitalize">
                                                {subscriptionInfo.paymentMethod.brand}
                                            </span>
                                            {" "}•••• {subscriptionInfo.paymentMethod.last4}
                                        </p>
                                    )}
                                </div>
                            </div>
                            
                            <div className="mb-6">
                                <h2 className="text-lg font-semibold text-gray-800 mb-3">
                                    Why are you canceling?
                                </h2>
                                <div className="space-y-2">
                                    {["Too expensive", "Not using enough", "Found a better alternative", "Technical issues", "Missing features", "Other"].map((reason) => (
                                        <div 
                                            key={reason}
                                            className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                                cancelReason === reason
                                                    ? 'border-[#3294b4] bg-blue-50'
                                                    : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                            onClick={() => handleCancelReason(reason)}
                                        >
                                            <div className="flex items-center">
                                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                                    cancelReason === reason
                                                        ? 'border-[#3294b4]'
                                                        : 'border-gray-300'
                                                }`}>
                                                    {cancelReason === reason && (
                                                        <div className="w-2 h-2 rounded-full bg-[#3294b4]"></div>
                                                    )}
                                                </div>
                                                <span className="ml-3 text-gray-700 text-sm">{reason}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                {cancelReason === "Other" && (
                                    <div className="mt-3">
                                        <label className="text-sm text-gray-700 block mb-1">
                                            Please tell us more:
                                        </label>
                                        <textarea
                                            className="w-full border border-gray-300 rounded-md p-2 text-sm"
                                            rows={3}
                                            value={otherReason}
                                            onChange={(e) => setOtherReason(e.target.value)}
                                            placeholder="Please share your reason for cancellation..."
                                        />
                                    </div>
                                )}
                            </div>
                            
                            <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4">
                                <h3 className="text-sm font-semibold text-yellow-800 mb-2">
                                    Important Information
                                </h3>
                                <ul className="text-xs text-yellow-700 space-y-1 list-disc ml-4">
                                    <li>Your subscription benefits will remain active until the end of your current billing period.</li>
                                    <li>You will not be charged again after cancellation.</li>
                                    <li>All saved preferences and history will be retained if you decide to resubscribe.</li>
                                    <li>AI search queries may be limited after your subscription ends.</li>
                                </ul>
                            </div>
                            
                            <div className="mb-6">
                                <div className="flex items-start">
                                    <input
                                        type="checkbox"
                                        id="agreement"
                                        className="mt-1"
                                        checked={isAgreementChecked}
                                        onChange={() => setIsAgreementChecked(!isAgreementChecked)}
                                    />
                                    <label htmlFor="agreement" className="ml-2 text-sm text-gray-700">
                                        I understand that by canceling my subscription, I will lose premium access to certain features at the end of my current billing period.
                                    </label>
                                </div>
                            </div>
                            
                            <div className="flex justify-between mt-8">
                                <Link
                                    to="/profile"
                                    className="px-4 py-2 border border-[#3294b4] text-[#3294b4] rounded-full text-sm font-medium"
                                >
                                    Keep My Subscription
                                </Link>
                                <button
                                    className={`px-4 py-2 rounded-full text-sm font-medium ${
                                        cancelReason && (cancelReason !== "Other" || otherReason.trim()) && isAgreementChecked
                                            ? 'bg-red-500 text-white hover:bg-red-600'
                                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    onClick={proceedToConfirmation}
                                    disabled={!cancelReason || (cancelReason === "Other" && !otherReason.trim()) || !isAgreementChecked}
                                >
                                    Continue to Cancel
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Step 2: Final Confirmation */}
                    {cancelStep === 2 && (
                        <div>
                            <div className="text-center mb-6">
                                <div className="inline-block p-3 bg-red-100 rounded-full mb-4">
                                    <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-gray-800 mb-2">
                                    Are you sure you want to cancel?
                                </h2>
                                <p className="text-gray-600 text-sm">
                                    We value your membership and would love to help if there's a specific issue we can address.
                                </p>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg mb-6">
                                <h3 className="text-sm font-semibold mb-3">You'll lose access to:</h3>
                                <ul className="space-y-2 text-sm">
                                    <li className="flex items-start">
                                        <svg className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                        <span>Unlimited AI-powered searches</span>
                                    </li>
                                    <li className="flex items-start">
                                        <svg className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                        <span>Premium search results and detailed information</span>
                                    </li>
                                    <li className="flex items-start">
                                        <svg className="w-5 h-5 text-red-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                        <span>Full access to all vendor information and ratings</span>
                                    </li>
                                </ul>
                            </div>
                            
                            {cancellationError && (
                                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                                    {cancellationError}
                                </div>
                            )}
                            
                            <div className={`${isMobile ? 'flex flex-col space-y-3' : 'flex justify-between'} mt-6`}>
                                <button
                                    className={`${isMobile ? 'w-full' : 'px-4 py-2'} border border-[#3294b4] text-[#3294b4] rounded-full text-sm font-medium`}
                                    onClick={() => setCancelStep(1)}
                                >
                                    Go Back
                                </button>
                                <button
                                    className={`${isMobile ? 'w-full' : 'px-4 py-2'} bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600`}
                                    onClick={() => setShowConfirmDialog(true)}
                                >
                                    Confirm Cancellation
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {/* Step 3: Cancellation Success */}
                    {cancelStep === 3 && (
                        <div className="text-center">
                            <div className="inline-block p-3 bg-blue-100 rounded-full mb-4">
                                <svg className="w-10 h-10 text-[#3294b4]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-gray-800 mb-3">
                                Your Subscription Has Been Canceled
                            </h2>
                            <p className="text-gray-600 mb-6">
                                We're sorry to see you go. Thank you for being a valued member.
                            </p>
                            
                            <div className="bg-gray-50 p-4 rounded-lg mb-6 inline-block">
                                <p className="text-sm text-gray-700 mb-1">
                                    <span className="font-medium">Your subscription will remain active until:</span>
                                </p>
                                <p className="text-lg font-bold text-[#3294b4]">
                                    {subscriptionInfo?.nextPaymentDate 
                                        ? formatDate(subscriptionInfo.nextPaymentDate)
                                        : formatDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())}
                                </p>
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-8">
                                You'll continue to have full access to all premium features until this date.
                            </p>
                            
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 text-left mb-6">
                                <h3 className="text-sm font-semibold text-yellow-800 mb-2">
                                    Changed your mind?
                                </h3>
                                <p className="text-xs text-yellow-700">
                                    You can reactivate your subscription anytime before your cancellation date by visiting your profile. After that, you'll need to create a new subscription.
                                </p>
                            </div>
                            
                            <div className="flex justify-center mt-6">
                                <Link
                                    to="/"
                                    className="px-4 py-2 bg-[#3294b4] text-white rounded-full text-sm font-medium mr-3"
                                >
                                    Return to Home
                                </Link>
                                <Link
                                    to="/profile"
                                    className="px-4 py-2 border border-[#3294b4] text-[#3294b4] rounded-full text-sm font-medium"
                                >
                                    View Profile
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-3">
                            Final Confirmation
                        </h3>
                        <p className="text-gray-600 text-sm mb-5">
                            Are you absolutely sure you want to cancel your subscription? This action will schedule your subscription to end on {formatDate(subscriptionInfo?.nextPaymentDate)}.
                        </p>
                        
                        <div className={`flex ${isMobile ? 'flex-col space-y-3' : 'justify-end space-x-3'}`}>
                            <button
                                className={`${isMobile ? 'w-full' : 'px-3 py-1.5'} border border-gray-300 text-gray-700 rounded text-sm font-medium py-1.5`}
                                onClick={() => setShowConfirmDialog(false)}
                                disabled={cancellationProcessing}
                            >
                                No, Keep Subscription
                            </button>
                            <button
                                className={`${isMobile ? 'w-full' : 'px-3 py-1.5'} bg-red-500 text-white rounded text-sm font-medium py-1.5 ${
                                    cancellationProcessing ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-600'
                                }`}
                                onClick={handleCancellation}
                                disabled={cancellationProcessing}
                            >
                                {cancellationProcessing ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Processing...
                                    </span>
                                ) : (
                                    'Yes, Cancel Subscription'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CancelSubscription; 