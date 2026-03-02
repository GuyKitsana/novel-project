"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminGetDashboard, adminGetActivities } from "../services/api";
import { useAuth } from "../context/AuthContext";

interface User {
  id: number;
  username: string;
  email: string;
  role: "admin";
}


export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, logout: logoutAuth, authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const isLoggingOut = useRef(false);

  // ===== State: Stats =====
  const [stats, setStats] = useState({
    totalBooks: 0,
    totalCategories: 0,
    totalUsers: 0,
    totalReviews: 0,
    loading: true,
  });

  // ===== State: Recent Activity =====
  const [activities, setActivities] = useState<
    Array<{
      type: "book" | "user" | "review" | "category";
      title: string;
      name: string;
      time: string;
      icon: string;
    }>
  >([]);

  // ===== State: Toast =====
  const [toast, setToast] = useState<{
    open: boolean;
    type: "success" | "error";
    title: string;
  }>({
    open: false,
    type: "success",
    title: "",
  });

  // ===== Toast Helper =====
  const showToast = (type: "success" | "error", title: string) => {
    setToast({ open: true, type, title });
    setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 3000);
  };

  // ===== Logout Confirmation State =====
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ===== Effects =====
  useEffect(() => {
    // Wait for auth to finish loading before checking
    if (authLoading) return;
    
    // Prevent redirect during logout
    if (isLoggingOut.current) return;

    // Check authentication
    if (!user) {
      router.replace("/auth/login");
      return;
    }

    // Check admin role
    if (user.role !== "admin") {
      router.replace("/");
      return;
    }

    // User is admin, load dashboard data
    loadDashboard();
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, user, authLoading]);

  // ===== Helper: Format relative time =====
  const formatRelativeTime = (isoString: string): string => {
    try {
      const now = Date.now();
      const timestamp = new Date(isoString).getTime();
      const diff = now - timestamp;

      if (diff < 0) return "เมื่อสักครู่"; // Future dates

      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return "เมื่อสักครู่";
      if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
      if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
      return `${days} วันที่แล้ว`;
    } catch (err) {
      return "เมื่อสักครู่";
    }
  };

  // ===== Handlers: API =====
  const loadDashboard = async () => {
    try {
      const data = await adminGetDashboard();

      // Update stats
      setStats({
        totalBooks: data.stats?.totalBooks || 0,
        totalCategories: data.stats?.totalCategories || 0,
        totalUsers: data.stats?.totalUsers || 0,
        totalReviews: data.stats?.totalReviews || 0,
        loading: false,
      });
    } catch (error) {
      console.error("Error loading dashboard:", error);
      // On error, set defaults
      setStats({
        totalBooks: 0,
        totalCategories: 0,
        totalUsers: 0,
        totalReviews: 0,
        loading: false,
      });
      setActivities([]);
    }
  };

  // ===== Handlers: Activities =====
  const loadActivities = async () => {
    try {
      const activitiesList = await adminGetActivities(5);

      // Map activities to UI format
      const formattedActivities = activitiesList.map(
        (activity: {
          type: "book" | "user" | "review" | "category";
          action: "create" | "update" | "delete";
          description: string;
          created_at: string;
        }) => {
          // Determine icon based on type
          const icon =
            activity.type === "book"
              ? "📚"
              : activity.type === "user"
              ? "👥"
              : activity.type === "review"
              ? "⭐"
              : "🏷️";

          // Description format: "เพิ่มหนังสือ \"Title\"" or "แก้ไขผู้ใช้ \"Username\""
          // Use description as both title and name (it's already human-readable Thai)
          const description = activity.description || "";

          return {
            type: activity.type,
            title: description,
            name: description,
            time: formatRelativeTime(activity.created_at),
            icon,
          };
        }
      );

      setActivities(formattedActivities);
    } catch (error) {
      console.error("Error loading activities:", error);
      setActivities([]);
    }
  };

  // ================= CLICK OUTSIDE CLOSE =================
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Show logout confirmation
  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  // Confirm and execute logout
  const confirmLogout = () => {
    try {
      isLoggingOut.current = true;

      // Use centralized logout function to reset both localStorage and AuthContext state
      logoutAuth();

      setShowLogoutConfirm(false);

      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("Logout error:", error);
      setShowLogoutConfirm(false);
      showToast("error", "Logout failed");
    }
  };

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <main className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-slate-600 mb-2">กำลังโหลด...</div>
          <div className="text-sm text-slate-500">กำลังตรวจสอบสิทธิ์การเข้าถึง</div>
        </div>
      </main>
    );
  }

  // Show nothing while redirecting (prevent flash of content)
  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <main className="min-h-screen bg-orange-50">
      {/* ================= HEADER ================= */}
      <header className="sticky top-0 z-20 bg-white border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
          
          {/* LOGO */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-orange-400 text-white flex items-center justify-center font-extrabold shadow flex-shrink-0">
              N
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-slate-900 text-sm sm:text-base truncate">
                Novel Recommender
              </p>
              <p className="hidden sm:block text-xs text-slate-500">Admin Panel</p>
            </div>
          </div>

          {/* ================= ADMIN AVATAR ================= */}
          <div className="relative flex-shrink-0" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              className="h-10 w-10 rounded-full bg-gradient-to-tr from-orange-400 to-amber-400
              shadow-md flex items-center justify-center hover:scale-105 transition"
            >
              <span className="text-white text-lg font-bold">👑</span>
            </button>

            {/* DROPDOWN */}
            {open && (
              <div className="absolute right-0 mt-3 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-white
                shadow-xl border border-orange-100 p-4 z-50">
                
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-orange-400 flex items-center justify-center flex-shrink-0">
                    👑
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-orange-500">
                      ผู้ดูแลระบบ
                    </p>
                    <p className="text-sm font-extrabold text-slate-900 truncate">{user.username}</p>
                    <p className="text-xs text-slate-900 truncate">{user.email}</p>
                  </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="mt-4 w-full rounded-xl
                    border border-red-200
                    bg-red-50 text-red-700
                    py-2 text-sm font-extrabold
                    hover:bg-red-600 hover:text-white
                    transition"
                >
                🚪 ออกจากระบบ
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ================= CONTENT ================= */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
        {/* ===== DASHBOARD CARDS (Merged Summary + Management) ===== */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <Link
            href="/admin/books"
            className="group bg-white rounded-3xl p-4 sm:p-6 border border-orange-100 shadow-sm hover:shadow-xl transition"
          >
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <div className="text-3xl sm:text-4xl">📚</div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">ทั้งหมด</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">
                  {stats.loading ? "..." : stats.totalBooks.toLocaleString()}
                </p>
              </div>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-orange-500">
              จัดการหนังสือ
            </h3>
            <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
              เพิ่ม แก้ไข ลบข้อมูลนิยาย
            </p>
          </Link>

          <Link
            href="/admin/categories"
            className="group bg-white rounded-3xl p-4 sm:p-6 border border-orange-100 shadow-sm hover:shadow-xl transition"
          >
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <div className="text-3xl sm:text-4xl">🏷️</div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">ทั้งหมด</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">
                  {stats.loading ? "..." : stats.totalCategories.toLocaleString()}
                </p>
              </div>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-orange-500">
              หมวดหมู่
            </h3>
            <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
              จัดการหมวดหมู่นิยาย
            </p>
          </Link>

          <Link
            href="/admin/users"
            className="group bg-white rounded-3xl p-4 sm:p-6 border border-orange-100 shadow-sm hover:shadow-xl transition"
          >
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <div className="text-3xl sm:text-4xl">👥</div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">ทั้งหมด</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">
                  {stats.loading ? "..." : stats.totalUsers.toLocaleString()}
                </p>
              </div>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-orange-500">
              ผู้ใช้งาน
            </h3>
            <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
              ดูและจัดการบัญชีผู้ใช้
            </p>
          </Link>

          <Link
            href="/admin/reviews"
            className="group bg-white rounded-3xl p-4 sm:p-6 border border-orange-100 shadow-sm hover:shadow-xl transition"
          >
            <div className="flex items-start justify-between mb-3 sm:mb-4">
              <div className="text-3xl sm:text-4xl">📝</div>
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">ทั้งหมด</p>
                <p className="text-xl sm:text-2xl font-bold text-slate-900">
                  {stats.loading ? "..." : stats.totalReviews.toLocaleString()}
                </p>
              </div>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 group-hover:text-orange-500">
              จัดการรีวิว
            </h3>
            <p className="text-xs sm:text-sm font-medium text-slate-600 mt-1">
              ตรวจสอบและลบรีวิวจากผู้ใช้งาน
            </p>
          </Link>
        </section>

        {/* ===== QUICK ACTIONS ===== */}
        <div className="bg-white rounded-3xl shadow border border-orange-100 p-4 sm:p-5">
          <h2 className="text-sm sm:text-base font-semibold text-slate-700 mb-3">ปุ่มลัด</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/admin/books")}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-orange-500 text-white text-xs sm:text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              ➕ เพิ่มหนังสือ
            </button>
            <button
              onClick={() => router.push("/admin/categories")}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-orange-500 text-white text-xs sm:text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              ➕ เพิ่มหมวดหมู่
            </button>
            <button
              onClick={() => router.push("/admin/users")}
              className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-orange-500 text-white text-xs sm:text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              ➕ เพิ่มผู้ใช้
            </button>
          </div>
        </div>

        {/* ===== RECENT ACTIVITY ===== */}
        <div className="bg-white rounded-3xl shadow border border-orange-100 p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4">กิจกรรมล่าสุด</h2>
          {activities.length === 0 ? (
            <div className="text-center py-6 sm:py-8">
              <p className="text-xs sm:text-sm font-medium text-slate-500">ยังไม่มีกิจกรรมล่าสุด</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {activities.map((activity, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-base sm:text-lg">{activity.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                      {activity.title}
                    </p>
                    <p className="text-[10px] sm:text-xs font-medium text-slate-500">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-100 shadow-2xl">
            <h3 className="text-xl font-bold text-red-600 mb-2">
              ยืนยันการออกจากระบบ
            </h3>
            <p className="text-sm font-medium text-slate-800">
              คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?
            </p>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmLogout}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
