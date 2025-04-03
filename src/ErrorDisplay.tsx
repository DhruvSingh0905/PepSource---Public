import { useState, useEffect } from 'react';

interface ErrorDisplayProps {
  message?: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ 
  message = "Something went wrong. Please try again later." 
}) => {
  const [visible, setVisible] = useState(true);
  
  // Auto-hide the error after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 10000);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (!visible) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-md p-4 max-w-md border-l-4 border-red-500 z-50 animate-fadein">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {/* Error icon */}
          <svg className="h-6 w-6 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="ml-3 w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium text-gray-900">Error</p>
          <p className="mt-1 text-sm text-gray-500">{message}</p>
        </div>
        <div className="ml-4 flex-shrink-0 flex">
          <button
            className="inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            onClick={() => setVisible(false)}
            aria-label="Close"
          >
            <span className="sr-only">Close</span>
            {/* X icon */}
            <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorDisplay; 