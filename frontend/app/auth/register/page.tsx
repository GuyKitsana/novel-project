"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiPost } from "@/app/services/api";

// Email validation function
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
  
    // Validate required fields
    if (!username.trim()) {
      setError("กรุณากรอกชื่อผู้ใช้");
      return;
    }
  
    // Validate email format
    if (!isValidEmail(email)) {
      setError("อีเมลไม่ถูกต้อง");
      return;
    }
  
    // Check if password is empty or confirmPassword is empty
    if (!password.trim() || !confirmPassword.trim()) {
      setError("รหัสไม่ถูกต้อง");
      return;
    }
  
    // Check password match
    if (password !== confirmPassword) {
      setError("รหัสไม่ถูกต้อง");
      return;
    }
  
    setLoading(true);
  
    try {
      await apiPost("/auth/register", {
        username,
        email,
        password,
      });
  
      // Redirect to login after successful registration
      router.replace("/auth/login");
    } catch (err: any) {
      setError(err.message || "สมัครสมาชิกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // Clear error when user edits username
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    if (error) setError(null);
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

  // Clear error when user edits confirm password
  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    if (error) setError(null);
  };
  

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-900 mb-6 text-center">
          ลงทะเบียน
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              ชื่อผู้ใช้
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={username}
              onChange={handleUsernameChange}
              placeholder="ชื่อผู้ใช้"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              อีเมล
            </label>
            <input
              type="text"
              inputMode="email"
              className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={email}
              onChange={handleEmailChange}
              placeholder="you@gmail.com"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              รหัสผ่าน
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={password}
              onChange={handlePasswordChange}
              placeholder="อย่างน้อย 8 ตัว"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              ยืนยันรหัสผ่าน
            </label>
            <input
              type="password"
              className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              value={confirmPassword}
              onChange={handleConfirmPasswordChange}
              placeholder="กรอกรหัสผ่านอีกครั้ง"
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
            className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {loading ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-700">
          มีบัญชีอยู่แล้ว?{" "}
          <button
            type="button"
            onClick={() => router.push("/auth/login")}
            className="text-orange-600 hover:underline font-medium"
          >
            เข้าสู่ระบบ
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
