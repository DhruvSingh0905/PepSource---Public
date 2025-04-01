import { useNavigate } from "react-router-dom";

interface ItemProps {
  name: string;
  description: string;
  img: string;
  featured: boolean;
}

function Item({ name, description, img, featured }: ItemProps) {
  const navigate = useNavigate(); // Initialize navigation function
  // const [dimensions, setDimensions] = useState
  const handleClick = () => {
    navigate(`/${encodeURIComponent(name)}`, { state: { description, img } });
  };
  

// MOBILE VERSION
return (
  <div
    className={`
      w-full aspect-square
      bg-white shadow-sm rounded-lg hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer flex flex-col
    `}
    onClick={handleClick}
  >
    <div className="w-full h-3/4 flex items-center justify-center p-1">
      {img ? (
        <img
          src={img}
          alt={name}
          className="w-full h-full object-contain rounded-md"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
          No Image
        </div>
      )}
    </div>
    <div className="w-full px-1 text-center">
      <h1 className="text-xs font-medium truncate">{name}</h1>
    </div>
  </div>
);}

export default Item;