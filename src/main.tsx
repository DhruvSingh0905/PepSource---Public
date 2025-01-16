import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Home from './Home.tsx'
import Listing from './Listing.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode >
    {/* <Listing /> */}
    <Home />
  </StrictMode>,
)
