import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './index.css';
import SearchResults from './SearchResults';
import Home from './Home';
import Listing from './Listing';
import Login from './auth/Login';
import Signup from './auth/Signup';
import Logout from './auth/Logout';
import Footer from './Footer';
import CheckEmail from './auth/checkEmail';
import SearchBar from './SearchBar';
import PaymentPage from './PaymentPage';
import Profile from './Profile';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfService from './tos'; // Import the new TermsOfService component
import AISearchResults from './AISearchResults'; // Import the AI search component
import './assets/favicon.png'; // This will get the file processed by Vite
import Contact from './Contact';
import ForgotPassword from './ForgotPassword';
import AuthConfirm from './AuthConfirm';
import UpdatePassword from './UpdatePassword';
import NotFound from './NotFound'; // Import the 404 page component
import CancelSubscription from './CancelSubscription'; // Import the CancelSubscription component
import PaymentMethodsPage from './PaymentMethodsPage'; // Import the PaymentMethodsPage component
import ErrorBoundary from './ErrorBoundary'; // Import the ErrorBoundary component
import RouteErrorBoundary from './RouteErrorBoundary';
import { initErrorHandler } from './utils/initErrorHandler'; // Import the error handler
import silenceStripeErrors from './utils/silenceStripe'; // Import the Stripe error silencer
import SEOHead from './seo/SEOHead'; // Import the SEO component
import SiteIndex from './routes/SiteIndex'; // Import the SiteIndex component
import ProtectedRoute from './utils/ProtectedRoute'; // Import the ProtectedRoute component
// Initialize the error handling system
//initErrorHandler();

// Silence Stripe-related errors
//silenceStripeErrors();

// Get the DOM element where we'll mount our React app
const rootElement = document.getElementById('root');

// Don't render anything until the root element is available
if (rootElement) {
  const root = createRoot(rootElement);
  
  // Render the application with ErrorBoundary as the top-level component
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <Router>
          <div className="min-h-screen w-screen relative pb-16">
            <SEOHead />
            <SearchBar />
            <Routes>
              <Route path="/" element={<RouteErrorBoundary><Home /></RouteErrorBoundary>} />
              <Route path="/listing" element={<RouteErrorBoundary><Listing /></RouteErrorBoundary>} /> {/* Keep this for backward compatibility */}
              <Route path="/:drugName" element={<RouteErrorBoundary><Listing /></RouteErrorBoundary>} /> {/* New route with drug name parameter */}
              <Route path="/login" element={<RouteErrorBoundary><Login /></RouteErrorBoundary>} />
              <Route path="/signup" element={<RouteErrorBoundary><Signup /></RouteErrorBoundary>} />
              <Route path="/logout" element={<RouteErrorBoundary><Logout /></RouteErrorBoundary>} />
              <Route path="/subscription" element={
                <RouteErrorBoundary>
                  <ProtectedRoute>
                    <PaymentPage />
                  </ProtectedRoute>
                </RouteErrorBoundary>
              } />
              <Route path="/payment-methods" element={
                <RouteErrorBoundary>
                  <ProtectedRoute>
                    <PaymentMethodsPage />
                  </ProtectedRoute>
                </RouteErrorBoundary>
              } />
              <Route path="/profile" element={
                <RouteErrorBoundary>
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                </RouteErrorBoundary>
              } />
              <Route path="/check-email" element={<RouteErrorBoundary><CheckEmail /></RouteErrorBoundary>} />
              <Route path="/terms" element={<RouteErrorBoundary><TermsOfService /></RouteErrorBoundary>} /> {/* Add the new Terms of Service route */}
              <Route path="/search/:query" element={<RouteErrorBoundary><SearchResults /></RouteErrorBoundary>} />
              <Route path="/ai-search/:query" element={<RouteErrorBoundary><AISearchResults /></RouteErrorBoundary>} /> {/* AI search route */}
              <Route path="/privacy" element={<RouteErrorBoundary><PrivacyPolicy /></RouteErrorBoundary>} /> {/* Add the new Privacy Policy route */}
              <Route path="/contact" element={<RouteErrorBoundary><Contact /></RouteErrorBoundary>} />
              <Route path="/forgot-password" element={<RouteErrorBoundary><ForgotPassword /></RouteErrorBoundary>} />
              <Route path="/auth/confirm" element={<RouteErrorBoundary><AuthConfirm /></RouteErrorBoundary>} /> 
              <Route path="/account/update-password" element={
                <RouteErrorBoundary>
                  <ProtectedRoute>
                    <UpdatePassword />
                  </ProtectedRoute>
                </RouteErrorBoundary>
              } />
              <Route path="/cancel-subscription" element={
                <RouteErrorBoundary>
                  <ProtectedRoute>
                    <CancelSubscription />
                  </ProtectedRoute>
                </RouteErrorBoundary>
              } />
              <Route path="/site-index" element={<RouteErrorBoundary><SiteIndex /></RouteErrorBoundary>} /> {/* New route for site-index */}
              <Route path="*" element={<RouteErrorBoundary><NotFound /></RouteErrorBoundary>} /> {/* 404 page for any unmatched routes */}
            </Routes>
            <Footer />
          </div>
        </Router>
      </ErrorBoundary>
    </StrictMode>
  );
} else {
  // Instead of console.error, use a more user-friendly approach
  document.body.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif;">
      <div style="text-align: center; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #d32f2f; margin-top: 0;">Unable to Load Application</h2>
        <p>Please refresh the page or try again later.</p>
      </div>
    </div>
  `;
}