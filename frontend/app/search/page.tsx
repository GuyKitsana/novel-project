"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { fetchBooksWithFilters, fetchCategories, fetchAuthors, fetchPublishers } from "@/app/services/api";
import Navbar from "@/app/components/Navbar";
import BookCard from "@/app/components/BookCard";

interface Book {
  id: number;
  title: string;
  author?: string;
  cover_image?: string | null;
  categories?: string[];
  rating_avg?: number;
  reviews_count?: number;
}

interface Category {
  id: number;
  name: string;
  code: string;
}

const ITEMS_PER_PAGE = 20;

// Debug logging flag (only enabled when NEXT_PUBLIC_DEBUG_SEARCH=1)
const DEBUG_SEARCH = process.env.NEXT_PUBLIC_DEBUG_SEARCH === "1";

// Snapshot type for loadBooks to avoid stale closures
type FiltersSnapshot = {
  q?: string;
  categories?: number[];
  authors?: string[];
  publishers?: string[];
  offset: number;
  limit: number;
};

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Filter options
  const [categories, setCategories] = useState<Category[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [publishers, setPublishers] = useState<string[]>([]);

  // Selected filters
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [selectedPublishers, setSelectedPublishers] = useState<string[]>([]);

  // Request sequence guard to prevent race conditions
  const requestSeqRef = useRef(0);
  // AbortController to cancel previous in-flight requests when a new one starts
  const abortRef = useRef<AbortController | null>(null);
  // Skip first run of debounced search effect to prevent overwriting filtered results
  const didMountRef = useRef(false);
  // Gate to prevent initial unfiltered fetch until URL category param is processed
  const [filtersReady, setFiltersReady] = useState(false);
  // Track if we've completed the initial load (to allow category param processing after initial load)
  const initialLoadCompleteRef = useRef(false);
  
  // Debug: Log render state (after all state declarations)
  if (DEBUG_SEARCH) {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "SSR";
    console.log("[SearchContent render]", {
      url: currentUrl,
      searchParams: searchParams.toString(),
      filtersReady,
      selectedCategories,
      booksLength: books.length,
      loading,
    });
  }

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [catData, authorData, publisherData] = await Promise.all([
          fetchCategories(),
          fetchAuthors(),
          fetchPublishers(),
        ]);
        setCategories(catData);
        setAuthors(authorData);
        setPublishers(publisherData);
      } catch (err) {
        console.error("Failed to load filter options:", err);
      }
    };
    loadFilterOptions();
  }, []);

  // Handle category query param from URL (e.g., /search?category=romance)
  useEffect(() => {
    // Wait for categories to be loaded
    if (categories.length === 0) {
      return;
    }

    const categoryParam = searchParams.get("category");
    
    // On initial mount (before filtersReady), we need to process and set filtersReady
    // After initial load, we still need to process category params for navigation
    if (!filtersReady) {
      // Initial mount: process category param and mark filters as ready
      if (!categoryParam) {
        // No category param, filters are ready
        setFiltersReady(true);
        return;
      }

      // Category param exists - find and apply it
      // For URL navigation, replace (don't merge) to ensure URL category is the only one selected
      const category = categories.find(
        (cat) => cat.code?.toLowerCase() === categoryParam.toLowerCase()
      );
      
      if (category) {
        // Replace categories with the URL category (not merge) for initial navigation
        if (DEBUG_SEARCH) {
          console.log("[CategoryParamEffect] Applying category from URL", {
            categoryParam,
            categoryId: category.id,
            categoryName: category.name,
          });
        }
        setSelectedCategories([category.id]);
      }
      
      // Mark filters as ready after processing (even if no match found)
      if (DEBUG_SEARCH) {
        console.log("[CategoryParamEffect] Setting filtersReady=true", {
          categoryParam,
          matchedCategory: !!category,
        });
      }
      setFiltersReady(true);
    } else {
      // After initial load: still process category param changes for navigation
      // When navigating from Home with category param, replace (don't merge) categories
      if (!categoryParam) {
        return;
      }

      const category = categories.find(
        (cat) => cat.code?.toLowerCase() === categoryParam.toLowerCase()
      );
      
      if (category) {
        // Replace categories with the URL category (not merge) for navigation from Home
        // This ensures clicking a category on Home sets that category exclusively
        if (DEBUG_SEARCH) {
          console.log("[CategoryParamEffect] Replacing category from URL navigation", {
            categoryParam,
            categoryId: category.id,
            categoryName: category.name,
          });
        }
        setSelectedCategories([category.id]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, searchParams]); // React to category param changes in URL

  // Helper to build snapshot from current state (prevents stale closures)
  const buildSnapshot = (reset: boolean, currentOffset?: number): FiltersSnapshot => ({
    q: searchQuery.trim() || undefined,
    categories: selectedCategories.length ? selectedCategories : undefined,
    authors: selectedAuthors.length ? selectedAuthors : undefined,
    publishers: selectedPublishers.length ? selectedPublishers : undefined,
    limit: ITEMS_PER_PAGE,
    offset: reset ? 0 : (currentOffset ?? offset),
  });

  // Load books function with snapshot support and AbortController
  const loadBooks = async (
    reset = false,
    currentOffset?: number,
    snapshot?: FiltersSnapshot
  ) => {
    // Abort previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    
    // Create new AbortController for this request
    const controller = new AbortController();
    abortRef.current = controller;
    
    // Increment and capture sequence number for this request
    const seq = ++requestSeqRef.current;
    
    // Use snapshot if provided (prevents stale closures), otherwise use current state
    const filters = snapshot ?? buildSnapshot(reset, currentOffset);
    
    if (DEBUG_SEARCH) {
      const payload = {
        q: filters.q,
        categories: filters.categories,
        authors: filters.authors,
        publishers: filters.publishers,
        limit: filters.limit,
        offset: filters.offset,
      };
      console.log(`[loadBooks] START seq=${seq} reset=${reset} snapshot=${!!snapshot}`, payload);
    }

    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      // Build query params for fetch with abort signal support
      const params = new URLSearchParams();
      if (filters.q) params.append("q", filters.q);
      params.append("limit", filters.limit.toString());
      params.append("offset", filters.offset.toString());
      
      if (filters.categories && filters.categories.length > 0) {
        filters.categories.forEach((cat) => {
          params.append("categories", cat.toString());
        });
      }
      
      if (filters.authors && filters.authors.length > 0) {
        filters.authors.forEach((author) => {
          params.append("authors", author);
        });
      }
      
      if (filters.publishers && filters.publishers.length > 0) {
        filters.publishers.forEach((publisher) => {
          params.append("publishers", publisher);
        });
      }
      
      // Fetch directly with abort signal (API URL logic matches api.ts)
      const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
      const API_URL = envUrl
        ? (envUrl.replace(/\/+$/, "").endsWith("/api")
            ? envUrl.replace(/\/+$/, "")
            : `${envUrl.replace(/\/+$/, "")}/api`)
        : "http://localhost:3001/api";
      
      const fullUrl = `${API_URL}/books?${params.toString()}`;
      
      if (DEBUG_SEARCH) {
        console.log("[loadBooks] Fetch URL:", fullUrl);
      }
      
      const response = await fetch(fullUrl, {
        signal: controller.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      const result = {
        items: Array.isArray(data.items) ? data.items : [],
        total: data.total || 0,
        page: data.page || 1,
        limit: data.limit || filters.limit,
      };

      // Defensive guard: Check if request was aborted or is no longer latest
      if (controller.signal.aborted) {
        if (DEBUG_SEARCH) {
          console.log(`[loadBooks] ABORTED seq=${seq}`);
        }
        return;
      }
      
      if (seq !== requestSeqRef.current) {
        if (DEBUG_SEARCH) {
          console.log(`[loadBooks] STALE seq=${seq} (current=${requestSeqRef.current})`);
        }
        return;
      }

      if (reset) {
        setBooks(result.items);
        setOffset(ITEMS_PER_PAGE);
      } else {
        setBooks((prev) => [...prev, ...result.items]);
        setOffset((prev) => prev + ITEMS_PER_PAGE);
      }

      setTotal(result.total);
      setHasMore(result.items.length === ITEMS_PER_PAGE);
      
      if (DEBUG_SEARCH) {
        console.log(`[loadBooks] SUCCESS seq=${seq}`, {
          itemsCount: result.items.length,
          total: result.total,
        });
      }
      
      // Mark initial load as complete after first successful load
      if (!initialLoadCompleteRef.current) {
        initialLoadCompleteRef.current = true;
      }
    } catch (err: any) {
      // Ignore abort errors
      if (err.name === "AbortError") {
        if (DEBUG_SEARCH) {
          console.log(`[loadBooks] ABORTED seq=${seq}`);
        }
        return;
      }
      
      // Guard: Only log error if this is still the latest request and not aborted
      if (seq === requestSeqRef.current && !controller.signal.aborted) {
        console.error("Failed to load books:", err);
      }
    } finally {
      // Guard: Only update loading states if this is still the latest request
      if (seq === requestSeqRef.current && !controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  // Initial load and when filters change
  useEffect(() => {
    // Don't load until filters are ready (categories loaded and URL category processed)
    if (!filtersReady) {
      return;
    }
    
    // Build snapshot with special handling for URL category param to avoid stale closure issues
    // If category param exists but selectedCategories is still empty (due to batching),
    // resolve category ID directly from URL param and use it in snapshot
    const categoryParam = searchParams.get("category");
    let snapshotCategories = selectedCategories;
    
    // If URL has category param but selectedCategories is still empty (React batching issue),
    // resolve the category ID directly from the URL to use in snapshot
    if (categoryParam && selectedCategories.length === 0 && !initialLoadCompleteRef.current) {
      const category = categories.find(
        (cat) => cat.code?.toLowerCase() === categoryParam.toLowerCase()
      );
      if (category) {
        snapshotCategories = [category.id];
      } else {
        // Category param exists but no match - wait for selectedCategories to update
        return;
      }
    }
    
    // Build snapshot with resolved category (if needed) to ensure correct filters are used
    const snapshot: FiltersSnapshot = {
      q: searchQuery.trim() || undefined,
      categories: snapshotCategories.length ? snapshotCategories : undefined,
      authors: selectedAuthors.length ? selectedAuthors : undefined,
      publishers: selectedPublishers.length ? selectedPublishers : undefined,
      limit: ITEMS_PER_PAGE,
      offset: 0,
    };
    
    loadBooks(true, undefined, snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersReady, searchParams, selectedCategories, selectedAuthors, selectedPublishers]);

  // Debounced search
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    
    const timer = setTimeout(() => {
      loadBooks(true, undefined, buildSnapshot(true));
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleCategoryToggle = (categoryId: number) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleAuthorToggle = (author: string) => {
    setSelectedAuthors((prev) =>
      prev.includes(author)
        ? prev.filter((a) => a !== author)
        : [...prev, author]
    );
  };

  const handlePublisherToggle = (publisher: string) => {
    setSelectedPublishers((prev) =>
      prev.includes(publisher)
        ? prev.filter((p) => p !== publisher)
        : [...prev, publisher]
    );
  };

    const handleClearFilters = () => {
      if (DEBUG_SEARCH) {
        console.log("[handleClearFilters] Clearing filters and navigating to /search");
      }
      setSearchQuery("");
      setSelectedCategories([]);
      setSelectedAuthors([]);
      setSelectedPublishers([]);
      router.push("/search");
    };

  const handleLoadMore = () => {
    loadBooks(false, undefined, buildSnapshot(false));
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedCategories.length > 0 ||
    selectedAuthors.length > 0 ||
    selectedPublishers.length > 0;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left: Filter Panel */}
      <aside className="lg:w-[260px] flex-shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-20 max-h-[calc(100vh-5rem)] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-700">ตัวกรอง</h2>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                ล้างทั้งหมด
              </button>
            )}
          </div>

          {/* Categories Filter */}
          <div className="mb-6">
            <h3 className="text-sm text-slate-600 mb-3">หมวดหมู่</h3>
            <div className="max-h-[360px] overflow-y-auto pr-2 space-y-2">
              {categories.map((cat) => (
                <label
                  key={cat.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat.id)}
                    onChange={() => handleCategoryToggle(cat.id)}
                    className="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-400"
                  />
                  <span className="text-sm text-slate-700">{cat.name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Authors Filter */}
          <div className="mb-6">
            <h3 className="text-sm text-slate-600 mb-3">ผู้แต่ง</h3>
            <div className="max-h-[360px] overflow-y-auto pr-2 space-y-2">
              {authors.slice(0, 50).map((author) => (
                <label
                  key={author}
                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedAuthors.includes(author)}
                    onChange={() => handleAuthorToggle(author)}
                    className="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-400"
                  />
                  <span className="text-sm text-slate-700">{author}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Publishers Filter */}
          <div className="mb-6">
            <h3 className="text-sm text-slate-600 mb-3">สำนักพิมพ์</h3>
            <div className="max-h-[360px] overflow-y-auto pr-2 space-y-2">
              {publishers.slice(0, 50).map((publisher) => (
                <label
                  key={publisher}
                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-2 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedPublishers.includes(publisher)}
                    onChange={() => handlePublisherToggle(publisher)}
                    className="w-4 h-4 text-orange-500 border-slate-300 rounded focus:ring-orange-400"
                  />
                  <span className="text-sm text-slate-700">{publisher}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Right: Results */}
      <div className="flex-1 min-w-0">
        {/* Search Form */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-6 mb-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadBooks(true, undefined, buildSnapshot(true));
            }}
            className="flex gap-3"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="ค้นหาจากชื่อเรื่อง, ผู้แต่ง, หรือเรื่องย่อ"
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-slate-900"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "กำลังค้นหา..." : "ค้นหา"}
            </button>
          </form>
        </div>

        {/* Results */}
        {loading && books.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden"
              >
                <div className="relative w-full aspect-[2/3] overflow-hidden rounded-t-xl bg-slate-200 animate-pulse" />
                <div className="px-3 pt-2 pb-3 space-y-2">
                  <div className="h-3 rounded bg-slate-200 animate-pulse" />
                  <div className="h-2.5 rounded bg-slate-200 animate-pulse w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : books.length === 0 && !hasActiveFilters ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              ไม่พบหนังสือ
            </h2>
            <p className="text-sm text-slate-600">
              ใช้ตัวกรองด้านซ้ายเพื่อค้นหาหนังสือที่คุณต้องการ
            </p>
          </div>
        ) : books.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              ไม่พบผลการค้นหา
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              ลองเปลี่ยนตัวกรองหรือคำค้นหาดูสิ
            </p>
            <button
              onClick={handleClearFilters}
              className="px-6 py-2.5 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
            >
              ล้างตัวกรอง
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={{
                    id: book.id,
                    title: book.title,
                    author: book.author,
                    cover_image: book.cover_image,
                    categories: book.categories,
                    rating_avg: book.rating_avg,
                    reviews_count: book.reviews_count,
                  }}
                  showRating={true}
                />
              ))}
            </div>

            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? "กำลังโหลด..." : "โหลดเพิ่มเติม"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
      <Navbar showBackButton={false} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Suspense fallback={<div className="text-center py-12">กำลังโหลด...</div>}>
          <SearchContent />
        </Suspense>
      </div>
    </main>
  );
}
