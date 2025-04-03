import { Component, ReactNode, ErrorInfo } from 'react';
import { useNavigate } from 'react-router-dom';

interface RouteErrorBoundaryProps {
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
}

/**
 * A component that wraps route components to handle errors within them
 * This is a class component because error boundaries need to be classes
 */
class RouteErrorBoundaryClass extends Component<RouteErrorBoundaryProps & { navigate: (path: string) => void }, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps & { navigate: (path: string) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error to our error logging system
    if (window.errorLogger) {
      window.errorLogger.logError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
          <div className="mb-8">
            <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Something went wrong</h2>
          <p className="text-gray-600 mb-8 text-center max-w-md">
            We've encountered an issue loading this page. Our team has been notified.
          </p>
          <div className="flex space-x-4">
            <button 
              onClick={() => this.setState({ hasError: false })}
              className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              Try Again
            </button>
            <button 
              onClick={() => this.props.navigate('/')}
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded transition-colors"
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * A wrapper for RouteErrorBoundaryClass that provides the navigate function from useNavigate
 * This is necessary because hooks can't be used directly in class components
 */
const RouteErrorBoundary: React.FC<RouteErrorBoundaryProps> = ({ children }) => {
  const navigate = useNavigate();
  return <RouteErrorBoundaryClass navigate={navigate}>{children}</RouteErrorBoundaryClass>;
};

export default RouteErrorBoundary; 