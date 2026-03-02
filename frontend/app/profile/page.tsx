"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import { useAuth } from "@/app/context/AuthContext";
import { uploadAvatar, updateMe, getMe, resolveUserAvatar } from "@/app/services/api";

interface Toast {
  open: boolean;
  message: string;
  type: "success" | "error";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3001/api";
const FILE_BASE_URL = API_URL.replace(/\/api$/, "");

export default function ProfilePage() {
  const router = useRouter();
  const { user, logout, authLoading, setUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [toast, setToast] = useState<Toast>({ open: false, message: "", type: "success" });
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Profile form state
  const [fullName, setFullName] = useState("");
  const [emailContact, setEmailContact] = useState("");

  // Helper removed - use canonical avatar field directly

  // Redirect if not logged in (only after auth loading completes)
  useEffect(() => {
    if (!authLoading && user === null) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  // Fetch user profile on load
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;
      
      try {
        const profile = await getMe();
        if (profile) {
          setFullName(profile.username || "");
          setEmailContact(profile.email || "");
          
          // Only update avatarPreview if we get a valid URL - don't overwrite with null
          const nextUrl = resolveUserAvatar(profile.avatar ?? null);
          if (nextUrl) {
            // Cache bust to ensure fresh image
            setAvatarPreview(`${nextUrl}?t=${Date.now()}`);
          }
          // If nextUrl is null/undefined, keep current avatarPreview as-is (prevents flash-disappear)
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
        // Fallback to user from context if fetch fails
        if (user) {
          setFullName(user.username || "");
          setEmailContact(user.email || "");
          // Only update if we get a valid URL - don't overwrite with null
          const url = resolveUserAvatar(user.avatar ?? null);
          if (url) {
            setAvatarPreview(url);
          }
          // If url is null, keep current avatarPreview as-is
        }
      }
    };

    fetchProfile();
  }, [user]);

  // Cleanup preview URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && confirmLogoutOpen) {
        setConfirmLogoutOpen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [confirmLogoutOpen]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast({ open: false, message: "", type: "success" }), 3000);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showToast("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "error");
      return;
    }

    // 5MB
    if (file.size > 5 * 1024 * 1024) {
      showToast("ไฟล์รูปภาพต้องมีขนาดไม่เกิน 5MB", "error");
      return;
    }

    // Show preview immediately using URL.createObjectURL
    // Cleanup previous preview URL if exists
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    previewUrlRef.current = previewUrl;
    setAvatarPreview(previewUrl);

    // Upload to backend
    setUploadingAvatar(true);
    try {
      await uploadAvatar(file);

      // Cleanup preview URL after successful upload
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      // Fetch fresh user data from backend after upload
      const freshMe = await getMe();
      
      // Update user in context with fresh data
      if (user && freshMe) {
        // Use canonical avatar field from fresh data (support both avatar and avatar_url)
        const freshAvatar = freshMe.avatar ?? freshMe.avatar_url ?? null;
        
        // Generate avatar_version for cache busting
        const avatarVersion = Date.now();
        
        const updatedUser = {
          ...user,
          username: freshMe.username || user.username,
          email: freshMe.email || user.email,
          avatar: freshAvatar, // Use fresh avatar from getMe()
          category_count: freshMe.category_count ?? user.category_count,
          avatar_version: avatarVersion, // Frontend-only cache busting property
        };

        setUser(updatedUser);
        localStorage.setItem("user", JSON.stringify(updatedUser));

        // Update preview with server URL using helper - only if valid
        const avatarUrl = resolveUserAvatar(freshAvatar);
        if (avatarUrl) {
          // Use avatar_version for cache busting
          setAvatarPreview(`${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${avatarVersion}`);
        }
        // If avatarUrl is null, keep current avatarPreview as-is (don't overwrite with null)
      }

      showToast("อัปโหลดรูปโปรไฟล์สำเร็จ", "success");
    } catch (err: any) {
      // Log detailed error information
      console.error("Avatar upload error:", {
        status: err?.status,
        statusText: err?.statusText,
        message: err?.message,
        responseText: err?.responseText,
        responseData: err?.responseData,
        url: err?.url,
      });

      // Cleanup preview URL on error
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }

      // Show user-friendly error message
      const message = err?.responseData?.message || err?.responseData?.error || err?.message || "ไม่สามารถอัปโหลดรูปได้";
      showToast(message, "error");
      
      // Reset preview on error to original avatar - only if valid
      const url = resolveUserAvatar(user?.avatar ?? null);
      if (url) {
        setAvatarPreview(url);
      }
      // If url is null, keep current avatarPreview as-is
    } finally {
      setUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSave = async () => {
    setError(null);
    
    // Validate inputs
    if (!fullName.trim()) {
      setError("กรุณากรอกชื่อผู้ใช้");
      return;
    }

    // Validate email format if provided
    if (emailContact.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailContact.trim())) {
        setError("รูปแบบอีเมลไม่ถูกต้อง");
        return;
      }
    }

    try {
      // Build payload - send username and email (mirror admin pattern)
      // Backend will check if values changed and only update if needed
      const payload: { username: string; email: string } = {
        username: fullName.trim(),
        email: emailContact.trim() || user?.email || "", // Use current email if empty
      };

      // Basic validation - backend will handle more detailed validation
      if (!payload.username) {
        setError("กรุณากรอกชื่อผู้ใช้");
        return;
      }

      console.log("[Profile Save] Sending payload:", payload);
      console.log("[Profile Save] Current user before update:", { username: user?.username, email: user?.email });
      
      const response = await updateMe(payload);
      console.log("[Profile Save] Response received:", response);
      console.log("[Profile Save] Response type:", typeof response);
      console.log("[Profile Save] Response.user exists?", !!response?.user);
      console.log("[Profile Save] Response.user value:", response?.user);

      // Only show success if response is valid and contains user data
      if (response && response.user && response.user.id) {
        console.log("[Profile Save] Response user data:", response.user);
        console.log("[Profile Save] Updated username:", response.user.username);
        console.log("[Profile Save] Updated email:", response.user.email);
        
        // Verify the values actually changed
        const usernameChanged = response.user.username !== user?.username;
        const emailChanged = response.user.email !== user?.email;
        console.log("[Profile Save] Username changed?", usernameChanged);
        console.log("[Profile Save] Email changed?", emailChanged);
        
        // Update user in context and localStorage
        if (user) {
          // Use canonical avatar field from response (support both avatar and avatar_url)
          const responseAvatar = response.user.avatar ?? response.user.avatar_url ?? null;
          const updatedUser = {
            ...user,
            username: response.user.username || user.username,
            email: response.user.email || user.email,
            avatar: responseAvatar, // Canonical field only
            category_count: response.user.category_count || user.category_count,
            avatar_version: user.avatar_version, // Preserve existing avatar_version
          };

          console.log("[Profile Save] Updating user state:", updatedUser);
          
          // Update AuthContext
          setUser(updatedUser);
          // Update localStorage
          localStorage.setItem("user", JSON.stringify(updatedUser));
          console.log("[Profile Save] User updated in context and localStorage");
          
          // Update local state
          setFullName(updatedUser.username);
          setEmailContact(updatedUser.email || "");
          const resolvedAvatar = resolveUserAvatar(responseAvatar);
          if (resolvedAvatar) {
            // Cache bust after update
            setAvatarPreview(`${resolvedAvatar}?t=${Date.now()}`);
          }
          // If resolvedAvatar is null, keep current avatarPreview as-is (don't overwrite with null)
        }

        showToast("บันทึกสำเร็จ", "success");
        setIsEditing(false);
        setError(null);
        console.log("[Profile Save] Success - changes saved");
      } else {
        // Invalid response - don't show success
        console.error("[Profile Save] Invalid response:", response);
        console.error("[Profile Save] Response structure:", JSON.stringify(response, null, 2));
        showToast("บันทึกข้อมูลไม่สำเร็จ", "error");
        setError("ไม่ได้รับข้อมูลที่อัปเดตจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง");
      }
    } catch (err: any) {
      console.error("[Profile Save] Error caught:", err);
      console.error("[Profile Save] Error status:", err.status);
      console.error("[Profile Save] Error message:", err.message);
      console.error("[Profile Save] Error responseData:", err.responseData);
      console.error("[Profile Save] Error stack:", err.stack);
      
      if (err.status === 409) {
        const errorMsg = err.responseData?.message || "อีเมลนี้ถูกใช้งานแล้ว";
        showToast(errorMsg, "error");
        setError(errorMsg);
      } else if (err.status === 400) {
        const errorMessage = err.responseData?.message || err.responseData?.errors?.[0] || err.message || "ข้อมูลไม่ถูกต้อง";
        showToast(errorMessage, "error");
        setError(errorMessage);
      } else if (err.status === 401 || err.status === 403) {
        showToast("กรุณาเข้าสู่ระบบใหม่", "error");
        setError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      } else {
        const errorMsg = err.responseData?.message || err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
        showToast("บันทึกข้อมูลไม่สำเร็จ", "error");
        setError(errorMsg);
      }
    }
  };

  const handleLogoutClick = () => {
    setConfirmLogoutOpen(true);
  };

  const confirmLogout = async () => {
    setLoggingOut(true);
    try {
      logout();
      router.push("/auth/login");
    } finally {
      setLoggingOut(false);
      setConfirmLogoutOpen(false);
    }
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50">
        <Navbar showBackButton={true} />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
            <div className="text-slate-500">กำลังโหลด...</div>
          </div>
        </main>
      </div>
    );
  }

  // Redirect if not logged in (after loading completes)
  if (user === null) {
    return null; // useEffect will handle redirect
  }

  const avatarGradient =
    user.role === "admin"
      ? "from-indigo-500 to-violet-500 border-violet-300"
      : "from-orange-400 to-amber-300 border-orange-300";

  // Use canonical avatar field from context
  const resolvedFromContext = resolveUserAvatar(user?.avatar ?? null);
  const displayAvatarUrl = avatarPreview || resolvedFromContext;
  
  // Debug logging to track state changes
  console.log("[Avatar Debug] avatarPreview=", avatarPreview, "resolvedFromContext=", resolvedFromContext, "display=", displayAvatarUrl);

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-slate-50 text-slate-800">
      <Navbar showBackButton={true} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">

        {/* Main Profile Card - Responsive Grid Layout */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left Column: Avatar Section */}
          <div className="md:col-span-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 lg:p-10 flex flex-col items-center justify-center min-h-full">
              {/* Avatar */}
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <div
                    className={`h-40 w-40 md:h-44 md:w-44 flex items-center justify-center rounded-full border-2 bg-gradient-to-tr ${avatarGradient} overflow-hidden`}
                  >
                    {displayAvatarUrl ? (
                      <img
                        src={displayAvatarUrl}
                        alt={user.username || "Avatar"}
                        className="w-full h-full object-cover"
                        onLoad={() => {
                          console.log("[Avatar] loaded successfully:", displayAvatarUrl);
                        }}
                        onError={(e) => {
                          const img = e.target as HTMLImageElement;
                          console.error("[Avatar] failed to load:", img.src);
                          // DO NOT immediately setAvatarPreview(null) here (avoid flicker loops)
                        }}
                      />
                    ) : (
                      <span className="text-white text-6xl leading-none">👤</span>
                    )}
                  </div>
                  {isEditing && (
                    <label className="absolute bottom-0 right-0 bg-orange-500 text-white rounded-full p-3 cursor-pointer hover:bg-orange-600 transition-colors shadow-md">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                        disabled={uploadingAvatar}
                      />
                      <svg
                        className="w-5 h-5 md:w-6 md:h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </label>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                      <div className="text-white text-xs">กำลังอัปโหลด...</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Hint text when editing */}
              {isEditing && (
                <div className="text-center mt-2">
                  <p className="text-xs text-slate-500">คลิกไอคอนกล้องเพื่อเปลี่ยนรูป</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Profile Fields and Actions */}
          <div className="md:col-span-8">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8">
              {/* Profile Fields */}
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">ชื่อผู้ใช้</label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="กรอกชื่อผู้ใช้"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-900"
                    />
                  ) : (
                    <div className="text-base font-semibold text-slate-900 px-4 py-2.5">{fullName || user.username || "-"}</div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">อีเมล</label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={emailContact}
                      onChange={(e) => setEmailContact(e.target.value)}
                      placeholder="กรอกอีเมล"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-slate-900"
                    />
                  ) : (
                    <div className="text-base font-semibold text-slate-900 px-4 py-2.5">{emailContact || user.email || "-"}</div>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div>
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2 inline-block">
                      {error}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions Section */}
              <div className="mt-8 pt-6 border-t border-slate-200">
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full rounded-xl border border-orange-300 bg-white text-orange-600 px-4 py-2.5 text-sm font-medium hover:bg-orange-50 transition-colors"
                  >
                    แก้ไขข้อมูล
                  </button>
                ) : (
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        // Cleanup preview URL if exists
                        if (previewUrlRef.current) {
                          URL.revokeObjectURL(previewUrlRef.current);
                          previewUrlRef.current = null;
                        }
                        // Reset form to original values
                        setFullName(user.username || "");
                        setEmailContact(user.email || "");
                        // Only reset avatar if we have a valid URL - don't overwrite with null
                        const url = resolveUserAvatar(user?.avatar ?? null);
                        if (url) {
                          setAvatarPreview(url);
                        }
                        // If url is null, keep current avatarPreview as-is
                        setError(null);
                      }}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleSave}
                      className="px-4 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
                    >
                      บันทึก
                    </button>
                  </div>
                )}
              </div>

              {/* Logout Button */}
              <div className="mt-4">
                <button
                  onClick={handleLogoutClick}
                  className="w-full rounded-xl border border-red-200 bg-red-50 text-red-700 py-2.5 text-sm font-extrabold transition hover:bg-red-600 hover:text-white"
                >
                  ออกจากระบบ
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Toast Notification */}
      {toast.open && (
        <div className="fixed top-5 right-5 z-[60]">
          <div
            className={`w-[320px] rounded-2xl border shadow-xl px-4 py-3 bg-white ${
              toast.type === "success" ? "border-emerald-200" : "border-red-200"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold ${
                  toast.type === "success" ? "bg-emerald-500" : "bg-red-500"
                }`}
              >
                {toast.type === "success" ? "✓" : "✕"}
              </div>
              <div className="flex-1">
                <p
                  className={`text-sm font-medium ${
                    toast.type === "success" ? "text-emerald-900" : "text-red-900"
                  }`}
                >
                  {toast.message}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {confirmLogoutOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-100 shadow-2xl">
            <h3 className="text-xl font-bold text-orange-600 mb-2">ยืนยันการออกจากระบบ</h3>
            <p className="text-sm font-medium text-slate-800">
              คุณแน่ใจหรือไม่ว่าต้องการออกจากระบบ?
            </p>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setConfirmLogoutOpen(false)}
                disabled={loggingOut}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmLogout}
                disabled={loggingOut}
                className="px-4 py-2 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loggingOut ? "กำลังออกจากระบบ..." : "ออกจากระบบ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
