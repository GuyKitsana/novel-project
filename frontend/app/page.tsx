"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { apiGet, fetchBooks, fetchPopularBooks, resolveBookCover } from "@/app/services/api";
import PopularTodaySection from "@/app/components/PopularTodaySection";
import Navbar from "@/app/components/Navbar";
import { useAuth } from "@/app/context/AuthContext";

// DEBUG flag - enable with NEXT_PUBLIC_DEBUG=1
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  category_count?: number;
}

interface Book {
  id: number;
  title: string;
  author?: string;
  cover_image?: string;
  categories?: string[];
}

interface Category {
  id: number;
  name: string;
  slug: string;
  code?: string; // Optional for backward compatibility
}

export default function HomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isInitialized } = useAuth();
  const [loading, setLoading] = useState(true);
  
  // Debug: Track render count
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  
  // Ref guards to prevent infinite loops
  const redirectedRef = useRef(false);
  const dataFetchedRef = useRef(false);
  
  // AbortController for fetch cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  
  if (DEBUG) {
    console.log(`[HOME render #${renderCountRef.current}]`, {
      user: user ? { id: user.id, role: user.role } : null,
      isInitialized,
      loading,
      redirected: redirectedRef.current,
      dataFetched: dataFetchedRef.current,
    });
  }

  // Data states
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(true);

  // Popular books state
  const [popularBooks, setPopularBooks] = useState<Book[]>([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [activeTab, setActiveTab] = useState<"week" | "month">("week");
  const [isPopularFallback, setIsPopularFallback] = useState(false);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  // Toast state
  const [toast, setToast] = useState<{
    open: boolean;
    type: "success" | "error";
    title: string;
  }>({
    open: false,
    type: "success",
    title: "",
  });

  // Toast helper
  const showToast = (type: "success" | "error", title: string) => {
    setToast({ open: true, type, title });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 3000);
  };


  // ✅ PUBLIC PAGE LOGIC - Support guests and logged-in users
  // ⚠️ CRITICAL: Wait for auth to initialize before running redirect logic
  // This prevents flicker when user state is still loading from localStorage
  useEffect(() => {
    if (DEBUG) {
      console.log("[HOME useEffect: auth/redirect]", {
        pathname,
        isInitialized,
        user: user ? { id: user.id, role: user.role, category_count: user.category_count } : null,
        redirected: redirectedRef.current,
      });
    }
    
    // Don't run redirect logic until auth state is fully initialized
    if (!isInitialized) {
      if (DEBUG) console.log("[HOME useEffect: auth/redirect] Waiting for initialization...");
      return;
    }

    // Guard: Only redirect once AND only if not already on target path
    if (redirectedRef.current) {
      if (DEBUG) console.log("[HOME useEffect: auth/redirect] Already redirected, skipping");
      setLoading(false);
      return;
    }

    // Guard: Only run redirect logic when on home page ("/")
    // This prevents redirect loops and unnecessary checks on other pages
    if (pathname !== "/") {
      if (DEBUG) console.log("[HOME useEffect: auth/redirect] Not on home page, skipping redirect check", { pathname });
      setLoading(false);
      return;
    }

    // 👤 GUEST USER: No user in context → Allow access, stay on HomePage
    // NO redirect to /auth/login - this is a public landing page
    if (!user) {
      if (DEBUG) console.log("[HOME useEffect: auth/redirect] Guest user, allowing access");
      setLoading(false);
      return;
    }

    // 🔐 LOGGED-IN USER: Apply redirect logic based on role/state
    // 👑 ADMIN: Redirect to admin dashboard (admin should not see public homepage)
    // Since this is the "/" route, we know pathname is "/", so no need to check for "/admin"
    if (user.role === "admin") {
      if (DEBUG) console.log("[HOME useEffect: auth/redirect] Admin user, redirecting to /admin");
      redirectedRef.current = true;
      setLoading(false);
      router.replace("/admin");
      return;
    }

    // 🆕 USER WITHOUT CATEGORIES: Redirect to onboarding (user must select categories first)
    // Since we're already on "/", we can safely redirect to onboarding
    if (
      user.role === "user" &&
      (!user.category_count || user.category_count === 0)
    ) {
      if (DEBUG) console.log("[HOME useEffect: auth/redirect] User without categories, redirecting to onboarding", {
        category_count: user.category_count,
        current_path: pathname,
      });
      redirectedRef.current = true;
      setLoading(false);
      router.replace("/onboarding/categories");
      return;
    }

    if (DEBUG) console.log("[HOME useEffect: auth/redirect] User allowed, setting loading false");
    setLoading(false);
  }, [user, isInitialized, pathname]); // Removed router from deps (it's stable)

 
  /**
   * Pick random items from array using Fisher-Yates shuffle
   */
  const pickRandom = <T,>(arr: T[], n: number): T[] => {
    if (arr.length === 0) return [];
    const copy = [...arr];
    // Fisher-Yates shuffle
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, Math.min(n, copy.length));
  };
 
  // Use useCallback to stabilize loadPopularBooks function
  const loadPopularBooks = useCallback(async (tab: "week" | "month") => {
    if (DEBUG) console.log("[HOME loadPopularBooks] Starting fetch for tab:", tab);
    
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setLoadingPopular(true);
    try {
      // Try to fetch popular books with timeframe parameter
      const books = await fetchPopularBooks(5, tab);
      
      // Check if request was aborted
      if (abortController.signal.aborted) {
        if (DEBUG) console.log("[HOME loadPopularBooks] Request aborted");
        return;
      }
      
      // If popular books is empty, use random books as fallback
      if (books.length === 0) {
        setIsPopularFallback(true);
        try {
          // Fetch random books as fallback
          const randomBooks = await fetchBooks({ limit: 50, random: true });
          
          if (abortController.signal.aborted) {
            if (DEBUG) console.log("[HOME loadPopularBooks] Request aborted during fallback");
            return;
          }
          
          if (randomBooks.length >= 5) {
            const pickedBooks = pickRandom(randomBooks, 5);
            setPopularBooks(pickedBooks as Book[]);
          } else if (randomBooks.length > 0) {
            setPopularBooks(randomBooks as Book[]);
          } else {
            // If no books available, use allBooks if available
            if (allBooks.length >= 5) {
              setPopularBooks(pickRandom(allBooks, 5));
            } else if (allBooks.length > 0) {
              setPopularBooks(allBooks);
            } else {
              setPopularBooks([]);
            }
          }
        } catch (fallbackErr) {
          if (abortController.signal.aborted) return;
          console.error("Fallback fetch failed:", fallbackErr);
          // Use allBooks if available as last resort
          if (allBooks.length >= 5) {
            setPopularBooks(pickRandom(allBooks, 5));
          } else if (allBooks.length > 0) {
            setPopularBooks(allBooks);
          } else {
            setPopularBooks([]);
          }
        }
      } else {
        setIsPopularFallback(false);
        setPopularBooks(books);
      }
    } catch (err: any) {
      if (abortController.signal.aborted) {
        if (DEBUG) console.log("[HOME loadPopularBooks] Request aborted");
        return;
      }
      console.error("Failed to fetch popular books:", err);
      setIsPopularFallback(true);
      // On error, try fallback
      try {
        const randomBooks = await fetchBooks({ limit: 50, random: true });
        
        if (abortController.signal.aborted) return;
        
        if (randomBooks.length >= 5) {
          setPopularBooks(pickRandom(randomBooks, 5));
        } else if (randomBooks.length > 0) {
          setPopularBooks(randomBooks);
        } else if (allBooks.length >= 5) {
          setPopularBooks(pickRandom(allBooks, 5));
        } else if (allBooks.length > 0) {
          setPopularBooks(allBooks);
        } else {
          setPopularBooks([]);
        }
      } catch (fallbackErr) {
        // Use allBooks as last resort
        if (abortController.signal.aborted) return;
        if (allBooks.length >= 5) {
          setPopularBooks(pickRandom(allBooks, 5));
        } else if (allBooks.length > 0) {
          setPopularBooks(allBooks);
        } else {
          setPopularBooks([]);
        }
      }
    } finally {
      // Only update loading state if not aborted
      if (!abortController.signal.aborted) {
        setLoadingPopular(false);
        if (DEBUG) console.log("[HOME loadPopularBooks] Fetch completed");
      }
    }
  }, [allBooks]); // Only depend on allBooks

  // Fetch books for public Home page (นิยายทั้งหมด - Recommended Novels section)
  useEffect(() => {
    if (DEBUG) console.log("[HOME useEffect: fetchBooks]", { loading, dataFetched: dataFetchedRef.current });
    
    if (loading) {
      if (DEBUG) console.log("[HOME useEffect: fetchBooks] Waiting for auth check...");
      return; // Wait for auth check to complete
    }
    
    // Guard: Only fetch once
    if (dataFetchedRef.current) {
      if (DEBUG) console.log("[HOME useEffect: fetchBooks] Already fetched, skipping");
      return;
    }

    const fetchData = async () => {
      if (DEBUG) console.log("[HOME useEffect: fetchBooks] Starting fetch");
      setLoadingBooks(true);
      try {
        // Use sort=recommended for ranking by rating/favorites
        const books = await fetchBooks({ limit: 12, random: false, sort: "recommended" });
        setAllBooks(books);
        dataFetchedRef.current = true;
        if (DEBUG) console.log("[HOME useEffect: fetchBooks] Fetch completed, books:", books.length);
      } catch (err) {
        console.error("Failed to fetch books:", err);
        setAllBooks([]);
        dataFetchedRef.current = true; // Mark as fetched even on error to prevent retry loop
      } finally {
        setLoadingBooks(false);
      }
    };

    fetchData();
  }, [loading]);

  // Load popular books when tab changes
  useEffect(() => {
    if (DEBUG) console.log("[HOME useEffect: loadPopularBooks]", { loading, activeTab, redirected: redirectedRef.current });
    
    if (loading || redirectedRef.current) {
      if (DEBUG) console.log("[HOME useEffect: loadPopularBooks] Skipping (loading or redirected)");
      return;
    }
    
    loadPopularBooks(activeTab);
  }, [activeTab, loading, loadPopularBooks]);

  // Load categories for sidebar section
  useEffect(() => {
    if (DEBUG) console.log("[HOME useEffect: loadCategories]", { loading, redirected: redirectedRef.current });
    
    if (loading || redirectedRef.current) {
      if (DEBUG) console.log("[HOME useEffect: loadCategories] Skipping (loading or redirected)");
      return;
    }

    const loadCategories = async () => {
      if (DEBUG) console.log("[HOME useEffect: loadCategories] Starting fetch");
      setLoadingCategories(true);
      try {
        const data = await apiGet("/categories", false);
        const items: Category[] = Array.isArray(data) ? data : [];
        setCategories(items.slice(0, 8)); // limit to 8
        if (DEBUG) console.log("[HOME useEffect: loadCategories] Fetch completed, categories:", items.length);
      } catch (err) {
        console.error("Failed to fetch categories:", err);
        setCategories([]);
      } finally {
        setLoadingCategories(false);
      }
    };

    loadCategories();
  }, [loading]);
  
  // Cleanup: Abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        if (DEBUG) console.log("[HOME cleanup] Aborted in-flight requests");
      }
    };
  }, []);

  if (loading) return null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
      <Navbar showBackButton={false} />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Popular Today Section */}
        <PopularTodaySection />

        {/* MAIN CONTENT */}
        <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,0.85fr)] gap-6">
          {/* LEFT: Main content sections */}
          <div className="space-y-6">
            {/* นิยายทั้งหมด */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
              {/* Header */}
              <div className="flex items-center px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-orange-400 to-amber-300 rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs text-white font-semibold">
                    📚
                  </span>
                  <h2 className="text-white font-semibold text-sm md:text-base">
                    นิยายแนะนำ
                  </h2>
                </div>
              </div>

              {/* Grid */}
              {loadingBooks ? (
                // Skeleton loading state
                <div className="p-4 sm:p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div
                      key={i}
                      className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden"
                    >
                      <div className="relative w-full aspect-[2/3] overflow-hidden rounded-xl bg-slate-200 animate-pulse" />
                      <div className="px-3 pt-2 pb-3 space-y-2">
                        <div className="h-3 rounded bg-slate-200 animate-pulse" />
                        <div className="h-2.5 rounded bg-slate-200 animate-pulse w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : allBooks.length === 0 ? (
                <div className="p-4 sm:p-5 text-center text-sm text-slate-500">
                  ไม่พบนิยาย
                </div>
              ) : (
                <div className="p-4 sm:p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {allBooks.map((book) => {
                    // Robust id extraction: prefer id, fallback to book_id (legacy support)
                    const bookId = book?.id ?? (book as any)?.book_id;
                    const numericId = typeof bookId === "number" ? bookId : Number(bookId);
                    
                    // Safety check: Skip books without valid id
                    if (!book || !numericId || Number.isNaN(numericId) || numericId <= 0) {
                      if (process.env.NODE_ENV === "development") {
                        console.warn("Home page: book.id is missing or invalid", book);
                      }
                      return null;
                    }
                    const coverUrl = resolveBookCover(book.cover_image);
                    return (
                      <Link
                        key={numericId}
                        href={`/books/${numericId}`}
                        className="group bg-slate-50 rounded-xl border border-slate-100 overflow-hidden shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:shadow-[0_10px_25px_rgba(15,23,42,0.12)] hover:-translate-y-1 transition-all cursor-pointer"
                      >
                        {/* cover */}
                        <div className="relative w-full aspect-[2/3] overflow-hidden rounded-xl bg-slate-100">
                          <img
                            src={coverUrl}
                            alt={book.title || "Book cover"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>

                        {/* detail */}
                        <div className="px-3 pt-2 pb-3">
                          <p className="text-xs font-semibold line-clamp-2 group-hover:text-orange-500">
                            {book.title || "ไม่มีชื่อเรื่อง"}
                          </p>
                          {book.author && (
                            <p className="mt-1 text-[11px] text-slate-500 line-clamp-1">
                              {book.author}
                            </p>
                          )}
                          {book.categories && book.categories.length > 0 ? (
                            <p className="mt-1 text-[11px] text-slate-500 line-clamp-1">
                              {book.categories.slice(0, 2).join(", ")}
                            </p>
                          ) : null}
                          {user && (
                            <div className="mt-2 flex items-center justify-end">
                              <button
                                type="button"
                                aria-label="add bookmark"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // TODO: Implement favorite functionality:
                                  // - Call POST /api/favorites/:bookId to add favorite
                                  // - Call DELETE /api/favorites/:bookId to remove favorite
                                  // - Update UI state to reflect favorite status
                                  // - Show visual feedback (filled/unfilled star)
                                }}
                                className="h-6 w-6 rounded-full border border-slate-200 flex items-center justify-center text-[11px] bg-white hover:bg-orange-50 hover:border-orange-300 hover:text-orange-500"
                              >
                                ☆
                              </button>
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Sidebar (Popular Novels + Categories) */}
          <aside className="sticky top-24 space-y-4">
            {/* นิยายยอดนิยม */}
            {/* NOTE: This section displays real book data from database, but popularity
                sorting is not implemented. All tabs (week/month/all) currently show
                random/unsorted books. Real popularity metrics (views, favorites, ratings)
                will be implemented in the future. */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
              {/* Header */}
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm md:text-base">
                  นิยายยอดนิยม
                </h2>
                  {isPopularFallback && !loadingPopular && (
                    <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                      สุ่มแนะนำ
                    </span>
                  )}
                </div>
              </div>

              {/* Tabs */}
              {/* NOTE: Tabs are functional but all show random/unsorted data until
                  popularity metrics are implemented on the backend */}
              <div className="flex text-xs border-b border-slate-100">
                <button
                  onClick={() => setActiveTab("week")}
                  className={`flex-1 py-2 transition-colors ${
                    activeTab === "week"
                      ? "bg-white font-semibold text-orange-500 border-b-2 border-orange-400"
                      : "hover:bg-slate-50 text-slate-500"
                  }`}
                >
                  รายสัปดาห์
                </button>
                <button
                  onClick={() => setActiveTab("month")}
                  className={`flex-1 py-2 transition-colors ${
                    activeTab === "month"
                      ? "bg-white font-semibold text-orange-500 border-b-2 border-orange-400"
                      : "hover:bg-slate-50 text-slate-500"
                  }`}
                >
                  รายเดือน
                </button>
              </div>

              {/* Popular list */}
              {loadingPopular ? (
                // Skeleton loading state
                <div className="divide-y divide-slate-100">
                  {[1, 2, 3, 4, 5].map((rank) => (
                    <div
                      key={rank}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="flex items-center justify-center w-5 flex-shrink-0">
                        <div className="h-5 w-5 rounded-full bg-slate-200 animate-pulse" />
                      </div>
                      <div className="w-16 h-24 rounded-md bg-slate-200 animate-pulse flex-shrink-0 shadow-sm" />
                      <div className="flex-1 space-y-1.5 min-w-0 max-w-[140px]">
                        <div className="h-4 rounded bg-slate-200 animate-pulse" />
                        <div className="w-24 h-2.5 rounded bg-slate-200 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : popularBooks.length === 0 ? (
                // This should rarely happen due to fallback, but show loading skeleton
                <div className="divide-y divide-slate-100">
                  {[1, 2, 3, 4, 5].map((rank) => (
                    <div
                      key={rank}
                      className="flex items-center gap-4 px-4 py-3"
                    >
                      <div className="flex items-center justify-center w-5 flex-shrink-0">
                        <div className="h-5 w-5 rounded-full bg-slate-200 animate-pulse" />
                      </div>
                      <div className="w-16 h-24 rounded-md bg-slate-200 animate-pulse flex-shrink-0 shadow-sm" />
                      <div className="flex-1 space-y-1.5 min-w-0 max-w-[140px]">
                        <div className="h-4 rounded bg-slate-200 animate-pulse" />
                        <div className="w-24 h-2.5 rounded bg-slate-200 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {popularBooks.map((book, index) => {
                    // Robust id extraction: prefer id, fallback to book_id (legacy support)
                    const bookId = book?.id ?? (book as any)?.book_id;
                    const numericId = typeof bookId === "number" ? bookId : Number(bookId);
                    
                    // Safety check: Skip books without valid id
                    if (!book || !numericId || Number.isNaN(numericId) || numericId <= 0) {
                      if (process.env.NODE_ENV === "development") {
                        console.warn("Home page popular: book.id is missing or invalid", book);
                      }
                      return null;
                    }
                    const coverUrl = resolveBookCover(book.cover_image);
                    return (
                      <Link
                        key={numericId}
                        href={`/books/${numericId}`}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors cursor-pointer rounded-sm"
                      >
                        <div className="flex items-center justify-center w-5 flex-shrink-0">
                          <span className="h-5 w-5 rounded-full bg-orange-100 text-[10px] text-orange-600 flex items-center justify-center font-medium">
                            {index + 1}
                          </span>
                        </div>
                        <div className="relative w-16 h-24 overflow-hidden rounded-md bg-slate-100 shadow-sm flex-shrink-0">
                          <img
                            src={coverUrl}
                            alt={book.title || "Book cover"}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 space-y-1.5 min-w-0 max-w-[140px]">
                          <div className="font-medium text-sm text-slate-800 line-clamp-2 leading-tight">
                            {book.title || "ไม่มีชื่อเรื่อง"}
                          </div>
                          {book.categories && book.categories.length > 0 ? (
                            <div className="text-[10px] text-slate-500 line-clamp-1">
                              {book.categories.slice(0, 2).join(", ")}
                            </div>
                          ) : null}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}

              <div className="px-4 py-3 text-[11px] text-right text-slate-400 border-t border-slate-100 bg-slate-50 rounded-b-2xl">

              </div>
            </div>

            {/* Categories section */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                <h2 className="font-semibold text-sm md:text-base">
                  หมวดหมู่นิยาย
                </h2>
              </div>
              <div className="px-4 py-4">
                {loadingCategories ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <div
                        key={i}
                        className="h-12 rounded-xl bg-slate-100 animate-pulse"
                      />
                    ))}
                  </div>
                ) : categories.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-2">
                    ยังไม่มีหมวดหมู่
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {categories.map((cat) => {
                      // Map category slugs to emojis (optional enhancement)
                      const categoryEmojis: Record<string, string> = {
                        romance: "💖",
                        fantasy: "⚔️",
                        "sci-fi": "🚀",
                        horror: "👻",
                        mystery: "🔍",
                        comedy: "😂",
                        drama: "🎭",
                        action: "💥",
                      };
                      const emoji = categoryEmojis[cat.slug?.toLowerCase() || ""] || "📚";
                      
                      // Use code if available, fallback to slug for backward compatibility
                      const categoryCode = cat.code || cat.slug;
                      return (
                        <Link
                          key={cat.id}
                          href={`/search?category=${encodeURIComponent(categoryCode)}`}
                          className="flex items-center justify-center gap-2 h-12 px-4 rounded-xl border border-orange-200 bg-orange-50 text-xs font-medium text-orange-700 hover:bg-orange-100 hover:border-orange-300 hover:text-orange-800 hover:shadow-sm transition-all duration-200 text-center"
                        >
                          <span className="text-sm flex-shrink-0">{emoji}</span>
                          <span className="line-clamp-2">{cat.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </section>
      </div>

      {/* Toast Notification */}
      {toast.open && (
        <div className="fixed top-5 right-5 z-[60]">
          <div
            className={`w-[320px] rounded-2xl border shadow-xl px-4 py-3 bg-white ${
              toast.type === "success"
                ? "border-emerald-200"
                : "border-red-200"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold ${
                  toast.type === "success"
                    ? "bg-emerald-500"
                    : "bg-red-500"
                }`}
              >
                {toast.type === "success" ? "✓" : "!"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">
                  {toast.title}
                </div>
              </div>

              <button
                className="ml-auto text-slate-400 hover:text-slate-700 font-semibold"
                onClick={() => setToast((p) => ({ ...p, open: false }))}
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
