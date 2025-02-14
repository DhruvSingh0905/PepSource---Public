import { useNavigate } from "react-router-dom";

interface ItemProps {
  name: string;
  description: string;
  img: string;
}

function Item({ name, description, img }: ItemProps) {
  const navigate = useNavigate(); // Initialize navigation function

  const handleClick = () => {
    navigate("/listing", { state: { name, description, img } }); // Redirect with item data
  };

  return (
    <div
      className="w-[300px] h-[300px] bg-[#F2F5F4] shadow-gray-300 rounded-[20px] p-2 mt-[20px] border border-gray-300 hover:scale-105 transition-transform duration-200 cursor-pointer flex flex-col"
      onClick={handleClick}
    >
      {/* Image Container */}
      <div className="w-full h-1/2 flex items-center justify-center">
        {img ? (
          <img
            src={img}
            alt={name}
            className="w-full h-full object-contain rounded-[10px]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            No Image
          </div>
        )}
      </div>
      {/* Text Container */}
      <div className="w-full text-center mt-2">
        <h1 className="text-xl font-semibold">{name}</h1>
        <p className="text-sm text-gray-700">{description}</p>
      </div>
    </div>
  );
}

export default Item;