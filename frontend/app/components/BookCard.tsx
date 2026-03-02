"use client";

import Link from "next/link";
import { resolveBookCover } from "@/app/services/api";

export interface BookCardProps {
  book: {
    id: number;
    title: string;
    author?: string;
    cover_image?: string | null;
    rating_avg?: number;
    reviews_count?: number;
    favorites_count?: number;
    categories?: string[];
  };
  showRating?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function BookCard({ book, showRating = false, size = "md" }: BookCardProps) {
  const coverUrl = resolveBookCover(book.cover_image);

  // Robust id extraction: prefer id, fallback to book_id (legacy support)
  const bookId = book?.id ?? (book as any)?.book_id;
  const numericId = typeof bookId === "number" ? bookId : Number(bookId);

  // Safety check: Ensure book.id exists and is valid
  if (!book || !numericId || Number.isNaN(numericId) || numericId <= 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn("BookCard: book.id is missing or invalid", book);
    }
    // Return disabled card if id is missing (matches main card structure)
    return (
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden opacity-50 cursor-not-allowed h-full">
        <div className="aspect-[3/4] w-full bg-gray-100 overflow-hidden">
          <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-xs text-center px-2">
            ไม่มี ID
          </div>
        </div>
        <div className="flex-1 flex flex-col p-4">
          <p className="text-[15px] font-semibold leading-snug line-clamp-2 text-slate-400">
            {book?.title || "ไม่มีชื่อเรื่อง"}
          </p>
        </div>
      </div>
    );
  }

  const textSizeClasses = {
    sm: {
      title: "text-[10px]",
      author: "text-[9px]",
      categories: "text-[9px]",
    },
    md: {
      title: "text-[15px]",
      author: "text-sm",
      categories: "text-xs",
    },
    lg: {
      title: "text-base",
      author: "text-sm",
      categories: "text-xs",
    },
  };

  const classes = textSizeClasses[size];

  // Construct href safely using normalized numeric id
  const bookDetailHref = `/books/${numericId}`;

  // Format categories text
  const categoriesText = book.categories && book.categories.length > 0
    ? book.categories.slice(0, 2).join(", ")
    : null;

  return (
    <Link
      href={bookDetailHref}
      className="group flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer h-full"
    >
      {/* Cover Image - Fixed aspect ratio */}
      <div className="aspect-[3/4] w-full bg-gray-100 overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title || "รูปปกหนังสือ"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = "/placeholder-book.png";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-xs text-center px-2">
            ไม่มีรูปปก
          </div>
        )}
      </div>

      {/* Text Content - Consistent padding */}
      <div className="flex-1 flex flex-col p-4">
        {/* Rating Badge (optional) */}
        {showRating && book.rating_avg !== undefined && book.rating_avg > 0 && (
          <div className="mb-2 flex items-center gap-1.5">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className={star <= Math.round(book.rating_avg!) ? "text-orange-500" : "text-slate-300"}
                  style={{ fontSize: "0.7rem" }}
                >
                  ★
                </span>
              ))}
            </div>
            <span className={`${classes.title} font-semibold text-orange-600`}>
              {book.rating_avg.toFixed(1)}
            </span>
          </div>
        )}

        {/* Title */}
        <h3 className={`${classes.title} font-semibold leading-snug line-clamp-2 text-slate-900 group-hover:text-orange-500 transition-colors mb-1`}>
          {book.title || "ไม่มีชื่อเรื่อง"}
        </h3>

        {/* Author */}
        {book.author && (
          <p className={`mt-1 ${classes.author} text-gray-600 line-clamp-1`}>
            {book.author}
          </p>
        )}

        {/* Categories */}
        {categoriesText && (
          <div className="mt-2 text-xs text-gray-500 line-clamp-1">
            {categoriesText}
          </div>
        )}
      </div>
    </Link>
  );
}

