import { useState, useEffect } from 'react';
import DesktopHome from './DesktopHome';
import MobileHome from './MobileHome';

// Breakpoint constant for mobile devices
const MOBILE_BREAKPOINT = 768; // Typical breakpoint for mobile devices

function Home() {
  // State to track if the screen is mobile width
  const [isMobile, setIsMobile] = useState<boolean>(false);
  // State to determine if we should render anything at all
  const [shouldRender, setShouldRender] = useState<boolean>(false);
  const apiUrl: string = import.meta.env.VITE_BACKEND_PRODUCTION_URL;

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

  // Fetch initial data to ensure it's loaded before rendering anything
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Check if data is already cached locally
        const storedDrugs = localStorage.getItem("drugs");
        
        if (storedDrugs && JSON.parse(storedDrugs).length > 0) {
          // If we have cached data, we can proceed
          setShouldRender(true);
          return;
        }
        
        // First get the total count of drugs
        const countRes = await fetch(`${apiUrl}/api/drugs/totalcount`);
        const countData = await countRes.json();
        
        if (!countData || countData.status !== "success") {
          // If we can't get count, wait a bit and retry
          setTimeout(loadInitialData, 1000);
          return;
        }
        
        // Then fetch the first batch of drugs
        const drugsRes = await fetch(`${apiUrl}/api/drugs/names?limit=12&offset=0`);
        const drugsData = await drugsRes.json();
        
        if (drugsData && drugsData.status === "success" && drugsData.drugs && drugsData.drugs.length > 0) {
          // We've successfully loaded the initial data
          setShouldRender(true);
        } else {
          // If we can't get drugs, retry
          setTimeout(loadInitialData, 1000);
          return;
        }
      } catch (error) {
        console.error("Error pre-loading drugs:", error);
        // On error, retry
        setTimeout(loadInitialData, 1500);
        return;
      }
    };
    
    // Start the initial data loading
    loadInitialData();
  }, [apiUrl]);

  // Don't render anything until data is loaded
  if (!shouldRender) {
    return null;
  }

  // Only render the appropriate component once data is loaded
  return isMobile ? <MobileHome /> : <DesktopHome />;
}

export default Home;