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
  img: string; // Now required – only drugs with an image are loaded
};

const DRUGS_PER_PAGE = 12;

function Home() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [page, setPage] = useState<number>(0);
  const [totDrugCount, setTotDrugCount] = useState<number>(0);
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchDrugs = useCallback(async () => {
    if (!totDrugCount) return; // Prevent fetching if totDrugCount is not yet available
  
    setLoading(true);
    try {
      const offset = page * DRUGS_PER_PAGE;
  
      console.log(`Fetching drugs: offset=${offset}, total=${totDrugCount}`);
  
      if (offset < totDrugCount) {
        const response = await fetch(`http://127.0.0.1:8000/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=${offset}`);
        const data = await response.json();
  
        if (data.status === "success" && data.drugs) {
          const drugsWithImages: Drug[] = (
            await Promise.all(
              data.drugs.map(async (drug: { name: string; img?: string }) => {
                try {
                  const resImg = await fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(drug.name)}/random-image`);
                  const imgData = await resImg.json();
                  return imgData.status === "success" && imgData.random_vendor_image
                    ? { ...drug, img: imgData.random_vendor_image }
                    : null;
                } catch (err) {
                  console.error(`Error fetching image for ${drug.name}:`, err);
                  return null;
                }
              })
            )
          ).filter(Boolean) as Drug[];
  
          setDrugs(prev => [...prev, ...drugsWithImages]);
        }
      } 
    } catch (err) {
      console.error("Error fetching drugs:", err);
      setError(err instanceof Error ? err.toString() : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }, [page, totDrugCount]); // ✅ Depend on page and totDrugCount

  // Fetch total drug count once when component mounts
  useEffect(() => {
    getTotDrugCount();
  }, []);
  useEffect(() => {
    fetchDrugs();
  }, [fetchDrugs]); // ✅ Runs when page or totDrugCount changes

  const getTotDrugCount = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/drugs/totalcount`);
      const d = await res.json();

      if (d && d.total) {
        setTotDrugCount(d.total);
      }
    } catch (err) {
      console.error("Error fetching total count:", err);
    }
  };

  // Intersection Observer
  useEffect(() => {
    //if (drugs.length >= totDrugCount - 2) setHasMore(false);
    if (loading) return;
    if (observer.current) observer.current.disconnect();
  
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          console.log("Incrementing page...");
          setPage(prev => prev + 1);
        }
      },
      { root: null, rootMargin: "0px 0px 100px 0px", threshold: 0.1 }
    );
  
    if (sentinelRef.current) observer.current.observe(sentinelRef.current);
  }, [loading, totDrugCount, hasMore]);

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