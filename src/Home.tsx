import { useState, useEffect } from 'react'
import SearchBar from './SearchBar'
import Item from './item.tsx'
import banner from './assets/banner.png'
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';

function Home() { //!TODO: Integrate functionality with webpage and API
  const [drugs, setDrugs] = useState<string[]>([])
  //const [articles, setArticles] = useState([])

  useEffect(() => {
    fetch("http://127.0.0.1:5173/api/drugs")
    .then(response => response.json())
    .then(data => {
      setDrugs(data["drugs"])
      console.log(data["drugs"].length)
    });

  }, []);

  return (
    <div className="">
      <ParallaxProvider>
      <SearchBar />
        <Parallax  className="">
          <img src={banner} alt="banner" className="w-[100%] h-[400px] object-top rounded-md opacity-85 " />
        </Parallax>
        <div className="flex flex-wrap justify-left gap-16 pl-14">
          {Array.from({ length: drugs.length }).map((_, index) => (
            <Item 
              key={index} 
              name={drugs[index]} 
              description="It does cool things" 
              img="" 
            />
          ))}
        </div>
      </ParallaxProvider>          
    </div>
  )
}

export default Home
