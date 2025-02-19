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
  const location = useLocation();
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  // Fetch a page of drugs from the API.
  const fetchDrugs = useCallback(async () => {
    setLoading(true);
    try {
      const offset = page * DRUGS_PER_PAGE;
      const response = await fetch(`http://127.0.0.1:8000/api/drugs/names?limit=${DRUGS_PER_PAGE}&offset=${offset}`);
      const data = await response.json();
      if (data.status === "success" && data.drugs) {
        // For each drug, fetch its image concurrently.
        const drugsWithImages: Drug[] = (
          await Promise.all(
            data.drugs.map(async (drug: { name: string; img?: string }) => {
              try {
                const resImg = await fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(drug.name)}/random-image`);
                const imgData = await resImg.json();
                // Only include the drug if a valid image is returned.
                if (imgData.status === "success" && imgData.random_vendor_image) {
                  return { ...drug, img: imgData.random_vendor_image };
                } else {
                  return null;
                }
              } catch (err) {
                console.error(`Error fetching image for ${drug.name}:`, err);
                return null;
              }
            })
          )
        ).filter(Boolean) as Drug[];

        setDrugs(prev => [...prev, ...drugsWithImages]);
        if (drugsWithImages.length < DRUGS_PER_PAGE) {
          setHasMore(false);
        }
      } else {
        setError("No drugs found.");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.toString());
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Fetch the initial page on mount or when page changes.
  useEffect(() => {
    fetchDrugs();
  }, [fetchDrugs]);

  // Set up an Intersection Observer to load more drugs as the user scrolls.
  useEffect(() => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setPage(prev => prev + 1);
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -200px 0px", // trigger 200px before sentinel enters view
        threshold: 0.1,
      }
    );
    if (sentinelRef.current) {
      observer.current.observe(sentinelRef.current);
    }
  }, [loading, hasMore]);

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