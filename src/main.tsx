import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './index.css';

import Home from './Home';
import Listing from './Listing';
import Login from './Login';

createRoot(document.getElementById('root')!).render( //TODO: Make accounts
  <StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/listing" element={<Listing />} />
        <Route path="/login" element={<Login />} />
      </Routes>
    </Router>
  </StrictMode>,
);