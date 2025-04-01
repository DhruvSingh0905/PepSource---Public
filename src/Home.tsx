import { useState, useEffect } from 'react';
import DesktopHome from './DesktopHome';
import MobileHome from './MobileHome';

// Breakpoint constant for mobile devices
const MOBILE_BREAKPOINT = 768; // Typical breakpoint for mobile devices

function Home() {
  // State to track if the screen is mobile width
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [drugsLoaded, setDrugsLoaded] = useState<boolean>(false);
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

  // Fetch initial data to ensure it's loaded before rendering
  useEffect(() => {
    const checkForInitialData = async () => {
      setInitialLoading(true);
      
      try {
        // Check if data is already cached locally
        const storedDrugs = localStorage.getItem("drugs");
        
        if (storedDrugs && JSON.parse(storedDrugs).length > 0) {
          // If we have cached data, we can proceed
          setDrugsLoaded(true);
          setInitialLoading(false);
          return;
        }
        
        // First get the total count of drugs
        const countRes = await fetch(`${apiUrl}/api/drugs/totalcount`);
        const countData = await countRes.json();
        
        if (!countData || countData.status !== "success") {
          // If we can't get count, wait a bit and retry
          setTimeout(checkForInitialData, 1000);
          return;
        }
        
        // Then fetch the first batch of drugs
        const drugsRes = await fetch(`${apiUrl}/api/drugs/names?limit=12&offset=0`);
        const drugsData = await drugsRes.json();
        
        if (drugsData && drugsData.status === "success" && drugsData.drugs && drugsData.drugs.length > 0) {
          // We've successfully loaded the initial data
          setDrugsLoaded(true);
        } else {
          // If we can't get drugs, retry
          setTimeout(checkForInitialData, 1000);
          return;
        }
      } catch (error) {
        console.error("Error pre-loading drugs:", error);
        // On error, retry
        setTimeout(checkForInitialData, 1500);
        return;
      } finally {
        setInitialLoading(false);
      }
    };
    
    // Start the initial data loading
    checkForInitialData();
  }, [apiUrl]);

  // Show a loading spinner while initial data is being fetched
  if (initialLoading || !drugsLoaded) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-[#3294b4] mb-4"></div>
        <p className="text-gray-600 font-medium">Loading products...</p>
      </div>
    );
  }

  // Conditionally render either MobileHome or DesktopHome based on screen width
  return isMobile ? <MobileHome /> : <DesktopHome />;
}

export default Home;