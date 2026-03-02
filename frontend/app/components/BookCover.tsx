"use client";

import { resolveBookCover } from "@/app/services/api";

interface BookCoverProps {
  coverImage?: string | null;
  alt: string;
  className?: string;
  aspectRatio?: "3/4" | "square" | "auto";
}

/**
 * BookCover - Reusable book cover image component with fallback
 * Handles image loading errors gracefully
 */
export default function BookCover({
  coverImage,
  alt,
  className = "",
  aspectRatio = "3/4",
}: BookCoverProps) {
  const coverUrl = resolveBookCover(coverImage);
  const aspectClasses = {
    "3/4": "aspect-[3/4]",
    square: "aspect-square",
    auto: "",
  };

  return (
    <div
      className={`relative ${aspectClasses[aspectRatio]} rounded-2xl overflow-hidden bg-slate-100 shadow-xl ${className}`}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            // Show fallback placeholder
            const parent = target.parentElement;
            if (parent && !parent.querySelector(".fallback-placeholder")) {
              const fallback = document.createElement("div");
              fallback.className =
                "fallback-placeholder w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-sm";
              fallback.textContent = "ไม่มีรูปปก";
              parent.appendChild(fallback);
            }
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-sm">
          ไม่มีรูปปก
        </div>
      )}
    </div>
  );
}

