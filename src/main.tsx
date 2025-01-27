import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import './index.css'
import Home from './Home.tsx'
import Listing from './Listing.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode >
    <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/listing" element={<Listing />} />
        </Routes>
    </Router>
  </StrictMode>,
)
