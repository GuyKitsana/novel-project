"use client";

import React, { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * and displays a fallback UI instead of crashing the entire app
 */
export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console for debugging
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    // Reset error state and reload the page
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI or use provided fallback
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-orange-50 via-white to-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                เกิดข้อผิดพลาด
              </h2>
              <p className="text-slate-600 mb-1">
                มีบางอย่างผิดพลาด กรุณาลองใหม่อีกครั้ง
              </p>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm text-slate-500 hover:text-slate-700">
                    รายละเอียดข้อผิดพลาด (Development Only)
                  </summary>
                  <pre className="mt-2 p-3 bg-slate-100 rounded text-xs overflow-auto max-h-40 text-slate-700">
                    {this.state.error.toString()}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
            <button
              onClick={this.handleReload}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-md hover:shadow-lg"
            >
              โหลดใหม่
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

