import { useState, useEffect, useRef, useCallback } from 'react';
import SearchBar from './SearchBar';
import Item from './item'; // Correct casing
import { useLocation } from 'react-router-dom';
import banner from './assets/banner.png';
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';

type Drug = {
  id: number;
  name: string;
  proper_name: string;
  img: string; // Now required – only drugs with an image are loaded (or a placeholder)
};

const DRUGS_PER_PAGE = 12;
const DEFAULT_PLACEHOLDER = "/assets/placeholder.png"; // Update this path as needed

function Home() {
  const [drugsDisplayed, setDrugsDisplayed] = useState<Drug[]>([]);
  const [drugQueue, setDrugQueue] = useState<Drug[]>([]);
  const drugQueueRef = useRef<Drug[]>([]); // Keep track of latest drugQueue state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [page, setPage] = useState<number>(0);
  const [totDrugCount, setTotDrugCount] = useState<number>(0);
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Record of all drugs returned by the API across all pages.
  const allDrugsReturned = useRef<Drug[]>([]);

  // On first load, store any user info from query params.
  // useEffect(() => { //TODO: Is this necessary w/ supabase?
  //   const queryParams = new URLSearchParams(location.search);
  //   const name = queryParams.get("name");
  //   const email = queryParams.get("email");
  //   if (name && email) {
  //     localStorage.setItem("name", name);
  //     localStorage.setItem("email", email);
  //     console.log("Stored user info:", { name, email });
  //   }
  // }, [location.search]);

  useEffect(() => {
    const fetchData = async (drugCount:number) => {
      try {
        let offset = 0;
        console.log(drugCount);
        while (offset < drugCount - DRUGS_PER_PAGE) {
          const response = await fetch(`http://127.0.0.1:8000/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=${offset}`);
          const data = await response.json();
  
          if (data.status === "success" && data.drugs) {
            const newDrugs: Drug[] = [];
  
            for (let i = 0; i < data.drugs.length; i++) {
              let d = data.drugs[i] as Drug;
              try {
                const resImg = await fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(d.id)}/random-image`);
                const imgData = await resImg.json();
  
                if (imgData.status === "success" && imgData.random_vendor_image) {
                  d.img = imgData.random_vendor_image;
  
                  if (!drugQueueRef.current.some(drug => drug.id === d.id)) {
                    newDrugs.push(d);
                  }
                }
              } catch (err) {
                console.error(`Error fetching image for ${d.name}:`, err);
              }
            }
  
            if (newDrugs.length > 0) {
              // Update the state and useRef together
              setDrugQueue(prevQueue => {
                const updatedQueue = [...prevQueue, ...newDrugs];
                drugQueueRef.current = updatedQueue;
                localStorage.setItem("drugs", JSON.stringify(updatedQueue));
                return updatedQueue;
              });
            }
          }
          offset += DRUGS_PER_PAGE;
        }
        console.log("Completed drug fetching");
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.toString());
        } else {
          setError("An unexpected error occurred.");
        }
      } finally {
        setLoading(false);
      }
    };

    const initialize = async () => {
      let drugCount = 0;
      let storedDrugs:Drug[] = []
      try
      {
        storedDrugs = JSON.parse(localStorage.getItem("drugs") || "[]");
        const res = await fetch(`http://127.0.0.1:8000/api/drugs/totalcount`);
        const data = await res.json();
        if (data)
        {
          drugCount = Number(data.total);
        }
      } 
      catch (error) {console.error("Error fetching data:", error);}
      if (storedDrugs.length >= drugCount){setDrugQueue(storedDrugs);}
      else{fetchData(drugCount);}
    }
    initialize();
  }, []);
    
  // Intersection Observer for infinite scrolling.
  useEffect(() => {
    //if (loading) return;
    if (observer.current) observer.current.disconnect();
  
    observer.current = new IntersectionObserver(
      (entries) => {
        console.log(drugQueue);
        // Only increment page if at least one drug is loaded (to ensure first batch is displayed)
        if (entries[0].isIntersecting && drugQueue.length > 0) {
          setDrugsDisplayed(prevState => [...prevState, ...drugQueue]) //!Slightly ineffcient b/c were dumping the whole list into there and afterwards removing the duplicates
          setDrugsDisplayed(prevState => {
            // Create a Set to track unique drug IDs
            const uniqueDrugs = new Set();
        
            // Filter out duplicates by checking the drug ID
            const filteredDrugs = prevState.filter(drug => {
                if (uniqueDrugs.has(drug.id)) {
                    return false; // Skip drug if its ID already exists in the Set
                }
                uniqueDrugs.add(drug.id); // Add drug ID to Set
                return true; // Keep the drug
            });
            return filteredDrugs; // Return the array without duplicates
          });
        } 
      },
      { root: null, rootMargin: "0px 0px 100px 0px", threshold: 0.1 }
    );
  
    if (sentinelRef.current) observer.current.observe(sentinelRef.current);
  }, [drugsDisplayed, drugQueue]);


  return (
    <div>
      <ParallaxProvider>
        <Parallax>
          <img
            src={banner}
            alt="banner"
            className="w-full h-full rounded-md opacity-85 pt-20"
          />
        </Parallax>
        {error && <p className="text-center text-red-500">Error: {error}</p>}
        <div className="flex flex-wrap justify-start gap-16 pl-14">
          {drugsDisplayed.map((drug) => (
            <Item
              key={drug.id}
              name={drug.proper_name}
              description=""
              img={drug.img}
            />
          ))}
        </div>
        {/* Sentinel element for infinite scroll */}
        {hasMore && <div ref={sentinelRef} className="h-10"></div>}
        {loading && <p className="text-center">Loading more drugs...</p>}
      </ParallaxProvider>
    </div>
  );
}

export default Home;