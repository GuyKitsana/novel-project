"use client";

interface RatingStarsProps {
  rating: number;
  size?: "sm" | "md" | "lg";
  interactive?: boolean;
  onRatingChange?: (rating: number) => void;
  className?: string;
}

/**
 * RatingStars - Display or interactive star rating component
 * @param rating - Rating value (0-5)
 * @param size - Size of stars
 * @param interactive - If true, allows clicking to set rating
 * @param onRatingChange - Callback when rating changes (only if interactive)
 */
export default function RatingStars({
  rating,
  size = "md",
  interactive = false,
  onRatingChange,
  className = "",
}: RatingStarsProps) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  const starSize = sizeClasses[size];
  const roundedRating = Math.round(rating);

  const handleClick = (value: number) => {
    if (interactive && onRatingChange) {
      onRatingChange(value);
    }
  };

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= roundedRating;
        return (
          <button
            key={star}
            type="button"
            onClick={() => handleClick(star)}
            disabled={!interactive}
            className={`
              ${starSize}
              ${interactive ? "cursor-pointer hover:scale-110 transition-transform" : "cursor-default"}
              ${isFilled ? "text-yellow-400" : "text-slate-300"}
            `}
            aria-label={`Rating ${star} out of 5`}
          >
            <svg
              fill="currentColor"
              viewBox="0 0 20 20"
              className="w-full h-full"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

