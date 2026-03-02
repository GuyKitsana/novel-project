"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { resolveUserAvatar } from "@/app/services/api";

// FILE_BASE_URL no longer needed - using resolveUserAvatar helper instead

interface NavbarProps {
  showBackButton?: boolean;
}

export default function Navbar({ showBackButton = false }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setProfileOpen(false);
    router.replace("/");
  };

  const isAdmin = user?.role === "admin";
  const avatarGradient = isAdmin
    ? "from-indigo-500 to-violet-500 border-violet-300"
    : "from-orange-400 to-amber-300 border-orange-300";

  // Use canonical avatar field only
  const avatarUrl = resolveUserAvatar(user?.avatar ?? null);
  
  // Add cache busting using avatar_version (frontend-only property)
  const avatarVersion = (user as any)?.avatar_version;
  const avatarUrlWithBust = avatarUrl && avatarVersion 
    ? `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${avatarVersion}` 
    : avatarUrl;

  // Helper function to check if a link is active
  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-orange-100 bg-white/85 backdrop-blur">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
        {/* Left: Logo or Back Button */}
        {showBackButton ? (
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 shadow-sm text-slate-700 font-medium hover:bg-slate-50 hover:shadow-md hover:border-slate-300 active:scale-95 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>ย้อนกลับ</span>
          </button>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-orange-400 to-amber-300 shadow-md flex items-center justify-center font-bold text-white">
              N
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-lg">Novel Recommender</div>
              <div className="text-xs text-slate-500">
                ระบบแนะนำหนังสือนิยาย
              </div>
            </div>
          </Link>
        )}

        {/* Menu */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link
            href="/"
            className={isActive("/") ? "font-semibold text-orange-500" : "text-slate-600 hover:text-orange-500 transition-colors"}
          >
            หน้าแรก
          </Link>
          <Link
            href="/search"
            className={isActive("/search") ? "font-semibold text-orange-500" : "text-slate-600 hover:text-orange-500 transition-colors"}
          >
            นิยายทั้งหมด
          </Link>
          <Link
            href="/recommend"
            className={isActive("/recommend") ? "font-semibold text-orange-500" : "text-slate-600 hover:text-orange-500 transition-colors"}
          >
            แนะนำสำหรับคุณ
          </Link>
          {user && (
            <Link
              href="/favorites"
              className={isActive("/favorites") ? "font-semibold text-orange-500" : "text-slate-600 hover:text-orange-500 transition-colors"}
            >
              บุ๊กมาร์ก
            </Link>
          )}
        </nav>

        {/* Auth */}
        <div className="flex items-center gap-4">
          {!user && (
            <>
              <Link
                href="/auth/login"
                className="px-4 py-1.5 rounded-full border border-orange-300 text-sm font-medium text-orange-600 bg-orange-50 hover:bg-orange-100"
              >
                เข้าสู่ระบบ
              </Link>
              <Link
                href="/auth/register"
                className="hidden sm:inline-block px-4 py-1.5 rounded-full bg-orange-500 text-sm font-medium text-white hover:bg-orange-600"
              >
                ลงทะเบียน
              </Link>
            </>
          )}

          {user && (
            <div className="relative">
              {/* ===== Avatar Button ===== */}
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                aria-label="เปิดเมนูโปรไฟล์"
                className={`
                  h-10 w-10
                  flex items-center justify-center
                  rounded-full border-2
                  bg-gradient-to-tr ${avatarGradient}
                  shadow-sm transition
                  hover:shadow-md
                  overflow-hidden
                `}
              >
                {avatarUrlWithBust ? (
                  <img
                    src={avatarUrlWithBust}
                    alt={user.username || "Avatar"}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white text-lg leading-none">👤</span>
                )}
              </button>

              {/* ===== Profile Dropdown ===== */}
              {profileOpen && (
                <div
                  className="
                    absolute right-0 mt-3 w-64
                    rounded-2xl bg-white
                    border border-slate-100
                    shadow-xl p-4
                  "
                >
                  {/* User Info */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`
                        h-10 w-10
                        flex items-center justify-center
                        rounded-full border-2
                        bg-gradient-to-tr ${avatarGradient}
                        overflow-hidden
                      `}
                    >
                      {avatarUrlWithBust ? (
                        <img
                          src={avatarUrlWithBust}
                          alt={user.username || "Avatar"}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white text-lg leading-none">👤</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-slate-500">
                        เข้าสู่ระบบเป็น
                      </p>
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {user.username}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {user.email || ""}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 space-y-2">
                    {/* จัดการโปรไฟล์ */}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        router.push("/profile");
                      }}
                      className="w-full rounded-xl border border-orange-300 bg-white text-orange-600 py-2.5 text-sm font-semibold transition hover:bg-orange-50 hover:text-orange-700"
                    >
                      จัดการโปรไฟล์
                    </button>

                    {/* ออกจากระบบ */}
                    <button
                      onClick={handleLogout}
                      className=" w-full rounded-xl border border-red-200 bg-red-50 text-red-700 py-2.5 text-sm font-extrabold transition hover:bg-red-600 hover:text-white   "
                    >
                      ออกจากระบบ
                    </button>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

