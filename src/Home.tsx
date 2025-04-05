import { useState, useEffect } from 'react';
import DesktopHome from './DesktopHome';
import MobileHome from './MobileHome';

// Breakpoint constant for mobile devices
const MOBILE_BREAKPOINT = 768; // Typical breakpoint for mobile devices

function Home() {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Check if screen is mobile
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

  // Only render the appropriate component once data is loaded
  return isMobile ? <MobileHome /> : <DesktopHome />;
}

export default Home;