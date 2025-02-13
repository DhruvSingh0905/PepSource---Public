import { useState, useEffect } from 'react';
import SearchBar from './SearchBar';
import Item from './item';
import banner from './assets/banner.png';
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';

type Drug = {
  id: number;
  name: string;
};

function Home() {
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log("Fetching drugs from API...");
    fetch("http://127.0.0.1:5000/api/drugs/names")
      .then(response => {
        console.log("Response status:", response.status);
        return response.json();
      })
      .then(data => {
        console.log("Data received:", data);
        if (data && data.drugs) {
          setDrugs(data.drugs);
          console.log("Number of drugs:", data.drugs.length);
        } else {
          console.warn("Response did not contain 'drugs' property.");
        }
        setLoading(false);
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
        {error && <p>Error: {error}</p>}
        <div className="flex flex-wrap justify-left gap-16 pl-14">
          {drugs.length > 0 ? (
            drugs.map((drug) => (
              <Item
                key={drug.id}
                name={drug.name}
                description="It does cool things"
                img=""
              />
            ))
          ) : (
            !loading && <p>No drugs found.</p>
          )}
        </div>
      </ParallaxProvider>
    </div>
  );
}

export default Home;