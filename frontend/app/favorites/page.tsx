"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getFavorites, removeFavorite, resolveBookCover } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";
import Navbar from "@/app/components/Navbar";

interface FavoriteBook {
  id: number;
  title: string;
  author?: string;
  description?: string;
  publisher?: string;
  cover_image?: string | null;
  favorited_at: string;
  rating_avg?: number;
  categories?: string[];
}

// Custom FavoriteCard component with enhanced interactions
function FavoriteCard({ 
  book, 
  onRequestRemove,
  isRemoving 
}: { 
  book: FavoriteBook; 
  onRequestRemove: (id: number) => void;
  isRemoving: boolean;
}) {
  const coverUrl = resolveBookCover(book.cover_image);

  const handleRemoveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onRequestRemove(book.id);
  };

  // Robust id extraction: prefer id, fallback to book_id (legacy support)
  const bookId = book?.id ?? (book as any)?.book_id;
  const numericId = typeof bookId === "number" ? bookId : Number(bookId);

  // Safety check: Ensure book.id exists and is valid
  if (!book || !numericId || Number.isNaN(numericId) || numericId <= 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn("FavoriteCard: book.id is missing or invalid", book);
    }
    return (
      <div className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden opacity-50 cursor-not-allowed">
        <div className="relative w-full aspect-[2/3] overflow-hidden bg-slate-100">
          <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-xs text-center px-2">
            ไม่มี ID
          </div>
        </div>
        <div className="p-3">
          <h3 className="text-xs font-semibold text-slate-400 line-clamp-2 mb-1.5">
            {book?.title || "ไม่มีชื่อเรื่อง"}
          </h3>
        </div>
      </div>
    );
  }

  const bookDetailHref = `/books/${numericId}`;

  return (
    <Link
      href={bookDetailHref}
      className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
    >
      {/* Cover Image Container */}
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-slate-100">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title || "รูปปกหนังสือ"}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
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

        {/* Overlay Remove Button (appears on hover) */}
        <button
          onClick={handleRemoveClick}
          disabled={isRemoving}
          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          aria-label="ลบบุ๊กมาร์ก"
        >
          {isRemoving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg font-bold leading-none">×</span>
          )}
        </button>

        {/* Rating Badge (top-left) */}
        {book.rating_avg !== undefined && book.rating_avg > 0 && (
          <div className="absolute top-2 left-2 z-10">
            <div className="px-2 py-1 rounded-lg bg-white/95 backdrop-blur-sm shadow-md flex items-center gap-1">
              <span className="text-orange-500 text-xs">⭐</span>
              <span className="text-xs font-bold text-slate-900">
                {book.rating_avg.toFixed(1)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div className="p-3">
        {/* Title */}
        <h3 className="text-xs font-semibold text-slate-900 line-clamp-2 group-hover:text-orange-500 transition-colors mb-1.5">
          {book.title || "ไม่มีชื่อเรื่อง"}
        </h3>

        {/* Author */}
        {book.author && (
          <p className="text-[10px] text-slate-500 line-clamp-1 mb-1.5">
            {book.author}
          </p>
        )}

        {/* Category Badge */}
        {book.categories && book.categories.length > 0 && (
          <div className="mt-2">
            <span className="inline-block px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-[10px] font-medium border border-orange-200">
              {book.categories[0]}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

// Skeleton Card Component
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-slate-200 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-slate-200 rounded animate-pulse" />
        <div className="h-2.5 bg-slate-200 rounded w-3/4 animate-pulse" />
        <div className="h-5 bg-slate-200 rounded w-1/3 animate-pulse mt-2" />
      </div>
    </div>
  );
}

export default function FavoritesPage() {
  const router = useRouter();
  const { user, isInitialized, authLoading } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  
  // Confirmation modal state
  const [confirmDeleteBookId, setConfirmDeleteBookId] = useState<number | null>(null);
  
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

  // Auth guard: Check localStorage token
  useEffect(() => {
    if (!isInitialized || authLoading) return;

    const token = localStorage.getItem("token");
    if (!token || !user) {
      router.replace("/auth/login");
      return;
    }

    loadFavorites();
  }, [user, isInitialized, authLoading, router]);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getFavorites();
      const items = data.items || [];

      // Optionally enrich with book details (rating, categories) if needed
      // For now, we'll use the data as-is since favorites endpoint may not include these
      setFavorites(items);
    } catch (err: any) {
      console.error("Failed to load favorites:", err);
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูล");
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  // Request remove (opens confirmation modal)
  const handleRequestRemove = (bookId: number) => {
    setConfirmDeleteBookId(bookId);
  };

  // Confirm and execute remove
  const confirmRemoveFavorite = async () => {
    if (!confirmDeleteBookId) return;

    const bookId = confirmDeleteBookId;
    setConfirmDeleteBookId(null); // Close modal
    setRemovingId(bookId);

    // Optimistic update: remove from UI immediately
    const originalFavorites = [...favorites];
    setFavorites((prev) => prev.filter((book) => book.id !== bookId));

    try {
      await removeFavorite(bookId);
      showToast("success", "ลบออกจากบุ๊กมาร์กแล้ว");
    } catch (err: any) {
      console.error("Failed to remove favorite:", err);
      // Rollback on error
      setFavorites(originalFavorites);
      showToast("error", "เกิดข้อผิดพลาดในการลบบุ๊กมาร์ก กรุณาลองใหม่อีกครั้ง");
    } finally {
      setRemovingId(null);
    }
  };

  if (!isInitialized) {
    return null;
  }

  // Auth guard: redirect if no token
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (!token) {
      return null; // Will redirect in useEffect
    }
  }

  const bookToDelete = confirmDeleteBookId
    ? favorites.find((b) => b.id === confirmDeleteBookId)
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
      <Navbar showBackButton={false} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 md:p-12 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              เกิดข้อผิดพลาด
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              {error}
            </p>
            <button
              onClick={loadFavorites}
              className="px-6 py-2.5 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
            >
              ลองอีกครั้ง
            </button>
          </div>
        ) : favorites.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 md:p-16 text-center">
            <div className="text-7xl mb-6">📚</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">
              ยังไม่มีบุ๊กมาร์ก
            </h2>
            <p className="text-base text-slate-600 mb-8 max-w-md mx-auto">
              เพิ่มบุ๊กมาร์กหนังสือที่คุณสนใจเพื่อดูในภายหลัง
            </p>
            <Link
              href="/"
              className="inline-block px-8 py-3 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors shadow-md hover:shadow-lg"
            >
              ไปหน้าแรก
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {favorites.map((book) => (
              <FavoriteCard
                key={book.id}
                book={book}
                onRequestRemove={handleRequestRemove}
                isRemoving={removingId === book.id}
              />
            ))}
          </div>
        )}
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

      {/* Confirmation Delete Modal */}
      {confirmDeleteBookId && bookToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-100 shadow-2xl">
            <h3 className="text-xl font-bold text-red-600 mb-2">
              ยืนยันการลบ
            </h3>
            <p className="text-sm font-medium text-slate-800">
              ต้องการลบ <span className="font-semibold">"{bookToDelete.title}"</span> ออกจากบุ๊กมาร์กใช่หรือไม่?
            </p>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setConfirmDeleteBookId(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmRemoveFavorite}
                disabled={removingId !== null}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {removingId !== null ? "กำลังลบ..." : "ลบออก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
