"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminGetUsers, adminCreateUser, adminUpdateUser, adminDeleteUser } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

interface User {
  id: number;
  username: string;
  email: string;
  role: "admin" | "user";
}

const ITEMS_PER_PAGE = 10;

type ToastState = {
  open: boolean;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, authLoading } = useAuth();

  const [me, setMe] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    role: "user" as "admin" | "user",
  });

  // ✅ toast popup
  const [toast, setToast] = useState<ToastState>({
    open: false,
    type: "info",
    title: "",
    message: "",
  });

  const showToast = (t: Omit<ToastState, "open">) => {
    setToast({ open: true, ...t });
    window.setTimeout(() => {
      setToast((prev) => ({ ...prev, open: false }));
    }, 2500);
  };

  // ✅ confirm popup (แทน confirm())
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<User | null>(null);

  /* ================= ADMIN GUARD ================= */
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

    setMe({
      id: user.id,
      username: user.username,
      email: (user.email ?? "") as string,
      role: ((user.role ?? "user") as "admin" | "user"),
    });
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, user, authLoading]);

  /* ================= PREVENT BODY SCROLL WHEN MODAL OPEN ================= */
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

  /* ================= RESET PAGE WHEN SEARCH CHANGES ================= */
  useEffect(() => {
    setPage(1);
  }, [search]);

  /* ================= API ================= */
  const loadUsers = async () => {
    try {
      const items = await adminGetUsers();
      setUsers(items);
    } catch (err) {
      console.error("loadUsers failed", err);
      showToast({
        type: "error",
        title: "โหลดข้อมูลไม่สำเร็จ",
        message: "เกิดข้อผิดพลาดในการเชื่อมต่อ",
      });
    }
  };

  const saveUser = async () => {
    if (!form.username || !form.email) {
      showToast({
        type: "error",
        title: "ข้อมูลไม่ครบ",
        message: "กรุณากรอก username และ email",
      });
      return;
    }

    if (!editing && !form.password) {
      showToast({
        type: "error",
        title: "ต้องกรอกรหัสผ่าน",
        message: "การเพิ่มผู้ใช้ใหม่ต้องมีรหัสผ่าน",
      });
      return;
    }

    try {
      if (editing) {
        await adminUpdateUser(editing.id, form.username, form.email, form.password || undefined, form.role);
      } else {
        await adminCreateUser(form.username, form.email, form.password, form.role);
      }

      setOpen(false);
      setEditing(null);
      setForm({ username: "", email: "", password: "", role: "user" });

      showToast({
        type: "success",
        title: editing ? "อัปเดตผู้ใช้สำเร็จ" : "เพิ่มผู้ใช้สำเร็จ",
        message: "ข้อมูลถูกบันทึกเรียบร้อย",
      });

      loadUsers();
    } catch (err: any) {
      showToast({ type: "error", title: "บันทึกไม่สำเร็จ", message: err.message || "เกิดข้อผิดพลาด" });
    }
  };

  const deleteUser = async (id: number) => {
    try {
      await adminDeleteUser(id);
      showToast({
        type: "success",
        title: "ลบผู้ใช้สำเร็จ",
        message: "ผู้ใช้ถูกลบออกจากระบบแล้ว",
      });
      loadUsers();
    } catch (err: any) {
      showToast({ type: "error", title: "ลบไม่สำเร็จ", message: err.message || "เกิดข้อผิดพลาด" });
    }
  };

  /* ================= SEARCH ================= */
  const filtered = useMemo(() => {
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    );
  }, [users, search]);

  /* ================= PAGINATION ================= */
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const pagedUsers = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filtered.slice(startIndex, endIndex);
  }, [filtered, page]);

  if (!me) return null;

  return (
    <main className="min-h-screen bg-orange-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
        {/* ===== HEADER ===== */}
        <div className="bg-white rounded-3xl shadow px-4 py-4 md:px-6 md:py-5 border border-orange-100">
          <h1 className="text-xl md:text-2xl font-bold text-orange-700">
            👑 Admin • User Management
          </h1>
          <p className="text-xs md:text-sm font-medium text-slate-700 mt-1">
            จัดการบัญชีผู้ใช้ทั้งหมดในระบบ
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
            placeholder="🔍 ค้นหา ชื่อผู้ใช้ หรือ อีเมล"
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
              setForm({ username: "", email: "", password: "", role: "user" });
              setOpen(true);
            }}
            className="w-full md:w-auto px-5 py-2 rounded-xl bg-orange-600 text-white font-semibold text-sm md:text-base"
          >
            ➕ เพิ่มผู้ใช้
          </button>
        </div>


        {/* ===== TABLE (Desktop) ===== */}
        <div className="hidden md:block bg-white rounded-3xl shadow border border-orange-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-orange-600 text-white text-sm font-semibold">
              <tr>
                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">ชื่อผู้ใช้</th>
                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">อีเมล</th>
                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">บทบาท</th>
                <th className="px-3 py-3 text-center align-middle">การดำเนินการ</th>
              </tr>
            </thead>

            <tbody className="text-sm text-slate-800">
              {pagedUsers.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-100 hover:bg-orange-50 transition-colors"
                >
                  <td className="pl-6 pr-3 py-3 align-middle">
                    <div className="font-semibold text-base text-slate-900">
                      {u.username}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-center align-middle">
                    <span className="font-normal text-sm text-slate-600">
                      {u.email}
                    </span>
                  </td>

                  <td className="px-3 py-3 text-center align-middle">
                    <div className="flex justify-center">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-semibold ${u.role === "admin"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-slate-100 text-slate-700"
                          }`}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3 text-center align-middle">
                    <div className="flex justify-center items-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditing(u);
                          setForm({
                            username: u.username,
                            email: u.email,
                            password: "",
                            role: u.role,
                          });
                          setOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-xs hover:bg-sky-600 transition-colors"
                      >
                        ✏️
                      </button>

                      {u.id !== me.id && (
                        <button
                          onClick={() => {
                            setConfirmTarget(u);
                            setConfirmOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-colors"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===== CARD LIST (Mobile) ===== */}
        <div className="md:hidden bg-white rounded-3xl shadow border border-orange-100 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {pagedUsers.map((u) => (
              <div
                key={u.id}
                className="p-4 hover:bg-orange-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-base text-slate-900 truncate">
                        {u.username}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-semibold flex-shrink-0 ${u.role === "admin"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-slate-100 text-slate-700"
                          }`}
                      >
                        {u.role.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 truncate">
                      {u.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => {
                        setEditing(u);
                        setForm({
                          username: u.username,
                          email: u.email,
                          password: "",
                          role: u.role,
                        });
                        setOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-xs hover:bg-sky-600 transition-colors"
                    >
                      ✏️
                    </button>

                    {u.id !== me.id && (
                      <button
                        onClick={() => {
                          setConfirmTarget(u);
                          setConfirmOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-colors"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                หน้า {page} จาก {totalPages} • ทั้งหมด {filtered.length} คน
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ===== TOAST (Popup แจ้งผล) ===== */}
      {toast.open && (
        <div className="fixed top-5 right-5 z-[60]">
          <div
            className={`w-[320px] rounded-2xl border shadow-xl px-4 py-3 bg-white ${toast.type === "success"
              ? "border-emerald-200"
              : toast.type === "error"
                ? "border-red-200"
                : "border-slate-200"
              }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold ${toast.type === "success"
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

      {/* ===== MODAL: ADD/EDIT USER ===== */}
      {open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50 overflow-hidden px-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            {/* ===== HEADER ===== */}
            <div className="p-4 sm:p-6 border-b border-slate-200">
              <h3 className="text-lg sm:text-xl font-semibold text-orange-700">
                {editing ? "✏️ แก้ไขผู้ใช้" : "➕ เพิ่มผู้ใช้"}
              </h3>
            </div>

            {/* ===== SCROLLABLE CONTENT ===== */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* ===== USERNAME ===== */}
              <input
                placeholder="Username"
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
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />

              {/* ===== EMAIL ===== */}
              <input
                placeholder="Email"
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
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />

              {/* ===== PASSWORD ===== */}
              <input
                type="password"
                placeholder={
                  editing ? "เปลี่ยนรหัสผ่าน (ไม่บังคับ)" : "Password"
                }
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
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />

              {/* ===== ROLE ===== */}
              <select
                className="
                                        w-full
                                        border border-slate-300
                                        rounded-xl
                                        px-4 py-2
                                        font-normal
                                        text-slate-900
                                        focus:outline-none
                                        focus:ring-2 focus:ring-orange-400
                                    "
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as any })
                }
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
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
                onClick={saveUser}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-100 shadow-2xl">
            <h3 className="text-xl font-bold text-red-600 mb-2">
              ยืนยันการลบผู้ใช้
            </h3>
            <p className="text-sm font-medium text-slate-800">
              ต้องการลบผู้ใช้ <span className="font-semibold">{confirmTarget.username}</span>{" "}
              ({confirmTarget.email}) ใช่ไหม?
            </p>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmTarget(null);
                }}
                className="px-4 py-2 rounded-xl border font-semibold text-slate-900 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={async () => {
                  const id = confirmTarget.id;
                  setConfirmOpen(false);
                  setConfirmTarget(null);
                  await deleteUser(id);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700"
              >
                ลบผู้ใช้
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
