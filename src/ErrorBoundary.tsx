import { Component, ReactNode, ErrorInfo } from 'react';
import ErrorDisplay from './ErrorDisplay';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // We don't use console.error here to avoid the error being logged twice
    // Instead, we'll let our custom error logger handle it
    if (window.errorLogger) {
      window.errorLogger.logError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // If a fallback is provided, use it, otherwise use the ErrorDisplay component
      return this.props.fallback || <ErrorDisplay />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

// Extend the Window interface to include our error logger
declare global {
  interface Window {
    errorLogger?: {
      logError: (error: Error, errorInfo?: ErrorInfo) => void;
    };
  }
} 