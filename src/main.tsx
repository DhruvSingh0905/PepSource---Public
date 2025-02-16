import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './index.css';

import Home from './Home';
import Listing from './Listing';
import Login from './Login';
import Footer from './Footer';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <div className="min-h-screen relative pb-16">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/listing" element={<Listing />} />
          <Route path="/login" element={<Login />} />
        </Routes>
        <Footer />
      </div>
    </Router>
  </StrictMode>,
);