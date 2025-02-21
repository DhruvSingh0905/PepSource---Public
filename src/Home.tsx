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
  const [drugs, setDrugs] = useState<Drug[]>([]);
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
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const name = queryParams.get("name");
    const email = queryParams.get("email");
    if (name && email) {
      localStorage.setItem("name", name);
      localStorage.setItem("email", email);
      console.log("Stored user info:", { name, email });
    }
  }, [location.search]);

  const fetchDrugs = useCallback(async () => {
    if (!totDrugCount) {
      console.log("Total drug count not set yet, skipping fetchDrugs.");
      return;
    }
  
    const offset = page * DRUGS_PER_PAGE;
    console.log(`Fetching drugs: offset=${offset}, total=${totDrugCount}, current page=${page}`);
    
    // If the offset exceeds or equals totDrugCount, stop fetching.
    if (offset >= totDrugCount) {
      setHasMore(false);
      console.log("Offset exceeds total drug count; no more drugs to fetch.");
      return;
    }
  
    setLoading(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=${offset}`);
      const data = await response.json();
      console.log("Response from /api/drugs/names:", data);
  
      if (data.status === "success" && data.drugs) {
        // Process each drug and fetch its image concurrently.
        const drugsWithImages: Drug[] = (
          await Promise.all(
            data.drugs.map(async (drug: { name: string; img?: string }) => {
              try {
                const resImg = await fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(drug.name)}/random-image`);
                const imgData = await resImg.json();
                if (imgData.status === "success" && imgData.random_vendor_image) {
                  console.log(`Fetched image for ${drug.name}`);
                  return { ...drug, img: imgData.random_vendor_image };
                } else {
                  console.warn(`No valid image for ${drug.name}, using placeholder.`);
                  return { ...drug, img: DEFAULT_PLACEHOLDER };
                }
              } catch (err) {
                console.error(`Error fetching image for ${drug.name}:`, err);
                return { ...drug, img: DEFAULT_PLACEHOLDER };
              }
            })
          )
        ).filter(Boolean) as Drug[];
  
        console.log(`Fetched ${drugsWithImages.length} drugs with images (or placeholder) for this page.`);
        
        // Append to the cumulative record.
        allDrugsReturned.current = [...allDrugsReturned.current, ...drugsWithImages];
        console.log(`Cumulative drugs returned by API so far: ${allDrugsReturned.current.length}`);
  
        // Update state for displayed drugs.
        setDrugs(prev => {
          const newDrugs = [...prev, ...drugsWithImages];
          console.log(`Total drugs loaded (displayed): ${newDrugs.length}`);
          if (newDrugs.length >= totDrugCount) {
            setHasMore(false);
            console.log("All drugs loaded; setting hasMore to false.");
          }
          return newDrugs;
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Error fetching drugs:", err);
        setError(err.toString());
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, [page, totDrugCount]);

  // Fetch total drug count once when component mounts.
  useEffect(() => {
    const getTotDrugCount = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/drugs/totalcount`);
        const d = await res.json();
        console.log("Total count response:", d);
        if (d && d.total) {
          setTotDrugCount(Number(d.total));
        }
      } catch (err) {
        console.error("Error fetching total count:", err);
      }
    };
    getTotDrugCount();
  }, []);

  // Fetch drugs when page or total count changes.
  useEffect(() => {
    fetchDrugs();
  }, [fetchDrugs]);

  // Log changes to the drugs array.
  useEffect(() => {
    console.log(`Displayed drugs count: ${drugs.length}`);
  }, [drugs]);

  // Intersection Observer for infinite scrolling.
  useEffect(() => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
  
    observer.current = new IntersectionObserver(
      (entries) => {
        // Only increment page if at least one drug is loaded (to ensure first batch is displayed)
        if (entries[0].isIntersecting && hasMore && drugs.length > 0) {
          console.log("Sentinel intersected; incrementing page...");
          setPage(prev => prev + 1);
        } else if (entries[0].isIntersecting && drugs.length === 0) {
          console.log("Sentinel intersected but no drugs loaded yet; not incrementing page.");
        }
      },
      { root: null, rootMargin: "0px 0px 100px 0px", threshold: 0.1 }
    );
  
    if (sentinelRef.current) observer.current.observe(sentinelRef.current);
  }, [loading, totDrugCount, hasMore, drugs]);

  // Once loading is done and no more pages remain, fetch the full list of drugs from the API and compare.
  useEffect(() => {
    const compareDrugLists = async () => {
      if (!loading && !hasMore) {
        try {
          const res = await fetch(`http://127.0.0.1:8000/api/drugs/names?limit=${totDrugCount}&offset=0`);
          const data = await res.json();
          if (data.status === "success" && data.drugs) {
            console.log(`Full list returned from API has ${data.drugs.length} drugs.`);
            const fullApiList = data.drugs as Drug[];
            const displayedIds = new Set(drugs.map(drug => drug.id));
            const missing = fullApiList.filter(drug => !displayedIds.has(drug.id));
            if (missing.length > 0) {
              console.log("Drugs from API that are not displayed:", missing.map(drug => drug.proper_name));
            } else {
              console.log("All drugs returned by API are displayed.");
            }
          } else {
            console.log("No drugs returned from full API fetch.");
          }
        } catch (err) {
          console.error("Error fetching full list for comparison:", err);
        }
      }
    };
    compareDrugLists();
  }, [loading, hasMore, totDrugCount, drugs]);

  return (
    <div>
      <ParallaxProvider>
        <SearchBar />
        <Parallax>
          <img
            src={banner}
            alt="banner"
            className="w-full h-full rounded-md opacity-85 pt-20"
          />
        </Parallax>
        {error && <p className="text-center text-red-500">Error: {error}</p>}
        <div className="flex flex-wrap justify-start gap-16 pl-14">
          {drugs.map((drug) => (
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