import { useState, useEffect } from 'react';
import SearchBar from './SearchBar';
import Item from './item';
import banner from './assets/banner.png';
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';


type Drug = {
  id: number;
  name: string;         // Matching field (lowercase)
  proper_name: string;  // Display field (properly capitalized)
  img?: string;         // Random vendor image URL
};

function Home() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Fetching drugs from API...");
    fetch("http://127.0.0.1:8000/api/drugs/names", { method: "GET" })
      .then(response => {
        return response.json();
      })
      .then(data => {
        console.log("API response:", data);
        if (data && data.drugs) {
          const drugsList: Drug[] = data.drugs;
          // For each drug, fetch its random vendor image.
          Promise.all(
            drugsList.map(drug =>
              fetch(`http://127.0.0.1:8000/api/drug/${encodeURIComponent(drug.name)}/random-image`)
                .then(response => response.json())
                .then(randomData => {
                  if (randomData.status === "success" && randomData.random_vendor_image) {
                    drug.img = randomData.random_vendor_image;
                  } else {
                    drug.img = "";
                  }
                  return drug;
                })
                .catch(err => {
                  console.error(`Error fetching random image for ${drug.name}:`, err);
                  drug.img = "";
                  return drug;
                })
            )
          ).then(updatedDrugs => {
            console.log("Drugs with images:", updatedDrugs);
            setDrugs(updatedDrugs);
            setLoading(false);
          });
        } else {
          console.warn("No 'drugs' property in response:", data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Error fetching drugs:", err);
        setError(err.toString());
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <ParallaxProvider>
        <SearchBar />
        <Parallax>
          <img
            src={banner}
            alt="banner"
            className="w-full h-[400px] object-top rounded-md opacity-85"
          />
        </Parallax>
        {loading && <p>Loading drugs...</p>}
        {error && <p>Error fetching drugs: {error}</p>}
        {!loading && drugs.length === 0 && !error && <p>No drugs found.</p>}
        <div className="flex flex-wrap justify-left gap-16 pl-14">
          {drugs.map((drug) => (
            <Item
              key={drug.id}
              name={drug.proper_name}  // Use the properly capitalized name
              description="It does cool things"
              img={drug.img || ""}
            />
          ))}
        </div>
      </ParallaxProvider>
    </div>
  );
}

export default Home;