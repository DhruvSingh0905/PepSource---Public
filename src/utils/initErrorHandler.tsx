import ErrorLogger from './errorLogger';

/**
 * Initializes the global error handling system
 * Should be called once at application startup
 */
export const initErrorHandler = (): void => {
  try {
    // Create and initialize the error logger
    const errorLogger = new ErrorLogger();
    
    // Make it globally accessible
    window.errorLogger = {
      logError: (error: Error, errorInfo?: React.ErrorInfo) => 
        errorLogger.logError(error, errorInfo)
    };

    // Set up global error handling
    window.addEventListener('error', (event) => {
      event.preventDefault();
      errorLogger.logError(event.error || new Error(event.message));
      return true; // Prevent default handling
    });

    // Handle promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      errorLogger.logError(error);
    });

    console.log('Error handling system initialized');
  } catch (error) {
    // In case our error handler itself fails, log to original console
    console.error('Failed to initialize error handling system:', error);
  }
};

export default initErrorHandler; 