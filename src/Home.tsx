import { useState, useEffect, useRef } from 'react';
import SearchBar from './SearchBar';
import Item from './item'; // Correct casing
import { useLocation } from 'react-router-dom';
import banner from './assets/banner.png';
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';

type Drug = {
  id: number;
  name: string;
  proper_name: string;
  img: string; // Only drugs with an image are loaded (or a placeholder)
};

const DRUGS_PER_PAGE = 12;
const DEFAULT_PLACEHOLDER = "/assets/placeholder.png"; // Update this path as needed

function Home() {
  const [drugsDisplayed, setDrugsDisplayed] = useState<Drug[]>([]);
  const [featuredDrugs, setFeaturedDrugs] = useState<Drug[]>([]);

  const [drugQueue, setDrugQueue] = useState<Drug[]>([]);
  const drugQueueRef = useRef<Drug[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState<boolean>(true);

  //const observer = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  //const location = useLocation();

  useEffect(() => {
    const fetchData = async (drugCount: number) => {
      try {
        let offset = 0;
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
                } else {
                  d.img = DEFAULT_PLACEHOLDER;
                }
                if (!drugQueueRef.current.some(drug => drug.id === d.id)) {
                  newDrugs.push(d);
                }
              } catch (err) {
                console.error(`Error fetching image for ${d.name}:`, err);
              }
            }

            if (newDrugs.length > 0) {
              setDrugQueue(prevQueue => {
                const updatedQueue = [...prevQueue, ...newDrugs];
                const uniqueQueue = updatedQueue.filter((drug, index, self) =>
                  index === self.findIndex(d => d.id === drug.id)
                );
                drugQueueRef.current = uniqueQueue;
                localStorage.setItem("drugs", JSON.stringify(uniqueQueue));
                return uniqueQueue;
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
      let storedDrugs: Drug[] = [];
      try {
        storedDrugs = JSON.parse(localStorage.getItem("drugs") || "[]");
        const res = await fetch(`http://127.0.0.1:8000/api/drugs/totalcount`);
        const data = await res.json();
        if (data) {
          drugCount = Number(data.total);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
      if (storedDrugs.length === drugCount) {
        setDrugQueue(storedDrugs);
      } else {
        fetchData(drugCount);
      }
    };

    initialize();
   
  }, []);

  useEffect(() =>{ //TODO: DO we need the drugQueue????
    setDrugsDisplayed(prevState => [...prevState, ...drugQueue]);
    setDrugsDisplayed(prevState => {
      const uniqueDrugs = new Set();
      const filteredDrugs = prevState.filter(drug => {
        if (uniqueDrugs.has(drug.id)) return false;
        uniqueDrugs.add(drug.id);
        return true;
      });
      return filteredDrugs;
    });
    if (featuredDrugs.length == 0)
    {
      setFeaturedDrugs(drugsDisplayed.slice(0, 20)); //!for rn set the featured drugs to the first 20 of total drugs
    }
  }, [drugQueue])

  return (
    <div className="overflow-x-hidden">
  <ParallaxProvider>
    {/* Fixed Search Bar */}
    <SearchBar />

    {/* Full-width banner */}
    <Parallax>
      <img
        src={banner}
        alt="banner"
        className="w-full sm:w-screen sm:h-auto h-1/3 object-cover pt-12"
      />
    </Parallax>

    {error && drugsDisplayed.length === 0 && (
      <p className="text-center text-red-500">Error: {error}</p>
    )}

    {/* Centered container for sections */}
    <div className="w-full max-w-screen-xl mx-auto px-4">
      
      {/* Featured Drugs Section */}
      <section className="my-8">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-left">
          Featured
        </h2>
        <div className="overflow-x-auto">
          <div className="flex space-x-14">
            {featuredDrugs.map((drug) => (
              <div key={drug.id} className="flex-shrink-0">
                <Item
                  name={drug.proper_name}
                  description=""
                  img={drug.img}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Catalog Section (Grid Layout) */}
      <section className="my-8">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-left">
          Catalog
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ">
          {drugsDisplayed.map((drug) => (
            <Item
              key={drug.id}
              name={drug.proper_name}
              description=""
              img={drug.img}
            />
          ))}
        </div>
      </section>
    </div>

    {/* Sentinel for infinite scrolling */}
    {/* {hasMore && <div ref={sentinelRef} className="h-10"></div>}
    {loading && <p className="text-center">Loading more drugs...</p>} */}
  </ParallaxProvider>
</div>
  );
}

export default Home;