import imgg from './assets/drugPhoto.jpg'

interface ItemProps {
    name: string;
    description: string;
    img: string;
}
  
function Item({ name, description, img }: ItemProps) {
    //TOOD: Use Hooks to pull data from server and display it as text through states
  return (
    <div className="w-[300px] h-[300px] bg-[#F2F5F4] shadow-gray-300 rounded-[20px] px-4 py-2 mt-[20px] border border-gray-300 hover:scale-105 transition-transform duration-200">
        <img src={img} alt={name} className="w-full h-2/4 object-cover rounded-[30px]" />
        <h1 className="text-2xl font-semibold mt-5">{name}</h1>
        <p className= "leading-relaxed text-gray-700 text-sm">{description}</p>
    </div>
    )
}

export default Item
