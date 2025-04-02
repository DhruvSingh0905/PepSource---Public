import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const NotFound = () => {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  
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

  return (
    <div className="min-h-screen pt-16 flex items-center justify-center bg-gray-50">
      <div className={`${isMobile ? 'max-w-xs mx-4' : 'max-w-md'} w-full bg-white p-6 sm:p-8 rounded-lg shadow-md text-center`}>
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#3294b4]/10 flex items-center justify-center mx-auto mb-4 sm:mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 sm:h-10 sm:w-10 text-[#3294b4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 mb-1 sm:mb-2">404</h1>
        <h2 className="text-lg sm:text-xl font-semibold text-gray-700 mb-3 sm:mb-4">Page Not Found</h2>
        
        <p className="text-sm sm:text-base text-gray-600 mb-5 sm:mb-6">
          Sorry, the page you're looking for doesn't exist or has been moved.
        </p>
        
        <button 
          onClick={() => navigate('/')}
          className="px-5 py-2 sm:px-6 sm:py-2.5 bg-[#3294b4] text-white text-sm sm:text-base font-medium rounded-full shadow-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#3294b4]"
        >
          Return to Home
        </button>
      </div>
    </div>
  );
};

export default NotFound; 