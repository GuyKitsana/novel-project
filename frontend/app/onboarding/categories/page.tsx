"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { apiGet, saveUserCategories } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";

// DEBUG flag - enable with NEXT_PUBLIC_DEBUG=1
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "1";

/* ================== Categories (ตรงกับ categories.code) ================== */
const CATEGORIES = [
  { key: "fantasy", label: "แฟนตาซี 🧙‍♂️" },
  { key: "romance", label: "โรแมนซ์ 💖" },
  { key: "sci_fi", label: "นิยายวิทยาศาสตร์ 🚀" },
  { key: "action_adventure", label: "แอคชัน / ผจญภัย ⚔️" },
  { key: "mystery_thriller", label: "สืบสวน 🔍" },
  { key: "horror", label: "สยองขวัญ 👻" },
  { key: "historical_fiction", label: "ประวัติศาสตร์ 📜" },
  { key: "young_adult", label: "วัยรุ่น 🌱" },
];

const MAX_CATEGORIES = 4;

export default function OnboardingCategoriesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isInitialized, setUser, authLoading } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Ref guard to prevent redirect loops
  const redirectedRef = useRef(false);
  const checkedRef = useRef(false);

  /* ================== Guard ================== */
  // ⚠️ CRITICAL: Wait for auth to initialize before running redirect logic
  useEffect(() => {
    if (DEBUG) {
      console.log("[ONBOARDING useEffect: guard]", {
        pathname,
        isInitialized,
        authLoading,
        user: user ? { id: user.id, role: user.role, category_count: user.category_count } : null,
        redirected: redirectedRef.current,
        checked: checkedRef.current,
      });
    }
    
    // Don't run redirect logic until auth state is fully initialized and loading is complete
    if (!isInitialized || authLoading) {
      if (DEBUG) console.log("[ONBOARDING useEffect: guard] Waiting for initialization...");
      return;
    }

    // Guard: Only check once per mount
    if (checkedRef.current) {
      if (DEBUG) console.log("[ONBOARDING useEffect: guard] Already checked, skipping");
      return;
    }

    // Guard: Only redirect once
    if (redirectedRef.current) {
      if (DEBUG) console.log("[ONBOARDING useEffect: guard] Already redirected, skipping");
      setLoading(false);
      return;
    }

    // Guard: Only run redirect check if we're actually on the onboarding page
    if (pathname !== "/onboarding/categories") {
      if (DEBUG) console.log("[ONBOARDING useEffect: guard] Not on onboarding page, skipping", { pathname });
      setLoading(false);
      return;
    }

    checkedRef.current = true;

    const checkStatus = async () => {
      try {
        // If no user, redirect to login
        if (!user) {
          if (DEBUG) console.log("[ONBOARDING useEffect: guard] No user, redirecting to login");
          redirectedRef.current = true;
          router.replace("/auth/login");
          return;
        }

        // ✅ admin ไม่ต้อง onboarding
        if (user.role === "admin") {
          if (DEBUG) console.log("[ONBOARDING useEffect: guard] Admin user, redirecting to /admin");
          redirectedRef.current = true;
          router.replace("/admin");
          return;
        }

        // Check if user already has categories
        const res = await apiGet("/onboarding/me", true);

        if (DEBUG) {
          console.log("[ONBOARDING useEffect: guard] API response:", {
            category_count: res.category_count,
            category_count_number: Number(res.category_count),
          });
        }

        // user ที่เคยเลือกหมวดแล้ว - redirect to home
        if (Number(res.category_count) > 0) {
          if (DEBUG) console.log("[ONBOARDING useEffect: guard] User has categories, redirecting to /", {
            category_count: res.category_count,
            current_path: pathname,
          });
          redirectedRef.current = true;
          // Update AuthContext user state to reflect categories
          if (user) {
            const updatedUser = {
              ...user,
              category_count: Number(res.category_count),
            };
            setUser(updatedUser);
            localStorage.setItem("user", JSON.stringify(updatedUser));
          }
          router.replace("/");
          return;
        }

        // User doesn't have categories, allow them to stay on onboarding page
        if (DEBUG) console.log("[ONBOARDING useEffect: guard] User needs onboarding, allowing access");
        setLoading(false);
      } catch (err: any) {
        console.error("[ONBOARDING useEffect: guard] Error:", err);
        if (DEBUG) console.log("[ONBOARDING useEffect: guard] Error, redirecting to login");
        redirectedRef.current = true;
        router.replace("/auth/login");
      }
    };

    checkStatus();
  }, [user, isInitialized, authLoading, pathname]); // Removed router from deps (it's stable)


  /* ================== Toggle ================== */
  const toggleCategory = (key: string) => {
    setSelected((prev) => {
      // If already selected, unselect it
      if (prev.includes(key)) {
        setError(null); // Clear error when unselecting
        return prev.filter((c) => c !== key);
      }
      
      // If trying to select a 5th category, block it
      if (prev.length >= MAX_CATEGORIES) {
        setError("เลือกหมวดหมู่ได้สูงสุด 4 หมวดหมู่");
        return prev; // Don't add
      }
      
      // Clear error if selection is valid
      setError(null);
      return [...prev, key];
    });
  };

  /* ================== Submit ================== */
  const handleSubmit = async () => {
    // Validation
    if (selected.length === 0) {
      setError("กรุณาเลือกอย่างน้อย 1 หมวด");
      return;
    }
    
    if (selected.length > MAX_CATEGORIES) {
      setError("เลือกได้ไม่เกิน 4 หมวด");
      return;
    }

    setError(null);

    // DEBUG: Log categories being sent from frontend
    console.log("[ONBOARDING FRONTEND] Step 1: Categories being sent to backend:", {
      userId: user?.id,
      favoriteCategories: selected,
      count: selected.length,
      timestamp: new Date().toISOString(),
    });

    try {
      const response = await saveUserCategories(selected);
      
      console.log("[ONBOARDING FRONTEND] Step 2: API call successful:", {
        userId: user?.id,
        response,
        timestamp: new Date().toISOString(),
      });

      // ✅ CRITICAL: Update both localStorage AND AuthContext state
      // This ensures Home page sees updated user data immediately (no flicker)
      if (user) {
        const updatedUser = {
          ...user,
          category_count: selected.length,
        };
        
        // Update localStorage
        localStorage.setItem("user", JSON.stringify(updatedUser));
        
        // Update AuthContext state so Home page sees the change immediately
        setUser(updatedUser);
      }

      // Redirect to home after state is updated
      router.replace("/");
    } catch (err: any) {
      // Handle Zod validation errors (from backend)
      let errorMessage = "บันทึกข้อมูลไม่สำเร็จ";
      if (err.responseData?.errors && Array.isArray(err.responseData.errors) && err.responseData.errors.length > 0) {
        errorMessage = err.responseData.errors[0].message || errorMessage;
      } else if (err.errors && Array.isArray(err.errors) && err.errors.length > 0) {
        errorMessage = err.errors[0].message || errorMessage;
      } else if (err.responseData?.message) {
        errorMessage = err.responseData.message;
      } else if (err.message) {
        // Extract just the message part if it's a detailed error
        const match = err.message.match(/-\s*(.+)$/);
        errorMessage = match ? match[1] : err.message;
      }
      setError(errorMessage);
    }
  };

  /* ================== Loading ================== */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        กำลังโหลดข้อมูล...
      </div>
    );
  }

  /* ================== UI ================== */
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            เลือกหมวดหมู่นิยายที่คุณสนใจ
          </h1>
          <p className="text-sm text-slate-500">
            เลือกหมวดหมู่ที่คุณสนใจมากที่สุด (เลือกได้ไม่เกิน 4 หมวด)
          </p>
          <p className="text-sm font-medium text-orange-600 mt-2">
            {selected.length}/{MAX_CATEGORIES}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {CATEGORIES.map((cat) => {
            const active = selected.includes(cat.key);
            const isDisabled = !active && selected.length >= MAX_CATEGORIES;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggleCategory(cat.key)}
                disabled={isDisabled}
                className={`
                  px-4 py-3 rounded-2xl
                  border text-sm font-medium transition
                  ${active
                    ? "bg-orange-400 text-white border-orange-400 shadow-md"
                    : isDisabled
                    ? "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-orange-50"
                  }
                `}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-6 text-center">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 inline-block">
              {error}
            </p>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={selected.length === 0 || selected.length > MAX_CATEGORIES || loading}
            className="
              px-8 py-2.5 rounded-full
              bg-orange-500 text-white
              font-semibold shadow-md
              hover:bg-orange-600
              disabled:opacity-40
              disabled:cursor-not-allowed
            "
          >
            เริ่มใช้งาน
          </button>

          <p className="text-[11px] text-slate-400">
            คุณสามารถเปลี่ยนหมวดที่ชอบได้ภายหลังในหน้าโปรไฟล์
          </p>
        </div>
      </div>
    </main>
  );
}
