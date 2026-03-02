"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getRecommendationsMe, fetchPopularBooks } from "@/app/services/api";
import Navbar from "@/app/components/Navbar";
import BookCard from "@/app/components/BookCard";
import LoadingSkeleton from "@/app/components/LoadingSkeleton";
import ErrorState from "@/app/components/ErrorState";
import { useAuth } from "@/app/context/AuthContext";

interface Book {
  id: number;
  title: string;
  author?: string | null;
  publisher?: string | null;
  description?: string | null;
  cover_image?: string | null;
  buy_link?: string | null;
  categories?: string[];
  rating_avg?: number;
  reviews_count?: number;
  favorites_count?: number;
  similarity?: number;
  reason?: string;
}

export default function RecommendPage() {
  const router = useRouter();
  const { user, isInitialized, authLoading } = useAuth();
  const [recommendations, setRecommendations] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to load recommendations (extracted for reuse)
  const loadRecommendations = async () => {
    setLoading(true);
    setError(null);
    try {
      // TEMP LOG: Track request (non-production only)
      if (process.env.NODE_ENV !== "production") {
        const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
        console.log("[RECOMMEND FRONTEND DEBUG] Request:", {
          hasToken: !!token,
          tokenLength: token?.length || 0,
        });
      }

      const data = await getRecommendationsMe(20);
      const items = data.items || [];

      // TEMP LOG: Track response (non-production only)
      if (process.env.NODE_ENV !== "production") {
        console.log("[RECOMMEND FRONTEND DEBUG] Response:", {
          status: "ok",
          itemsCount: items.length,
          firstBookId: items[0]?.id || null,
        });
      }

      // FRONTEND FALLBACK: If recommendations are empty, fetch popular books as fallback
      if (items.length === 0) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[RECOMMEND FRONTEND DEBUG] Empty recommendations, fetching popular books as fallback");
        }
        try {
          const popularBooks = await fetchPopularBooks(20, "all");
          if (popularBooks.length > 0) {
            // Map popular books to match Book interface
            const fallbackBooks: Book[] = popularBooks.map((book: any) => ({
              id: book.id,
              title: book.title || "",
              author: book.author || null,
              publisher: book.publisher || null,
              description: book.description || null,
              cover_image: book.cover_image || null,
              buy_link: book.buy_link || null,
              categories: book.categories || [],
              rating_avg: book.rating_avg || 0,
              reviews_count: book.reviews_count || 0,
              favorites_count: book.favorites_count || 0,
              reason: "popular_fallback",
            }));
            setRecommendations(fallbackBooks);
          } else {
            // Still empty, set empty array (will show empty state)
            setRecommendations([]);
          }
        } catch (fallbackErr) {
          console.error("Failed to load fallback popular books:", fallbackErr);
          // Set empty array (will show empty state)
          setRecommendations([]);
        }
      } else {
        setRecommendations(items);
      }
    } catch (err: any) {
      console.error("Failed to load recommendations:", err);

      // TEMP LOG: Track error (non-production only)
      if (process.env.NODE_ENV !== "production") {
        console.log("[RECOMMEND FRONTEND DEBUG] Error:", {
          status: err.status || "unknown",
          message: err.message || "unknown",
        });
      }

      // Try fallback on error
      try {
        const popularBooks = await fetchPopularBooks(20, "all");
        if (popularBooks.length > 0) {
          const fallbackBooks: Book[] = popularBooks.map((book: any) => ({
            id: book.id,
            title: book.title || "",
            author: book.author || null,
            publisher: book.publisher || null,
            description: book.description || null,
            cover_image: book.cover_image || null,
            buy_link: book.buy_link || null,
            categories: book.categories || [],
            rating_avg: book.rating_avg || 0,
            reviews_count: book.reviews_count || 0,
            favorites_count: book.favorites_count || 0,
            reason: "error_fallback",
          }));
          setRecommendations(fallbackBooks);
        } else {
          setError("ไม่สามารถโหลดคำแนะนำได้ กรุณาลองใหม่อีกครั้ง");
        }
      } catch (fallbackErr) {
        setError("ไม่สามารถโหลดคำแนะนำได้ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for auth to initialize
    if (!isInitialized || authLoading) {
      return;
    }

    // Check authentication
    if (!user) {
      router.replace("/auth/login");
      return;
    }

    // Check if user has categories selected
    if (!user.category_count || user.category_count === 0) {
      // Redirect to onboarding if no categories
      router.replace("/onboarding/categories");
      return;
    }

    loadRecommendations();
  }, [user, isInitialized, authLoading, router]);

  // Show loading state while auth is loading
  if (authLoading || !isInitialized) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          <LoadingSkeleton />
        </div>
      </main>
    );
  }

  // Show nothing while redirecting
  if (!user || (user.category_count === 0 || !user.category_count)) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
              📚 หนังสือที่เหมาะกับคุณ
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              คัดเลือกจากหมวดที่คุณสนใจ และพฤติกรรมการอ่านของคุณ
            </p>
          </div>
          {!loading && !error && recommendations.length > 0 && (
            <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700 border border-orange-100 whitespace-nowrap">
              รายการแนะนำ · {recommendations.length} เล่ม
            </span>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={() => {
              setError(null);
              setLoading(true);
              getRecommendationsMe(20)
                .then((data) => {
                  setRecommendations(data.items || []);
                })
                .catch((err) => {
                  console.error("Retry failed:", err);
                  setError("ไม่สามารถโหลดคำแนะนำได้ กรุณาลองใหม่อีกครั้ง");
                })
                .finally(() => {
                  setLoading(false);
                });
            }}
          />
        ) : recommendations.length === 0 ? (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-8 md:p-12 text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              ยังไม่มีคำแนะนำในขณะนี้
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              ลองเพิ่มหนังสือลงในบุ๊กมาร์กหรือให้คะแนนหนังสือเพื่อให้ระบบแนะนำหนังสือที่เหมาะสมกับคุณมากขึ้น
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/books"
                className="inline-block px-6 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
              >
                ดูหนังสือทั้งหมด
              </Link>
              <button
                onClick={loadRecommendations}
                className="inline-block px-6 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Recommendations Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {recommendations.map((book) => {
                const bookId = book?.id;
                if (!bookId || Number.isNaN(bookId) || bookId <= 0) {
                  return null;
                }
                return (
                  <BookCard
                    key={bookId}
                    book={{
                      id: bookId,
                      title: book.title || "",
                      author: book.author || undefined,
                      cover_image: book.cover_image,
                      rating_avg: book.rating_avg,
                      reviews_count: book.reviews_count,
                      favorites_count: book.favorites_count,
                      categories: book.categories,
                    }}
                    showRating={true}
                    size="md"
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
