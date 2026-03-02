"use client";

interface LoadingSkeletonProps {
  variant?: "book-detail" | "card" | "text" | "custom";
  className?: string;
}

/**
 * LoadingSkeleton - Reusable loading skeleton component
 * Provides different variants for common loading states
 */
export default function LoadingSkeleton({
  variant = "custom",
  className = "",
}: LoadingSkeletonProps) {
  if (variant === "book-detail") {
    return (
      <div className={`space-y-6 ${className}`}>
        {/* Cover skeleton */}
        <div className="aspect-[3/4] rounded-2xl bg-slate-200 animate-pulse" />
        {/* Action card skeleton */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
          <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-6 ${className}`}>
        <div className="h-6 bg-slate-200 rounded w-3/4 mb-4 animate-pulse" />
        <div className="h-4 bg-slate-200 rounded w-1/2 animate-pulse" />
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="h-4 bg-slate-200 rounded w-full animate-pulse" />
        <div className="h-4 bg-slate-200 rounded w-5/6 animate-pulse" />
        <div className="h-4 bg-slate-200 rounded w-4/6 animate-pulse" />
      </div>
    );
  }

  // Custom variant - just a simple pulse div
  return (
    <div className={`bg-slate-200 animate-pulse rounded ${className}`} />
  );
}

