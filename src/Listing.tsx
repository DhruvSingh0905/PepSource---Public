import { useState, useEffect } from 'react';
import DesktopListing from './DesktopListing'; // Import the desktop version (original)
import MobileListing from './MobileListing'; // Import the mobile version we just created

// Breakpoint constant for mobile devices
const MOBILE_BREAKPOINT = 768; // Typical breakpoint for mobile devices

function Listing() {
  // State to track if the screen is mobile width
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // Function to check window width and update state
    const checkScreenWidth = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    // Initial check
    checkScreenWidth();

    // Add event listener for window resize
    window.addEventListener('resize', checkScreenWidth);

    // Cleanup event listener on component unmount
    return () => {
      window.removeEventListener('resize', checkScreenWidth);
    };
  }, []); // Empty dependency array means this runs once on mount and sets up the listener

  // Conditionally render either MobileListing or Listing based on screen width
  return isMobile ? <MobileListing /> : <DesktopListing />;
}

export default Listing;