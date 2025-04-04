import ErrorLogger from './errorLogger';
import type { ErrorInfo } from 'react';

// Define types for global errorLogger
declare global {
  interface Window {
    errorLogger?: {
      logError: (error: Error, errorInfo?: ErrorInfo) => void;
    };
  }
}

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
      logError: (error: Error, errorInfo?: ErrorInfo) => 
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

    // Add an extra safety measure to handle dynamically reattached console methods
    // This will run periodically to ensure console methods stay overridden
    setInterval(() => {
      const noOp = (): void => {};
      
      // Ensure these core methods remain silent
      if (console.log !== noOp) console.log = noOp;
      if (console.error !== noOp) console.error = noOp;
      if (console.warn !== noOp) console.warn = noOp;
      if (console.info !== noOp) console.info = noOp;
      
      // Special handling for Stripe-related logs
      // This works because Stripe and other libraries often restore the console methods
      const originalConsole = window.console;
      try {
        window.console = new Proxy(originalConsole, {
          get: (target: Console, prop: string | symbol) => {
            if (typeof prop === 'string' && typeof target[prop as keyof Console] === 'function') {
              return function(/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
                ...args: unknown[]
              ) {
                // Completely silent operation - no logs at all
                return;
              };
            }
            return target[prop as keyof Console];
          }
        });
      } catch {
        // Fallback if Proxy is not supported
        console.log = noOp;
        console.error = noOp;
        console.warn = noOp;
        console.info = noOp;
      }
    }, 1000);

    // Comment out or remove any console.log statements
    // console.log('Error handling system initialized');
  } catch {
    // Empty catch - we intentionally ignore any errors during error handler setup
    // to avoid circular console logging
    void 0; // no-op
  }
};

export default initErrorHandler; 