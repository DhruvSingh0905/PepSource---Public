import { useState } from 'react'
import SearchBar from './SearchBar'
import Item from './item.tsx'
import banner from './assets/banner.png'
import { ParallaxProvider, Parallax } from 'react-scroll-parallax';

function Home() {

  return (
    <div className="">
      <ParallaxProvider>
        <Parallax  className="">
          <img src={banner} alt="banner" className="w-[100%] h-[400px] object-top rounded-md opacity-85 " />
        </Parallax>
        <SearchBar />
        <div className="flex flex-wrap justify-left gap-16 pl-14">
          <Item name="Drug Name" description="It does cool things" img="https://disa.com/uploads/headers/Prescription-Drug-Bottle.jpg" />
          <Item name="Drug Name" description="It does cool things" img="" />
          <Item name="Drug Name" description="It does cool things" img="" />
          <Item name="Drug Name" description="It does cool things" img="" />
          <Item name="Drug Name" description="It does cool things" img="" />

        </div>
      </ParallaxProvider>          
    </div>
  )
}

export default Home
