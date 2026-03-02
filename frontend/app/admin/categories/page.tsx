"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface Category {
  id: number;
  name: string;
  code: string;
}

interface User {
  id: number;
  role: "admin" | "user";
}

const ITEMS_PER_PAGE = 10;

type ToastState = {
  open: boolean;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
};

export default function AdminCategoriesPage() {
  const router = useRouter();
  const { user, authLoading } = useAuth();

  // ===== State: Data =====
  const [me, setMe] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // ===== State: UI =====
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  // ===== State: Form =====
  const [form, setForm] = useState({
    name: "",
    code: "",
  });

  // ===== State: Toast =====
  const [toast, setToast] = useState<ToastState>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  // ===== State: Confirm Delete =====
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Category | null>(null);

  // ===== Handlers: Toast =====
  const showToast = (t: Omit<ToastState, "open">) => {
    setToast({ open: true, ...t });
    window.setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 2500);
  };

  // ===== Effects =====
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    if (user.role !== "admin") {
      router.replace("/");
      return;
    }

    setMe(user);
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, user, authLoading]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  // ===== Handlers: API =====
  const loadCategories = async () => {
    try {
      const items = await fetchCategories();
      setCategories(items as Category[]);
    } catch (error) {
      console.error("Error loading categories:", error);
      showToast({
        type: "error",
        title: "โหลดข้อมูลไม่สำเร็จ",
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อ",
      });
    }
  };

  const saveCategory = async () => {
    if (!form.name || !form.code) {
      showToast({
        type: "error",
        title: "ข้อมูลไม่ครบ",
        message: "กรุณากรอกชื่อหมวดหมู่และรหัส",
      });
      return;
    }

    try {
      if (editing) {
        await adminUpdateCategory(editing.id, form.name.trim(), form.code.trim());
      } else {
        await adminCreateCategory(form.name.trim(), form.code.trim());
      }

      // Success
      setOpen(false);
      setEditing(null);
      setForm({ name: "", code: "" });

      showToast({
        type: "success",
        title: editing ? "แก้ไขหมวดหมู่สำเร็จ" : "เพิ่มหมวดหมู่สำเร็จ",
        message: "ข้อมูลถูกบันทึกเรียบร้อย",
      });

      loadCategories();
    } catch (err: any) {
      console.error("Error saving category:", err);
      showToast({
        type: "error",
        title: "บันทึกไม่สำเร็จ",
        message: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
      });
    }
  };

  const deleteCategory = async (id: number) => {
    try {
      await adminDeleteCategory(id);
      showToast({
        type: "success",
        title: "ลบหมวดหมู่สำเร็จ",
        message: "หมวดหมู่ถูกลบออกจากระบบแล้ว",
      });
      loadCategories();
    } catch (err: any) {
      console.error("Error deleting category:", err);
      showToast({
        type: "error",
        title: "ลบไม่สำเร็จ",
        message: err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ",
      });
    }
  };

  // ===== Derived Data =====
  const filtered = useMemo(() => {
    const searchLower = search.toLowerCase();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(searchLower) ||
        c.code.toLowerCase().includes(searchLower)
    );
  }, [categories, search]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pagedCategories = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filtered.slice(startIndex, endIndex);
  }, [filtered, page]);

  // ===== Early Return =====
  if (!me) return null;

  return (
    <main className="min-h-screen bg-orange-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        {/* ===== HEADER ===== */}
        <div className="bg-white rounded-3xl shadow px-4 py-4 md:px-6 md:py-5 border border-orange-100">
          <h1 className="text-xl md:text-2xl font-bold text-orange-700">
            📂 Admin • Category Management
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-700 mt-1">
            จัดการหมวดหมู่นิยายทั้งหมดในระบบ
          </p>
        </div>

        {/* ===== ACTION BAR ===== */}
        <div className="bg-white p-4 rounded-3xl shadow border border-orange-100 flex flex-col md:flex-row gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="w-full md:w-auto px-4 py-2 rounded-xl bg-orange-500 text-white font-semibold text-sm md:text-base"
          >
            🏠 Home Admin
          </button>

          <input
            placeholder="🔍 ค้นหาชื่อหมวดหมู่หรือรหัส"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="
                            w-full md:flex-1
                            px-4 py-2
                            rounded-xl
                            border border-slate-300
                            font-normal
                            text-sm md:text-base
                            text-slate-900
                            placeholder:text-slate-500
                            focus:outline-none
                            focus:ring-2 focus:ring-orange-400
                            focus:border-orange-400
                        "
          />

          <button
            onClick={() => {
              setEditing(null);
              setForm({ name: "", code: "" });
              setOpen(true);
            }}
            className="w-full md:w-auto px-5 py-2 rounded-xl bg-orange-600 text-white font-semibold text-sm md:text-base"
          >
            ➕ เพิ่มหมวดหมู่
          </button>
        </div>

        {/* ===== TABLE (Desktop) ===== */}
        <div className="hidden md:block bg-white rounded-3xl shadow border border-orange-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-orange-600 text-white text-sm font-semibold">
              <tr>
                <th className="px-3 py-3 align-middle border-r border-orange-400/30">
                  ชื่อหมวดหมู่
                </th>
                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">
                  รหัส
                </th>
                <th className="px-3 py-3 text-center align-middle">การดำเนินการ</th>
              </tr>
            </thead>

            <tbody className="text-sm text-slate-800">
              {pagedCategories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center align-middle">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-3xl">📂</span>
                      <p className="text-slate-500 font-medium">ไม่พบหมวดหมู่</p>
                      <p className="text-xs text-slate-400">
                        {search ? "ลองค้นหาด้วยคำอื่น" : "เริ่มเพิ่มหมวดหมู่ใหม่"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedCategories.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 hover:bg-orange-50 transition-colors"
                  >
                    <td className="pl-6 pr-3 py-3 align-middle">
                      <div className="font-semibold text-base text-slate-900 truncate max-w-xs">
                        {c.name}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center align-middle">
                      <span className="inline-block px-2.5 py-1 rounded-md font-mono font-normal text-xs text-slate-500 bg-slate-50 truncate max-w-xs">
                        {c.code}
                      </span>
                    </td>

                  <td className="px-3 py-3 text-center align-middle">
                    <div className="flex justify-center items-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditing(c);
                          setForm({
                            name: c.name,
                            code: c.code,
                          });
                          setOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-xs hover:bg-sky-600 transition-colors"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => {
                          setConfirmTarget(c);
                          setConfirmOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
              )}
            </tbody>
          </table>
        </div>

        {/* ===== CARD LIST (Mobile) ===== */}
        <div className="md:hidden bg-white rounded-3xl shadow border border-orange-100 overflow-hidden">
          {pagedCategories.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="flex flex-col items-center gap-2">
                <span className="text-3xl">📂</span>
                <p className="text-slate-500 font-medium">ไม่พบหมวดหมู่</p>
                <p className="text-xs text-slate-400">
                  {search ? "ลองค้นหาด้วยคำอื่น" : "เริ่มเพิ่มหมวดหมู่ใหม่"}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pagedCategories.map((c) => (
                <div
                  key={c.id}
                  className="p-4 hover:bg-orange-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base text-slate-900 mb-2 truncate">
                        {c.name}
                      </h3>
                      <span className="inline-block px-2.5 py-1 rounded-md font-mono font-normal text-xs text-slate-500 bg-slate-50 truncate max-w-full">
                        {c.code}
                      </span>
                    </div>
                    <div className="flex items-start gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEditing(c);
                          setForm({
                            name: c.name,
                            code: c.code,
                          });
                          setOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-xs hover:bg-sky-600 transition-colors"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => {
                          setConfirmTarget(c);
                          setConfirmOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== PAGINATION ===== */}
        {totalPages > 1 && (
          <div className="bg-white rounded-3xl shadow border border-orange-100 p-4">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {/* Previous Button */}
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`
                  px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-semibold text-xs sm:text-sm transition
                  ${page === 1
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-orange-500 text-white hover:bg-orange-600 active:scale-95"
                  }
                `}
              >
                ก่อนหน้า
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1 sm:gap-1.5">
                {(() => {
                  const pages: (number | string)[] = [];

                  // Always show first page
                  pages.push(1);

                  // Calculate range around current page
                  const startPage = Math.max(2, page - 1);
                  const endPage = Math.min(totalPages - 1, page + 1);

                  // Add ellipsis if there's a gap between page 1 and startPage
                  if (startPage > 2) {
                    pages.push("ellipsis-start");
                  }

                  // Add pages around current page
                  for (let i = startPage; i <= endPage; i++) {
                    if (i !== 1 && i !== totalPages) {
                      pages.push(i);
                    }
                  }

                  // Add ellipsis if there's a gap between endPage and last page
                  if (endPage < totalPages - 1) {
                    pages.push("ellipsis-end");
                  }

                  // Always show last page (if more than 1 page)
                  if (totalPages > 1) {
                    pages.push(totalPages);
                  }

                  return pages.map((item, idx) => {
                    if (item === "ellipsis-start" || item === "ellipsis-end") {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-1 sm:px-2 text-slate-400 text-xs sm:text-sm">
                          ...
                        </span>
                      );
                    }

                    const pageNum = item as number;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`
                          w-9 h-9 sm:w-10 sm:h-10 rounded-full font-semibold text-xs sm:text-sm transition
                          ${pageNum === page
                            ? "bg-orange-600 text-white"
                            : "bg-slate-100 text-slate-700 hover:bg-orange-100 hover:text-orange-700 active:scale-95"
                          }
                        `}
                      >
                        {pageNum}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Next Button */}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className={`
                  px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-semibold text-xs sm:text-sm transition
                  ${page === totalPages
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-orange-500 text-white hover:bg-orange-600 active:scale-95"
                  }
                `}
              >
                ต่อไป
              </button>
            </div>

            {/* Page Info Text */}
            <div className="mt-3 text-center">
              <span className="text-xs sm:text-sm font-medium text-slate-600">
                หน้า {page} จาก {totalPages} • ทั้งหมด {filtered.length} หมวดหมู่
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ===== TOAST (Popup แจ้งผล) ===== */}
      {toast.open && (
        <div className="fixed top-5 right-5 z-[60]">
          <div
            className={`w-[320px] rounded-2xl border shadow-xl px-4 py-3 bg-white ${
              toast.type === "success"
                ? "border-emerald-200"
                : toast.type === "error"
                  ? "border-red-200"
                  : "border-slate-200"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold ${
                  toast.type === "success"
                    ? "bg-emerald-500"
                    : toast.type === "error"
                      ? "bg-red-500"
                      : "bg-slate-500"
                }`}
              >
                {toast.type === "success"
                  ? "✓"
                  : toast.type === "error"
                    ? "!"
                    : "i"}
              </div>

              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  {toast.title}
                </div>
                {toast.message && (
                  <div className="text-xs font-medium text-slate-700 mt-0.5">
                    {toast.message}
                  </div>
                )}
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

      {/* ===== MODAL: ADD/EDIT CATEGORY ===== */}
      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50 overflow-hidden px-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            {/* ===== HEADER ===== */}
            <div className="p-4 sm:p-6 border-b border-slate-200">
              <h3 className="text-lg sm:text-xl font-semibold text-orange-700">
                {editing ? "✏️ แก้ไขหมวดหมู่" : "➕ เพิ่มหมวดหมู่"}
              </h3>
            </div>

            {/* ===== SCROLLABLE CONTENT ===== */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* ===== NAME ===== */}
              <input
                placeholder="ชื่อหมวดหมู่ (ภาษาไทย)"
                className="
                                        w-full
                                        border border-slate-300
                                        rounded-xl
                                        px-4 py-2
                                        font-normal
                                        text-slate-900
                                        placeholder:text-slate-500
                                        focus:outline-none
                                        focus:ring-2 focus:ring-orange-400
                                    "
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              {/* ===== CODE ===== */}
              <input
                placeholder="รหัสหมวดหมู่ (ภาษาอังกฤษ)"
                className="
                                        w-full
                                        border border-slate-300
                                        rounded-xl
                                        px-4 py-2
                                        font-normal
                                        text-slate-900
                                        placeholder:text-slate-500
                                        focus:outline-none
                                        focus:ring-2 focus:ring-orange-400
                                    "
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>

            {/* ===== STICKY FOOTER ===== */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-4 sm:px-6 py-4 rounded-b-3xl flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="
                                        px-4 py-2
                                        rounded-xl
                                        border border-slate-400
                                        font-semibold
                                        text-slate-800
                                        hover:bg-slate-100
                                    "
              >
                ยกเลิก
              </button>
              <button
                onClick={saveCategory}
                className="
                                        px-4 py-2
                                        rounded-xl
                                        bg-orange-600
                                        text-white
                                        font-semibold
                                        hover:bg-orange-700
                                    "
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONFIRM DELETE MODAL ===== */}
      {confirmOpen && confirmTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-3xl p-4 sm:p-6 w-full max-w-md border border-slate-100 shadow-2xl">
            <h3 className="text-lg sm:text-xl font-bold text-red-600 mb-2">
              ยืนยันการลบหมวดหมู่
            </h3>
            <p className="text-sm font-medium text-slate-800">
              ต้องการลบหมวดหมู่{" "}
              <span className="font-semibold">{confirmTarget.name}</span>{" "}
              ({confirmTarget.code}) ใช่ไหม?
            </p>

            <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmTarget(null);
                }}
                className="px-4 py-2 rounded-xl border font-semibold text-sm text-slate-900 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  const id = confirmTarget.id;
                  setConfirmOpen(false);
                  setConfirmTarget(null);
                  await deleteCategory(id);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-700"
              >
                ลบหมวดหมู่
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

