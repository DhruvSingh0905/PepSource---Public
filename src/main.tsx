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
import TermsOfService from './tos'; // Import the new TermsOfService component

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <div className="min-h-screen w-screen relative pb-16">
        <SearchBar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/listing" element={<Listing />} /> {/* Keep this for backward compatibility */}
          <Route path="/:drugName" element={<Listing />} /> {/* New route with drug name parameter */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/logout" element={<Logout />} />
          <Route path="/check-email" element={<CheckEmail />} />
          <Route path="/terms" element={<TermsOfService />} /> {/* Add the new Terms of Service route */}
          <Route path="/search/:query" element={<SearchResults />} />

        </Routes>
        <Footer />
      </div>
    </Router>
  </StrictMode>
);