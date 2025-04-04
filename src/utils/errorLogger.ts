import React from 'react';
import { createRoot } from 'react-dom/client';
import type { ErrorInfo } from 'react';
import ErrorDisplay from '../components/ErrorDisplay';

// Error queue for rate limiting
interface ErrorQueueItem {
  message: string;
  timestamp: number;
}

class ErrorLogger {
  private errorQueue: ErrorQueueItem[] = [];
  private isDisplaying: boolean = false;
  private displayContainer: HTMLDivElement | null = null;
  private readonly displayDuration: number = 10000; // ms
  private readonly rateLimit: number = 3000; // ms
  private originalConsoleError: typeof console.error;
  private originalConsoleLog: typeof console.log;
  private originalConsoleWarn: typeof console.warn;

  constructor() {
    // Store original console methods
    this.originalConsoleError = console.error;
    this.originalConsoleLog = console.log;
    this.originalConsoleWarn = console.warn;

    // Create container for error displays
    this.createDisplayContainer();
    
    // Override console methods
    this.overrideConsoleMethods();
  }

  private createDisplayContainer(): void {
    // Create container for error displays
    this.displayContainer = document.createElement('div');
    this.displayContainer.style.position = 'fixed';
    this.displayContainer.style.top = '20px';
    this.displayContainer.style.right = '20px';
    this.displayContainer.style.zIndex = '9999';
    this.displayContainer.style.maxWidth = '400px';
    this.displayContainer.style.width = '100%';
    
    // Add media query for mobile
    if (window.matchMedia('(max-width: 768px)').matches) {
      this.displayContainer.style.right = '0';
      this.displayContainer.style.left = '0';
      this.displayContainer.style.margin = '0 auto';
      this.displayContainer.style.maxWidth = '90%';
    }
    
    // Listen for orientation changes or window resizes
    window.addEventListener('resize', () => {
      if (this.displayContainer && window.matchMedia('(max-width: 768px)').matches) {
        this.displayContainer.style.right = '0';
        this.displayContainer.style.left = '0';
        this.displayContainer.style.margin = '0 auto';
        this.displayContainer.style.maxWidth = '90%';
      } else if (this.displayContainer) {
        this.displayContainer.style.right = '20px';
        this.displayContainer.style.left = '';
        this.displayContainer.style.margin = '';
        this.displayContainer.style.maxWidth = '400px';
      }
    });
    
    document.body.appendChild(this.displayContainer);
  }

  private overrideConsoleMethods(): void {
    // Use a no-op function for complete silence
    const noOp = (): void => {};
    
    // Completely override all console methods to silence them
    console.log = noOp;
    console.info = noOp;
    console.debug = noOp;
    console.warn = noOp;
    console.error = noOp;
    console.trace = noOp;
    console.table = noOp;
    console.dir = noOp;
    console.dirxml = noOp;
    console.group = noOp;
    console.groupCollapsed = noOp;
    console.groupEnd = noOp;
    console.time = noOp;
    console.timeEnd = noOp;
    console.timeLog = noOp;
    console.count = noOp;
    console.countReset = noOp;
    console.assert = noOp;
    console.clear = noOp;
    
    // Create a proxy to catch any missed console methods
    // This ensures even dynamically added console methods will be silenced
    const originalConsole = window.console;
    window.console = new Proxy(originalConsole, {
      get: (target: Console, prop: string | symbol) => {
        if (typeof prop === 'string' && typeof target[prop as keyof Console] === 'function') {
          return noOp;
        }
        return target[prop as keyof Console];
      }
    });
    
    // Handle errors for our internal tracking
    const handleError = (args: unknown[]): void => {
      // Format the error message
      const message = this.formatErrorMessage(args);
      
      // Check if it's an SSL error
      const isSSLError = this.isSSLError(message);
      
      // Only add to queue and display if it's an SSL error
      if (isSSLError) {
        // Add to queue
        this.errorQueue.push({
          message,
          timestamp: Date.now()
        });
        
        // Start displaying errors if not already doing so
        if (!this.isDisplaying) {
          this.displayNextError();
        }
      }
    };
    
    // For debugging purposes, we can capture error outputs internally
    window.onerror = (message, source, lineno, colno, error): boolean => {
      if (error) {
        handleError([error]);
      } else {
        handleError([message]);
      }
      return true; // Prevents default browser error handling
    };
  }

  private formatErrorMessage(args: unknown[]): string {
    try {
      // Convert all arguments to strings
      const messageStrings = args.map(arg => {
        if (arg instanceof Error) {
          return `${arg.name}: ${arg.message}\n${arg.stack || ''}`;
        } else if (typeof arg === 'object' && arg !== null) {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        } else {
          return String(arg);
        }
      });
      
      return messageStrings.join(' ');
    } catch {
      return 'An error occurred';
    }
  }

  // Helper to check if an error is SSL related
  private isSSLError(message: string): boolean {
    const sslErrorPatterns = [
      /ssl/i,
      /certificate/i,
      /https/i,
      /secure connection/i,
      /security/i,
      /tls/i
    ];
    
    return sslErrorPatterns.some(pattern => pattern.test(message));
  }

  // Public method to manually log errors
  public logError(error: Error, errorInfo?: ErrorInfo, type: 'error' | 'warning' = 'error'): void {
    // Format the error message
    const message = `${error.name}: ${error.message}
${errorInfo ? `Component Stack: ${errorInfo.componentStack}` : ''}
${error.stack || ''}`;
    
    // Check if it's an SSL error
    const isSSLError = this.isSSLError(message);
    
    // Add to queue if it's an SSL error
    if (type === 'error' && isSSLError) {
      this.errorQueue.push({
        message,
        timestamp: Date.now()
      });
      
      // Start displaying errors if not already doing so
      if (!this.isDisplaying) {
        this.displayNextError();
      }
    }
    
    // Log to our systems but not to the browser console
    // if (type === 'error') {
    //   this.originalConsoleError(error, errorInfo);
    // } else {
    //   this.originalConsoleWarn(error, errorInfo);
    // }
  }

  private displayNextError(): void {
    if (this.errorQueue.length === 0) {
      this.isDisplaying = false;
      return;
    }
    
    this.isDisplaying = true;
    
    // Get the next error
    const nextError = this.errorQueue.shift();
    if (!nextError) return;
    
    // Display it
    this.renderErrorDisplay(nextError.message);
    
    // Wait for rate limit before showing the next one
    setTimeout(() => {
      this.displayNextError();
    }, this.rateLimit);
  }

  private renderErrorDisplay(message: string): void {
    // Create a div for this specific error
    const errorElement = document.createElement('div');
    this.displayContainer?.appendChild(errorElement);
    
    // Render the ErrorDisplay component
    const root = createRoot(errorElement);
    root.render(React.createElement(ErrorDisplay, { message }));
    
    // Remove the element after display duration
    setTimeout(() => {
      if (errorElement.parentNode === this.displayContainer) {
        this.displayContainer?.removeChild(errorElement);
      }
    }, this.displayDuration);
  }

  // Restore original console methods - useful for testing
  public restoreConsoleMethods(): void {
    // Just for reference, not actually used in production
    // console.error = this.originalConsoleError;
    // console.warn = this.originalConsoleWarn;
    // console.log = this.originalConsoleLog;
  }
}

export default ErrorLogger; 