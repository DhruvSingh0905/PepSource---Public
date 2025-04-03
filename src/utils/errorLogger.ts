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
    document.body.appendChild(this.displayContainer);
  }

  private overrideConsoleMethods(): void {
    // Override console.error
    console.error = (...args: unknown[]): void => {
      // Format the error message
      const message = this.formatErrorMessage(args);
      
      // Add to queue
      this.errorQueue.push({
        message,
        timestamp: Date.now()
      });
      
      // Start displaying errors if not already doing so
      if (!this.isDisplaying) {
        this.displayNextError();
      }
      
      // Log to original console
      this.originalConsoleError.apply(console, args);
    };
    
    // Override console.warn
    console.warn = (...args: unknown[]): void => {
      // Log to original console
      this.originalConsoleWarn.apply(console, args);
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

  // Public method to manually log errors
  public logError(error: Error, errorInfo?: ErrorInfo, type: 'error' | 'warning' = 'error'): void {
    // Format the error message
    const message = `${error.name}: ${error.message}
${errorInfo ? `Component Stack: ${errorInfo.componentStack}` : ''}
${error.stack || ''}`;
    
    // Add to queue if it's an error
    if (type === 'error') {
      this.errorQueue.push({
        message,
        timestamp: Date.now()
      });
      
      // Start displaying errors if not already doing so
      if (!this.isDisplaying) {
        this.displayNextError();
      }
    }
    
    // Log to original console
    if (type === 'error') {
      this.originalConsoleError(error, errorInfo);
    } else {
      this.originalConsoleWarn(error, errorInfo);
    }
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
    console.error = this.originalConsoleError;
    console.warn = this.originalConsoleWarn;
    // console.log = this.originalConsoleLog;
  }
}

export default ErrorLogger; 