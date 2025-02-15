declare module "react-rating" {
    import * as React from "react";
  
    export interface RatingProps {
      initialRating?: number;
      onChange?: (value: number) => void;
      emptySymbol?: React.ReactNode;
      fullSymbol?: React.ReactNode;
      readonly?: boolean;
      // You can add other props as needed.
    }
  
    const Rating: React.ComponentType<RatingProps>;
    export default Rating;
  }