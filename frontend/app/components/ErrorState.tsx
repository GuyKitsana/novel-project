"use client";

import Link from "next/link";

interface ErrorStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * ErrorState - Reusable error state component
 * Displays error message with optional retry action or navigation
 */
export default function ErrorState({
  title = "เกิดข้อผิดพลาด",
  message = "ไม่สามารถโหลดข้อมูลได้",
  actionLabel = "ลองอีกครั้ง",
  actionHref,
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm p-8 text-center ${className}`}
    >
      <div className="mb-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">{title}</h1>
      <p className="text-slate-600 mb-6">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-block px-6 py-2 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
        >
          {actionLabel}
        </button>
      )}
      {actionHref && !onRetry && (
        <Link
          href={actionHref}
          className="inline-block px-6 py-2 rounded-full bg-orange-500 text-white font-semibold hover:bg-orange-600 transition-colors"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

