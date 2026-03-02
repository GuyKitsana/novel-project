"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { resolveBookCover, fetchPopularBooks, fetchBooks } from "@/app/services/api";

/**
 * Lightweight interface for carousel usage
 * Only includes fields needed for display: id, title, cover_image
 */
interface SimpleBook {
  id: number;
  title: string;
  cover_image?: string | null;
}

/**
 * Type guard to check if an object has the required book fields
 */
function isValidBook(data: any): data is { id: number; title?: string; cover_image?: string | null } {
  return data && typeof data.id === "number";
}

/**
 * Normalize API response to SimpleBook format
 * Handles different API response shapes (some may have extra fields)
 */
function normalizeBook(data: any): SimpleBook {
  return {
    id: data.id,
    title: data.title || "ไม่มีชื่อเรื่อง",
    cover_image: data.cover_image || null,
  };
}

/**
 * Pick random items from array using Fisher-Yates shuffle
 */
function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return [];
  const copy = [...arr];
  // Fisher-Yates shuffle
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

// Mock data - fallback when API fails
const mockBooks: SimpleBook[] = [
  {
    id: 1,
    title: "Omniscient Reader's Viewpoint",
    cover_image: "orv_5.jpg",
  },
  {
    id: 2,
    title: "The Beginning After The End",
    cover_image: "tbate_1.jpg",
  },
  {
    id: 3,
    title: "Solo Leveling",
    cover_image: "solo_leveling.jpg",
  },
  {
    id: 4,
    title: "Overgeared",
    cover_image: "overgeared.jpg",
  },
  {
    id: 5,
    title: "The Second Coming of Gluttony",
    cover_image: "tscog.jpg",
  },
  {
    id: 6,
    title: "Trash of the Count's Family",
    cover_image: "tcf.jpg",
  },
  {
    id: 7,
    title: "The Novel's Extra",
    cover_image: "tne.jpg",
  },
  {
    id: 8,
    title: "A Returner's Magic Should Be Special",
    cover_image: "returner_magic.jpg",
  },
];


// Skeleton Card Component
function SkeletonCard() {
  return (
    <div className="flex-shrink-0">
      <div className="w-40 md:w-44">
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-slate-200 animate-pulse mb-2">
          <div className="absolute top-2 left-2 z-10">
            <div className="w-8 h-8 rounded-full bg-slate-300" />
          </div>
        </div>
        <div className="h-4 bg-slate-200 rounded animate-pulse" />
      </div>
    </div>
  );
}

// Book Card Component
function BookCard({ book, rank }: { book: SimpleBook; rank: number }) {
  const coverUrl = resolveBookCover(book.cover_image);

  // Safety check: Ensure book.id exists
  if (!book || !book.id || typeof book.id !== "number") {
    if (process.env.NODE_ENV === "development") {
      console.warn("PopularTodaySection BookCard: book.id is missing or invalid", book);
    }
    return (
      <div className="flex-shrink-0 opacity-50 cursor-not-allowed">
        <div className="w-40 md:w-44">
          <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-slate-200 mb-2">
            <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
              ไม่มี ID
            </div>
          </div>
          <p className="text-sm font-medium text-slate-400 line-clamp-1">
            {book?.title || "ไม่มีชื่อเรื่อง"}
          </p>
        </div>
      </div>
    );
  }

  const bookDetailHref = `/books/${book.id}`;

  return (
    <Link
      href={bookDetailHref}
      className="flex-shrink-0 group"
      data-popular-item
    >
      <div className="w-40 md:w-44">
        {/* Book Card */}
        <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-slate-200 shadow-md hover:shadow-xl hover:scale-105 transition-all duration-300 cursor-pointer mb-2">
          {/* Ranking Badge */}
          <div className="absolute top-2 left-2 z-10">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white text-sm font-bold shadow-lg">
              {rank}
            </span>
          </div>

          {/* Book Cover Image */}
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={book.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/placeholder-book.png";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-300 text-slate-500 text-xs text-center px-2">
              ไม่มีรูปปก
            </div>
          )}
        </div>

        {/* Book Title (below image) */}
        <p className="text-sm font-medium text-slate-800 line-clamp-1 group-hover:text-orange-600 transition-colors">
          {book.title}
        </p>
      </div>
    </Link>
  );
}

export default function PopularTodaySection() {
  const [books, setBooks] = useState<SimpleBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  
  // Infinite carousel refs
  const sliderRef = useRef<HTMLDivElement>(null);
  const originalWidthRef = useRef<number>(0);

  useEffect(() => {
    const loadBooks = async () => {
      setLoading(true);
      setError(null);
      setIsFallback(false);
      
      try {
        // Fetch at least 10 books (fetch 12 to have buffer)
        // fetchPopularBooks returns books sorted by popularity
        // Default to "all" timeframe for this component
        const fetchedBooks: SimpleBook[] = (await fetchPopularBooks(12, "all"))
  .filter(isValidBook)
  .map((book: any) => normalizeBook(book));
        
        let finalBooks: SimpleBook[] = [];
        
        // If popular books API returns empty, use random books as fallback
        if (fetchedBooks.length === 0) {
          setIsFallback(true);
          try {
            // Fetch random books as fallback
            const randomBooksRaw = await fetchBooks({ limit: 50, random: true });
            const randomBooks = randomBooksRaw
              .filter(isValidBook)
              .map(normalizeBook);
            
            if (randomBooks.length >= 10) {
              finalBooks = pickRandom(randomBooks, 10);
            } else if (randomBooks.length > 0) {
              finalBooks = randomBooks;
            } else {
              // Last resort: use mock books
              finalBooks = pickRandom(mockBooks, 10);
            }
          } catch (fallbackErr) {
            // If fallback fetch fails, use mock books
            console.error("Fallback fetch failed:", fallbackErr);
            finalBooks = pickRandom(mockBooks, 10);
          }
        } else if (fetchedBooks.length >= 10) {
          // Use first 10 books if we have enough
          finalBooks = fetchedBooks.slice(0, 10);
        } else {
          // If we have some books but fewer than 10, fill with random books
          finalBooks = [...fetchedBooks];
          
          try {
            // Fetch more random books to fill up to 10
            const additionalBooks: SimpleBook[] = (await fetchBooks({ limit: 50, random: true }))
  .filter(isValidBook)
  .map((book: any) => normalizeBook(book));
            
            // Filter out books that are already in finalBooks (by id)
            const existingIds = new Set(finalBooks.map((b: SimpleBook) => b.id));
            const uniqueAdditional = additionalBooks.filter((b: SimpleBook) => !existingIds.has(b.id));
            
            // Pick random from unique books
            const needed = 10 - finalBooks.length;
            const randomAdditional = pickRandom(uniqueAdditional, needed);
            finalBooks = [...finalBooks, ...randomAdditional];
            
            // If still not enough, use mock books to fill
            if (finalBooks.length < 10) {
              const mockNeeded = 10 - finalBooks.length;
              const mockIds = new Set(finalBooks.map((b: SimpleBook) => b.id));
              const availableMock = mockBooks.filter((b: SimpleBook) => !mockIds.has(b.id));
              const randomMock = pickRandom(availableMock, mockNeeded);
              finalBooks = [...finalBooks, ...randomMock];
            }
          } catch (fallbackErr) {
            // If fetching additional books fails, use mock books to fill
            const needed = 10 - finalBooks.length;
            const existingIds = new Set(finalBooks.map((b: SimpleBook) => b.id));
            const availableMock = mockBooks.filter((b: SimpleBook) => !existingIds.has(b.id));
            const randomMock = pickRandom(availableMock, needed);
            finalBooks = [...finalBooks, ...randomMock];
          }
        }
        
        // Ensure we have at least some books (never empty)
        if (finalBooks.length > 0) {
          setBooks(finalBooks.slice(0, 10));
        } else {
          // Ultimate fallback: use mock books
          setBooks(pickRandom(mockBooks, 10));
          setIsFallback(true);
        }
      } catch (err: any) {
        // On error, use random books as fallback
        console.error("Error loading popular today books:", err);
        if (err.status) {
          console.error(`[PopularTodaySection] HTTP ${err.status} ${err.statusText} - ${err.url}`);
        }
        
        setIsFallback(true);
        try {
          // Try to fetch random books as fallback
          const randomBooksRaw = await fetchBooks({ limit: 50, random: true });
          const randomBooks = randomBooksRaw
            .filter(isValidBook)
            .map(normalizeBook);
          
          if (randomBooks.length >= 10) {
            setBooks(pickRandom(randomBooks, 10));
          } else if (randomBooks.length > 0) {
            setBooks(randomBooks);
          } else {
            // Last resort: use mock books
            setBooks(pickRandom(mockBooks, 10));
          }
        } catch (fallbackErr: any) {
          // Last resort: use mock books
          console.error("Fallback also failed:", fallbackErr);
          setBooks(pickRandom(mockBooks, 10));
        }
      } finally {
        setLoading(false);
      }
    };

    loadBooks();
  }, []);

  // Calculate original width and initialize scroll position for infinite loop
  useEffect(() => {
    if (books.length === 0 || !sliderRef.current) return;

    const calculateAndSetScroll = () => {
      if (!sliderRef.current) return;

      // Find one item using data attribute
      const firstItem = sliderRef.current.querySelector('[data-popular-item]') as HTMLElement;
      if (!firstItem) {
        // Retry after a short delay if items aren't rendered yet
        setTimeout(calculateAndSetScroll, 50);
        return;
      }

      // Measure item width
      const itemWidth = firstItem.offsetWidth;
      
      // Read gap from CSS (gap-4 = 16px)
      // We'll use the computed gap from the flex container
      const container = firstItem.parentElement;
      if (!container) return;
      
      const computedStyle = window.getComputedStyle(container);
      const gap = parseFloat(computedStyle.gap) || 16; // Default to 16px if gap not found
      
      // Calculate original width: (itemWidth + gap) * number of items
      const originalWidth = (itemWidth + gap) * books.length;
      originalWidthRef.current = originalWidth;

      // Set initial scroll position to the middle (start of first set in duplicated array)
      // This allows seamless scrolling in both directions
      sliderRef.current.scrollLeft = originalWidth;
    };

    // Wait for layout to complete
    const timer1 = setTimeout(calculateAndSetScroll, 100);
    const timer2 = setTimeout(calculateAndSetScroll, 300);
    const timer3 = setTimeout(calculateAndSetScroll, 500);

    // Also recalculate on window resize
    window.addEventListener("resize", calculateAndSetScroll);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      window.removeEventListener("resize", calculateAndSetScroll);
    };
  }, [books]);

  return (
    <section className="w-full">
      {/* Section Header */}
      <div className="mb-4">
        {/* NOTE: Section title says "Popular Today" but currently shows unsorted books from database */}
        <div className="flex items-center gap-2">
          <h2 className="text-xl md:text-2xl font-bold text-orange-600">
            นิยายยอดนิยมประจำวัน
          </h2>
          {isFallback && !loading && (
            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
              สุ่มแนะนำ
            </span>
          )}
        </div>
      </div>

      {/* Horizontal Scrollable Book Row */}
      <div className="relative">
        {/* Left Arrow */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!sliderRef.current) return;
            sliderRef.current.scrollBy({ left: -300, behavior: "smooth" });
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-50 w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center transition-all pointer-events-auto opacity-100 cursor-pointer hover:bg-slate-50 hover:shadow-xl active:scale-95"
          style={{ zIndex: 50 }}
          aria-label="Scroll left"
        >
          <svg className="w-5 h-5 text-slate-700 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Right Arrow */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!sliderRef.current) return;
            sliderRef.current.scrollBy({ left: 300, behavior: "smooth" });
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-50 w-10 h-10 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center transition-all pointer-events-auto opacity-100 cursor-pointer hover:bg-slate-50 hover:shadow-xl active:scale-95"
          style={{ zIndex: 50 }}
          aria-label="Scroll right"
        >
          <svg className="w-5 h-5 text-slate-700 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Scroll Container */}
        <div 
          ref={sliderRef}
          className="overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pl-[56px] pr-[56px] md:pl-[64px] md:pr-[64px]"
          onScroll={() => {
            if (!sliderRef.current || originalWidthRef.current === 0) return;
            
            const container = sliderRef.current;
            const { scrollLeft, scrollWidth, clientWidth } = container;
            const originalWidth = originalWidthRef.current;
            const rightEdge = scrollWidth - clientWidth;
            const buffer = 10;
            
            // Infinite loop: Reset scroll position when reaching boundaries
            // Use real DOM boundaries (scrollWidth - clientWidth) instead of calculated width
            // Direct assignment ensures instant reset without any animation
            
            // When scrolling too far RIGHT
            if (scrollLeft >= rightEdge - buffer) {
              // Reset to equivalent position in first set (instant, no animation)
              container.scrollLeft = scrollLeft - originalWidth;
            }
            // When scrolling too far LEFT
            else if (scrollLeft <= buffer) {
              // Reset to equivalent position in second set (instant, no animation)
              container.scrollLeft = scrollLeft + originalWidth;
            }
          }}
        >
          <div className="flex gap-4 pb-4 w-max">
            {loading ? (
              // Loading skeleton - show 10 skeleton cards
              Array.from({ length: 10 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))
            ) : books.length === 0 ? (
              // This should never happen due to fallback logic, but show loading just in case
              Array.from({ length: 10 }).map((_, index) => (
                <SkeletonCard key={index} />
              ))
            ) : (
              // Duplicate books array for infinite loop
              [...books, ...books].map((book, index) => (
                <BookCard key={`${book.id}-${index}`} book={book} rank={(index % books.length) + 1} />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
