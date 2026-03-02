"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";

// Email validation function
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate email format
    if (!isValidEmail(email)) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    // Check if password is empty
    if (!password.trim()) {
      setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      return;
    }

    setLoading(true);

    try {
      const data = await apiPost("/auth/login", { email, password });

      // ✅ 1. เก็บ token + user ใน localStorage
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      // ✅ 2. อัพเดท state ใน context เพื่อให้ UI อัพเดททันที
      setUser(data.user);

      // ✅ 3. Clear form inputs after successful login (security best practice)
      setEmail("");
      setPassword("");

      // ✅ 4. ตัดสินใจ redirect
      if (data.user.role === "admin") {
        // Admin always goes to admin dashboard
        router.replace("/admin");
      } else if (data.user.category_count === 0) {
        // Regular user without categories goes to onboarding
        router.replace("/onboarding/categories");
      } else {
        // Regular user with categories goes to home
        router.replace("/");
      }
    } catch (err: any) {
      // Handle backend errors - check for invalid credentials
      const errorMessage = err.message || "";
      const status = err.status;
      
      // Check for invalid credentials (401 or specific error messages)
      if (
        status === 401 ||
        errorMessage.toLowerCase().includes("invalid") ||
        errorMessage.toLowerCase().includes("รหัส") ||
        errorMessage.toLowerCase().includes("password") ||
        errorMessage.toLowerCase().includes("credentials")
      ) {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else {
        // Generic error for other cases (server down, network, etc.)
        setError(errorMessage || "เข้าสู่ระบบไม่สำเร็จ");
      }
    } finally {
      setLoading(false);
    }
  };

  // Clear error when user edits email
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError(null);
  };

  // Clear error when user edits password
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError(null);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">
          เข้าสู่ระบบ
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off" noValidate>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              อีเมล
            </label>
            <input
              type="text"
              inputMode="email"
              autoComplete="off"
              placeholder="Your@email.com"
              className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={email}
              onChange={handleEmailChange}
            />

          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              รหัสผ่าน
            </label>
            <input
              type="password"
              autoComplete="new-password"
              placeholder="รหัสผ่าน"
              className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={password}
              onChange={handlePasswordChange}
            />

          </div>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-300 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white py-2.5 text-sm"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-700">
          ยังไม่มีบัญชี?{" "}
          <button
            type="button"
            onClick={() => router.push("/auth/register")}
            className="text-orange-600 hover:underline font-medium"
          >
            สมัครสมาชิก
          </button>
        </p>

        {/* Back to Home Link */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <Link
            href="/"
            className="flex items-center justify-center gap-1.5 text-sm text-slate-600 hover:text-orange-600 transition-colors"
          >
            <span>←</span>
            <span>กลับหน้าหลัก</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
