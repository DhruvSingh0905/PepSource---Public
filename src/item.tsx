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
      className="w-32 h-32 sm:h-64 sm:w-64 bg-white shadow-gray-300 rounded-[20px] mt-[20px] hover:scale-105 transition-transform duration-200 cursor-pointer flex flex-col"
      onClick={handleClick}
    >
      {/* Image Container */}
      <div className="w-full h-3/4 flex items-center justify-center">
        {img ? (
          <img
            src={img}
            alt={name}
            className="w-full h-full object-contain rounded-[10px] pt-6"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
            No Image
          </div>
        )}
      </div>
      {/* Text Container */}
      <div className="w-full text-center mt-2">
        <h1 className="sm:text-xl text-sm font-semibold">{name}</h1>
      </div>
    </div>
  );
}

export default Item;