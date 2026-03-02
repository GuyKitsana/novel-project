"use client";

import { ReactNode } from "react";
import { AuthProvider } from "../context/AuthContext";
import ErrorBoundary from "./ErrorBoundary";

/**
 * Client-side providers wrapper
 * Includes AuthProvider and ErrorBoundary
 * This component must be a client component to use React Context and Error Boundary
 */
export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>{children}</AuthProvider>
    </ErrorBoundary>
  );
}

