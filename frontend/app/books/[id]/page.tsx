"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchBookById,
  getReviewsByBook,
  getMyReview,
  upsertReview,
  deleteReview,
  addFavorite,
  removeFavorite,
  getFavorites,
  fetchBooks,
  resolveBookCover,
  getSimilarBooks,
  trackBookView,
} from "@/app/services/api";
import Navbar from "@/app/components/Navbar";
import { useAuth } from "@/app/context/AuthContext";

interface Book {
  id: number;
  title: string;
  author?: string;
  description?: string;
  description_tfidf?: string | null;
  publisher?: string;
  cover_image?: string;
  buy_link?: string;
  categories?: string[];
  rating_avg?: number;
  reviews_count?: number;
  favorites_count?: number;
  updated_at?: string;
}

interface Review {
  id: number;
  user_id: number;
  username: string;
  rating: number;
  comment?: string;
  created_at: string;
  updated_at?: string;
}

interface User {
  id: number;
  username: string;
  email?: string;
  role: "user" | "admin";
}

/**
 * Book Detail Page - Dynamic Route
 * 
 * Route: /books/[id]
 * 
 * This is a Client Component that uses Next.js App Router dynamic routing.
 * The route parameter `id` is accessed via `useParams()` hook.
 */

export default function BookDetailPage() {
  // Get dynamic route parameter from URL
  // In Next.js App Router Client Components, use useParams() hook
  const params = useParams();
  const router = useRouter();
  
  // Handle route param parsing robustly (params.id can be string | string[])
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const bookId = Number(rawId);

  // Validate bookId before making API calls
  if (!rawId || Number.isNaN(bookId) || bookId <= 0) {
    // Invalid ID - show error immediately without calling API
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
        <Navbar showBackButton={true} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">ID หนังสือไม่ถูกต้อง</h1>
            <p className="text-slate-600 mb-6">กรุณาตรวจสอบ URL และลองอีกครั้ง</p>
            <Link
              href="/"
              className="inline-block px-6 py-2 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
            >
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // State
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [loadingMyReview, setLoadingMyReview] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loadingFavorite, setLoadingFavorite] = useState(false);
  const { user } = useAuth();
  const [recommendedBooks, setRecommendedBooks] = useState<Book[]>([]);

  // Recommendations slider state
  const sliderRef = useRef<HTMLDivElement>(null);
  const originalWidthRef = useRef<number>(0);

  // Review form state
  const [reviewRating, setReviewRating] = useState<number | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  // Edit review state
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null);
  const [editRating, setEditRating] = useState<number>(0);
  const [editComment, setEditComment] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingReviewId, setDeletingReviewId] = useState<number | null>(null);

  // Confirmation modal state
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

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


  // Fetch book details
  useEffect(() => {
    // Reset state when id changes
    setBook(null);
    setLoading(true);

    if (!rawId || Number.isNaN(bookId)) {
      setLoading(false);
      setBook(null);
      return;
    }

    let cancelled = false;

    const loadBook = async () => {
      try {
        if (process.env.NODE_ENV === "development") {
          console.log("[Detail] rawId:", rawId, "bookId:", bookId);
        }
        const b = await fetchBookById(bookId);
        if (!cancelled) {
          if (process.env.NODE_ENV === "development") {
            console.log("[Detail] fetched book.id:", b?.id);
            console.log("[Detail] fetched book.title:", b?.title);
            console.log("[Detail] fetched book.cover_image:", b?.cover_image);
          }
          // If result is missing or missing id, set book to null
          if (!b || !b.id) {
            setBook(null);
          } else {
            setBook(b);
          }
        }
      } catch (err: any) {
        console.error("Failed to load book:", err);
        // Log detailed error information
        if (err.status) {
          console.error(`[Detail] HTTP ${err.status} ${err.statusText} - ${err.url}`);
        }
        if (!cancelled) {
          setBook(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBook();

    return () => {
      cancelled = true;
    };
  }, [rawId, bookId]);

  // Fetch reviews
  useEffect(() => {
    if (Number.isNaN(bookId)) return;

    const loadReviews = async () => {
      setLoadingReviews(true);
      try {
        const data = await getReviewsByBook(bookId);
        setReviews(data.items || []);
      } catch (err) {
        console.error("Failed to load reviews:", err);
        setReviews([]);
      } finally {
        setLoadingReviews(false);
      }
    };

    loadReviews();
  }, [bookId]);

  // Fetch user's review
  useEffect(() => {
    // Only fetch if user is logged in and bookId is valid
    if (!user || Number.isNaN(bookId)) {
      // Guest users: ensure review state is cleared
      setMyReview(null);
      setReviewRating(null);
      setReviewComment("");
      setLoadingMyReview(false);
      return;
    }

    const loadMyReview = async () => {
      setLoadingMyReview(true);
      try {
        // getMyReview now handles 401/403 gracefully and returns null
        const data = await getMyReview(bookId);
        setMyReview(data);
        // Keep stars neutral (null) until user interacts, even if review exists
        setReviewRating(null);
        // Only pre-fill comment if review exists (for edit flow, not create)
        if (data) {
          setReviewComment(data.comment || "");
        } else {
          setReviewComment("");
        }
      } catch (err: any) {
        // getMyReview already handles 404/401/403 and returns null
        // Only log unexpected errors (500, network, etc.)
        if (err.status && err.status !== 404 && err.status !== 401 && err.status !== 403) {
          console.error("Failed to load user review:", err);
          console.error(`[MyReview] HTTP ${err.status} ${err.statusText} - ${err.url}`);
        }
        // Treat as "no review" state
        setMyReview(null);
        setReviewRating(null);
        setReviewComment("");
      } finally {
        setLoadingMyReview(false);
      }
    };

    loadMyReview();
  }, [user, bookId]);

  // Check if book is favorited
  useEffect(() => {
    if (!user || Number.isNaN(bookId)) return;

    const checkFavorite = async () => {
      try {
        const data = await getFavorites();
        const favorited = data.items.some((item: Book) => item.id === bookId);
        setIsFavorite(favorited);
      } catch (err) {
        console.error("Failed to check favorite:", err);
      }
    };

    checkFavorite();
  }, [user, bookId]);

  // Fetch recommended books using backend TF-IDF + Cosine Similarity API
  // Falls back to category-based matching if API fails
  useEffect(() => {
    if (Number.isNaN(bookId) || !book) return;

    const loadRecommended = async () => {
      try {
        // Try backend similar books API first (TF-IDF + Cosine Similarity)
        try {
          const data = await getSimilarBooks(bookId, 10);
          if (data.items && data.items.length > 0) {
            setRecommendedBooks(data.items);
            return;
          }
        } catch (apiErr) {
          // API failed, fall back to frontend category-based logic
          console.warn("Backend similar books API failed, using fallback:", apiErr);
        }

        // Fallback: Category-based recommendation (original logic)
        const currentCategories = book.categories || [];
        
        // If current book has no categories, fallback to random books
        if (currentCategories.length === 0) {
          const books = await fetchBooks({ limit: 50, random: false });
          const filtered = books
            .filter((b: Book) => b.id !== bookId)
            .slice(0, 10);
          setRecommendedBooks(filtered);
          return;
        }

        // Fetch a larger set of books to filter from
        const allBooks = await fetchBooks({ limit: 50, random: false });
        
        // Filter books that share at least one category with current book
        const similarBooks = allBooks.filter((b: Book) => {
          // Exclude current book
          if (b.id === bookId) return false;
          
          // Check if book has categories
          if (!b.categories || b.categories.length === 0) return false;
          
          // Check if book shares at least one category with current book
          const sharedCategories = b.categories.filter((cat: string) =>
            currentCategories.includes(cat)
          );
          
          return sharedCategories.length > 0;
        });

        // If we have enough similar books, use them
        if (similarBooks.length >= 10) {
          setRecommendedBooks(similarBooks.slice(0, 10));
        } else if (similarBooks.length > 0) {
          // If we have some similar books but less than 10, use them and fill with others
          const otherBooks = allBooks.filter(
            (b: Book) => b.id !== bookId && !similarBooks.some((sb: Book) => sb.id === b.id)
          );
          const combined = [...similarBooks, ...otherBooks].slice(0, 10);
          setRecommendedBooks(combined);
        } else {
          // No similar books found, use other books as fallback
          const otherBooks = allBooks
            .filter((b: Book) => b.id !== bookId)
            .slice(0, 10);
          setRecommendedBooks(otherBooks);
        }
      } catch (err) {
        console.error("Failed to load recommendations:", err);
        setRecommendedBooks([]);
      }
    };

    loadRecommended();
  }, [bookId, book]);

  // Track book view when page loads (optional feature)
  useEffect(() => {
    if (Number.isNaN(bookId) || !book || !user) return;

    // Track view asynchronously (non-blocking)
    trackBookView(bookId).catch((err) => {
      // Silent fail - tracking is optional
      if (process.env.NODE_ENV === "development") {
        console.warn("Failed to track book view:", err);
      }
    });
  }, [bookId, book, user]);

  // Calculate original width and initialize scroll position for infinite loop
  useEffect(() => {
    if (recommendedBooks.length === 0 || !sliderRef.current) return;

    const calculateAndSetScroll = () => {
      if (!sliderRef.current) return;

      // Find one item using data attribute
      const firstItem = sliderRef.current.querySelector('[data-rec-item]') as HTMLElement;
      if (!firstItem) {
        // Retry after a short delay if items aren't rendered yet
        setTimeout(calculateAndSetScroll, 50);
        return;
      }

      // Measure item width
      const itemWidth = firstItem.offsetWidth;
      
      // Read gap from CSS (gap-4 = 16px on mobile, gap-6 = 24px on desktop)
      // We'll use the computed gap from the flex container
      const container = firstItem.parentElement;
      if (!container) return;
      
      const computedStyle = window.getComputedStyle(container);
      const gap = parseFloat(computedStyle.gap) || 16; // Default to 16px if gap not found
      
      // Calculate original width: (itemWidth + gap) * number of items
      const originalWidth = (itemWidth + gap) * recommendedBooks.length;
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
  }, [recommendedBooks]);

  // Handle favorite toggle
  const handleToggleFavorite = async () => {
    if (!user) {
      router.push("/auth/login");
      return;
    }

    setLoadingFavorite(true);
    try {
      if (isFavorite) {
        await removeFavorite(bookId);
        setIsFavorite(false);
      } else {
        await addFavorite(bookId);
        setIsFavorite(true);
      }
    } catch (err: any) {
      console.error("Failed to toggle favorite:", err);
      // TODO: Show error toast
    } finally {
      setLoadingFavorite(false);
    }
  };

  // Handle review submit
  const handleSubmitReview = async () => {
    // Debug logs
    console.log("=== handleSubmitReview called ===");
    console.log("myReview at submit:", myReview);
    console.log("loadingMyReview:", loadingMyReview);
    console.log("reviewRating:", reviewRating);
    console.log("reviewComment:", reviewComment);
    
    if (!user) {
      router.push("/auth/login");
      return;
    }

    // Prevent submission while myReview is still loading (race condition protection)
    if (loadingMyReview) {
      console.log("Blocked: myReview is still loading");
      showToast("error", "กรุณารอสักครู่...");
      return;
    }

    // Prevent posting if user already has a review
    if (myReview) {
      console.log("Blocked: myReview exists", myReview);
      showToast("error", "คุณได้เขียนรีวิวแล้ว กรุณาแก้ไขรีวิวที่มีอยู่แทน");
      return;
    }

    // Additional safety check: Check if user's review exists in the reviews list
    const userReviewInList = reviews.find(r => user && r.user_id === user.id);
    if (userReviewInList) {
      console.log("Blocked: Review found in reviews list", userReviewInList);
      showToast("error", "คุณได้เขียนรีวิวแล้ว กรุณาแก้ไขรีวิวที่มีอยู่แทน");
      // Sync myReview state
      setMyReview(userReviewInList);
      return;
    }

    if (!reviewRating || reviewRating < 1 || reviewRating > 5) {
      console.log("Blocked: Invalid rating");
      // TODO: Show validation error
      return;
    }

    console.log("Proceeding with review submission...");
    setSubmittingReview(true);
    
    // First try/catch: Post the review
    try {
      // Submit review to API (only allowed when myReview is null)
      await upsertReview(bookId, reviewRating, reviewComment || undefined);
      
      // Clear form inputs immediately after successful submission
      setReviewRating(null);
      setReviewComment("");
      
      // Show success toast - this depends ONLY on upsertReview success
      showToast("success", "โพสต์รีวิวสำเร็จ");
    } catch (err: any) {
      console.error("Failed to submit review:", err);
      // Show error toast only if upsertReview fails
      showToast("error", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      // Do not clear inputs on error - keep user's data
      setSubmittingReview(false);
      return; // Exit early if posting fails
    }
    
    // Second try/catch: Reload review data (non-critical, don't fail the whole operation)
    try {
      // Reload reviews and my review
      const reviewsData = await getReviewsByBook(bookId);
      setReviews(reviewsData.items || []);
      
      const myReviewData = await getMyReview(bookId);
      setMyReview(myReviewData);
    } catch (err: any) {
      // Log warning but don't show error toast - review was already posted successfully
      console.warn("Failed to reload reviews after posting:", err);
      // Don't show error toast - the review was posted successfully
    } finally {
      setSubmittingReview(false);
    }
  };

  // Handle edit review
  const handleStartEdit = (review: Review) => {
    setEditingReviewId(review.id);
    setEditRating(review.rating);
    setEditComment(review.comment || "");
  };

  const handleCancelEdit = () => {
    setEditingReviewId(null);
    setEditRating(0);
    setEditComment("");
  };

  const handleSaveEdit = async () => {
    if (!editingReviewId || !user) return;

    if (editRating < 1 || editRating > 5) {
      // TODO: Show validation error
      return;
    }

    setSavingEdit(true);
    try {
      // Use upsertReview which will update existing review
      await upsertReview(bookId, editRating, editComment || undefined);
      
      // Reload reviews to get updated data
      const reviewsData = await getReviewsByBook(bookId);
      setReviews(reviewsData.items || []);
      
      // Exit edit mode
      handleCancelEdit();
      
      // Show success toast
      showToast("success", "แก้ไขรีวิวสำเร็จ");
    } catch (err: any) {
      console.error("Failed to update review:", err);
      // Show error toast
      showToast("error", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle delete review - show confirmation
  const handleDeleteReview = (reviewId: number) => {
    if (!user) return;
    setConfirmDeleteId(reviewId);
  };

  // Confirm and execute delete
  const confirmDeleteReview = async () => {
    if (!confirmDeleteId || !user) return;

    setDeletingReviewId(confirmDeleteId);
    setConfirmDeleteId(null); // Close modal
    
    try {
      await deleteReview(confirmDeleteId);
      
      // Remove review from local state
      setReviews((prev) => prev.filter((r) => r.id !== confirmDeleteId));
      
      // If it was the user's review, also update myReview
      if (myReview && myReview.id === confirmDeleteId) {
        setMyReview(null);
      }
      
      // Show success toast
      showToast("success", "ลบรีวิวสำเร็จ");
    } catch (err: any) {
      console.error("Failed to delete review:", err);
      // Show error toast
      showToast("error", "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDeletingReviewId(null);
    }
  };

  // Render stars
  const renderStars = (rating: number, size: "sm" | "md" | "lg" = "md") => {
    const sizeClasses = {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
    };
    return (
      <div className={`flex items-center gap-0.5 ${sizeClasses[size]}`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={star <= rating ? "text-orange-500" : "text-slate-300"}>
            ★
          </span>
        ))}
      </div>
    );
  };


  // Loading state
  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
        <Navbar showBackButton={true} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          <div className="bg-white rounded-2xl shadow-sm p-8 animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-3/4 mb-4" />
            <div className="h-4 bg-slate-200 rounded w-1/2" />
          </div>
        </div>
      </main>
    );
  }

  // Book not found
  if (!book) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
        <Navbar showBackButton={true} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">ไม่พบหนังสือ</h1>
            <p className="text-slate-600 mb-6">หนังสือที่คุณกำลังมองหาอาจถูกลบหรือไม่พบ</p>
            <Link
              href="/"
              className="inline-block px-6 py-2 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
            >
              กลับหน้าหลัก
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const coverUrl = resolveBookCover(book.cover_image);
  const averageRating = book.rating_avg || 0;
  const reviewsCount = book.reviews_count || 0;

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
      <Navbar showBackButton={true} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-8">

        {/* ================= MAIN CONTENT - TWO COLUMN LAYOUT ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 lg:gap-8 mb-8 lg:items-start">
          {/* LEFT COLUMN */}
          <div className="space-y-6 lg:h-full">
            {/* Book Cover Card */}
            <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 shadow-xl">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={book.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-sm">
                  ไม่มีรูปปก
                </div>
              )}
            </div>

            {/* Action Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleToggleFavorite}
                  disabled={loadingFavorite}
                  className={`
                    w-full px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2
                    ${isFavorite
                      ? "bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 shadow-md"
                      : "bg-gradient-to-r from-orange-400 to-orange-500 text-white hover:from-orange-500 hover:to-orange-600 shadow-md"
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                  `}
                >
                  {loadingFavorite ? (
                    "กำลังโหลด..."
                  ) : isFavorite ? (
                    <>
                      <span>✓</span>
                      <span>เพิ่มลงบุ๊คมาร์ก</span>
                    </>
                  ) : (
                    <>
                      <span>☆</span>
                      <span>เพิ่มลงบุ๊คมาร์ก</span>
                    </>
                  )}
                </button>

                {book.buy_link ? (
                  <a
                    href={book.buy_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full px-6 py-3 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors shadow-md text-center block"
                  >
                    ไปที่ร้านค้า
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="w-full px-6 py-3 rounded-xl bg-gray-400 text-white font-semibold cursor-not-allowed transition-colors shadow-md text-center"
                  >
                    ไปที่ร้านค้า
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col lg:h-full space-y-6">
            {/* Metadata & Story Summary Card */}
            {(book.author || book.publisher || (book.categories && book.categories.length > 0) || book.description) && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 md:p-8">
                {/* Book Title with Rating Badge */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                  <h2 className="text-xl md:text-2xl font-bold text-slate-900 leading-tight flex-1">
                    {book.title}
                  </h2>
                  {/* Rating Badge */}
                  <div className="px-4 py-2 rounded-xl bg-green-50 border border-green-200 shadow-sm flex-shrink-0">
                    <div className="flex items-center gap-2">
                      {renderStars(Math.round(averageRating), "md")}
                      <span className="text-lg font-bold text-green-700">
                        {averageRating > 0 ? averageRating.toFixed(1) : "0.0"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metadata Section */}
                {(book.author || book.publisher || (book.categories && book.categories.length > 0)) && (
                  <div className="mb-6">
                    <div className="space-y-2">
                    {book.author && (
                      <div className="text-sm leading-normal">
                        <span className="text-slate-500 font-medium">ผู้แต่ง:</span>
                        <span className="text-slate-800 ml-2">{book.author}</span>
                      </div>
                    )}
                    {book.publisher && (
                      <div className="text-sm leading-normal">
                        <span className="text-slate-500 font-medium">สำนักพิมพ์:</span>
                        <span className="text-slate-800 ml-2">{book.publisher}</span>
                      </div>
                    )}
                    {book.categories && book.categories.length > 0 && (
                      <div className="text-sm leading-normal">
                        <span className="text-slate-500 font-medium">หมวดหมู่:</span>
                        <span className="text-orange-600 font-medium ml-2">
                          {book.categories
                            .map((cat) => {
                              // Handle both string and object formats
                              return typeof cat === 'string' ? cat : (cat as any)?.name || '';
                            })
                            .filter(Boolean)
                            .join(' • ')}
                        </span>
                      </div>
                    )}
                    </div>
                  </div>
                )}

                {/* Divider */}
                {(book.author || book.publisher || (book.categories && book.categories.length > 0)) && book.description && (
                  <div className="mt-4 mb-4 border-b border-slate-100" />
                )}

                {/* Story Summary Section */}
                {book.description && (
                  <div className="mt-4">
                    <h2 className="text-lg font-semibold text-slate-900 mb-4">เรื่องย่อ</h2>
                    <p className="text-sm md:text-base text-slate-700 leading-relaxed whitespace-pre-line">
                      {book.description}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Review Writing Card */}
            <div className="flex-1 min-h-0 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-100 p-5 md:p-6 overflow-hidden">
              <h2 className="text-lg font-bold text-slate-900 mb-5 flex-shrink-0">เขียนรีวิว</h2>
              
              <div className="flex-1 min-h-0 flex flex-col">
                

                <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2">
                  {/* Rating Input */}
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => {
                          if (user && !myReview) {
                            setReviewRating(star);
                          }
                        }}
                        disabled={!user || !!myReview}
                        className={`
                          text-xl transition-all
                          ${!user || myReview
                            ? "text-slate-200 cursor-not-allowed opacity-50" 
                            : "hover:scale-110 active:scale-95 cursor-pointer"
                          }
                          ${reviewRating !== null && star <= reviewRating ? "text-orange-500" : "text-slate-300"}
                        `}
                        aria-label={`ให้คะแนน ${star} ดาว`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="ml-2 text-sm text-slate-500">
                      {reviewRating === null ? "ให้คะแนน" : `${reviewRating} / 5`}
                    </span>
                  </div>

                  {/* Review Textarea */}
                  <div>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => {
                        if (user && !myReview) {
                          setReviewComment(e.target.value);
                        }
                      }}
                      disabled={!user || !!myReview}
                      placeholder={
                        !user 
                          ? "กรุณาเข้าสู่ระบบเพื่อเขียนรีวิว"
                          : myReview 
                            ? "คุณได้เขียนรีวิวแล้ว กรุณาแก้ไขรีวิวที่มีอยู่แทน"
                            : "เขียนรีวิวของคุณที่นี่..."
                      }
                      rows={4}
                      className={`
                        w-full px-4 py-3 rounded-xl border text-sm md:text-base resize-y min-h-[120px]
                        ${!user || myReview
                          ? "bg-slate-50 border-slate-200 text-slate-400 placeholder:text-slate-400 cursor-not-allowed"
                          : "border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-slate-900 placeholder:text-slate-400"
                        }
                      `}
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <div className="mt-4 flex justify-center md:justify-end">
                  {!user ? (
                    <button
                      onClick={() => router.push("/auth/login")}
                      className="px-6 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors text-sm"
                    >
                      เข้าสู่ระบบเพื่อเขียนรีวิว
                    </button>
                  ) : myReview || loadingMyReview ? (
                    <button
                      disabled
                      className="px-6 py-2.5 rounded-xl bg-slate-300 text-slate-500 font-semibold cursor-not-allowed text-sm"
                    >
                      {loadingMyReview ? "กำลังโหลด..." : "คุณได้เขียนรีวิวแล้ว"}
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmitReview}
                      disabled={submittingReview || loadingMyReview}
                      className="px-6 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {submittingReview ? "กำลังบันทึก..." : "โพสต์รีวิว"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ================= REVIEWS LIST SECTION ================= */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6 mt-6">
          <div className="px-5 md:px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-xl font-bold text-slate-900">รีวิว</h2>
          </div>

          <div className="p-5 md:p-6">
            {loadingReviews ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 md:p-5 animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-1/4 mb-2" />
                    <div className="h-4 bg-slate-200 rounded w-full mb-2" />
                    <div className="h-4 bg-slate-200 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500 text-lg mb-2">ยังไม่มีรีวิว</p>
                {!user && (
                  <p className="text-sm text-slate-400">
                    <Link href="/auth/login" className="text-orange-600 hover:underline font-medium">
                      เข้าสู่ระบบ
                    </Link>
                    {" "}เพื่อเขียนรีวิวแรก
                  </p>
                )}
              </div>
            ) : (
              <div className={`space-y-5 ${reviews.length > 2 ? "max-h-[600px] overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-slate-400" : ""}`}>
                {reviews.map((review) => {
                  const isOwnReview = user && review.user_id === user.id;
                  const isEditing = editingReviewId === review.id;
                  const isDeleting = deletingReviewId === review.id;

                  return (
                    <div
                      key={review.id}
                      className="bg-slate-50 rounded-xl p-4 md:p-5 border border-slate-100 hover:shadow-md transition-shadow"
                    >
                      {isEditing ? (
                        /* Edit Mode */
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900 mb-1">{review.username}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(review.created_at).toLocaleDateString("th-TH", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                          </div>

                          {/* Edit Rating */}
                          <div className="flex items-center gap-1.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setEditRating(star)}
                                disabled={savingEdit}
                                className={`
                                  text-xl transition-all hover:scale-110 active:scale-95 cursor-pointer
                                  ${star <= editRating ? "text-orange-500" : "text-slate-300"}
                                  ${savingEdit ? "opacity-50 cursor-not-allowed" : ""}
                                `}
                                aria-label={`ให้คะแนน ${star} ดาว`}
                              >
                                ★
                              </button>
                            ))}
                            <span className="ml-2 text-sm text-slate-500">
                              {editRating} / 5
                            </span>
                          </div>

                          {/* Edit Comment */}
                          <div>
                            <textarea
                              value={editComment}
                              onChange={(e) => setEditComment(e.target.value)}
                              disabled={savingEdit}
                              placeholder="เขียนรีวิวของคุณที่นี่..."
                              rows={4}
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-sm md:text-base text-slate-900 placeholder:text-slate-400 resize-y min-h-[120px] disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </div>

                          {/* Edit Actions */}
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={handleCancelEdit}
                              disabled={savingEdit}
                              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                              ยกเลิก
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              disabled={savingEdit || editRating < 1}
                              className="px-4 py-2.5 rounded-xl bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                              {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* View Mode */
                        <>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900 mb-1">{review.username}</p>
                              <p className="text-xs text-slate-500">
                                {new Date(review.created_at).toLocaleDateString("th-TH", {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })}
                              </p>
                            </div>
                            <div className="ml-4">
                              {renderStars(review.rating, "md")}
                            </div>
                          </div>
                          <div>
                            {review.comment && (
                              <p className="text-sm text-slate-700 leading-relaxed mt-2">
                                {review.comment}
                              </p>
                            )}
                            {isOwnReview && (
                              <div className="flex justify-end gap-1.5 mt-2">
                                <button
                                  onClick={() => handleStartEdit(review)}
                                  disabled={isDeleting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-blue-600 disabled:hover:border-blue-200"
                                >
                                  <span>✏️</span>
                                  <span>แก้ไข</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteReview(review.id)}
                                  disabled={isDeleting}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-red-600 disabled:hover:border-red-200"
                                >
                                  <span>🗑️</span>
                                  <span>{isDeleting ? "กำลังลบ..." : "ลบ"}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ================= RECOMMENDATIONS SECTION ================= */}
        {recommendedBooks.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="px-6 md:px-8 py-5 border-b border-slate-100 bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">เรื่องที่คุณอาจจะชอบ</h2>
            </div>
            <div className="relative py-6 md:py-8">
              {/* Left Arrow - Positioned outside scroll container */}
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

              {/* Right Arrow - Positioned outside scroll container */}
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

              {/* Scroll Container - Padding ensures cards appear between arrows */}
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
                <div className="flex gap-4 md:gap-6 w-max">
                  {/* Duplicate books array for infinite loop */}
                  {[...recommendedBooks, ...recommendedBooks].map((recBook, index) => {
                    // Safety check: Skip books without valid id
                    if (!recBook || !recBook.id || typeof recBook.id !== "number") {
                      if (process.env.NODE_ENV === "development") {
                        console.warn("Book detail recommendations: book.id is missing or invalid", recBook);
                      }
                      return null;
                    }
                    const recCoverUrl = resolveBookCover(recBook.cover_image);
                    return (
                      <Link
                        key={`${recBook.id}-${index}`}
                        href={`/books/${recBook.id}`}
                        className="flex-shrink-0 group"
                        data-rec-item
                      >
                        <div className="w-32 md:w-40">
                          <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 shadow-md hover:shadow-xl hover:scale-105 transition-all duration-300 mb-2">
                            {recCoverUrl ? (
                              <img
                                src={recCoverUrl}
                                alt={recBook.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400 text-xs">
                                ไม่มีรูปปก
                              </div>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-800 line-clamp-2 group-hover:text-orange-600 transition-colors mb-1">
                            {recBook.title}
                          </p>
                          {recBook.categories && recBook.categories.length > 0 && (
                            <p className="text-[10px] text-slate-500 line-clamp-1">
                              {typeof recBook.categories[0] === 'string' ? recBook.categories[0] : (recBook.categories[0] as any)?.name || ''}
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
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
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-100 shadow-2xl">
            <h3 className="text-xl font-bold text-red-600 mb-2">
              ยืนยันการลบรีวิว
            </h3>
            <p className="text-sm font-medium text-slate-800">
              คุณแน่ใจหรือไม่ว่าต้องการลบรีวิวนี้?
            </p>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmDeleteReview}
                disabled={deletingReviewId !== null}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingReviewId !== null ? "กำลังลบ..." : "ลบรีวิว"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
