"use client";

// ===== React & Next =====
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// ===== Local helpers =====
import { getImageUrl, adminGetBooks, adminCreateBook, adminUpdateBook, adminDeleteBook, fetchCategories } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

// ===== Types =====
interface Book {
    id: number;
    title: string;
    author?: string;
    publisher?: string;
    cover_image?: string;
    description?: string;
    description_tfidf?: string;
    series_id?: number;
    series_title?: string;
    volume_no?: number | null;
    categories?: string[];
    buy_link?: string;
}

interface User {
    id: number;
    role: "admin" | "user";
}

interface Category {
    id: number;
    name: string;
    code: string;
}

type ToastState = {
    open: boolean;
    type: "success" | "error" | "info";
    title: string;
    message?: string;
};

const ITEMS_PER_PAGE = 10;

export default function AdminBooksPage() {
    const router = useRouter();
    const { user, authLoading } = useAuth();

    // ===== State: Data =====
    const [me, setMe] = useState<User | null>(null);
    const [books, setBooks] = useState<Book[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

    // ===== State: UI =====
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Book | null>(null);

    // ===== State: Form =====
    const [form, setForm] = useState({
        title: "",
        author: "",
        publisher: "",
        description: "",
        description_tfidf: "",
        series_title: "",
        volume_no: "",
        // เก็บ category เป็น string ของ id เพื่อส่งให้ backend ตามสัญญาเดิม (categories[])
        categories: [] as string[],
        buy_link: "",
    });
    const [file, setFile] = useState<File | null>(null);

    // ===== State: Toast =====
    const [toast, setToast] = useState<ToastState>({
        open: false,
        type: "info",
        title: "",
        message: "",
    });

    // ===== State: Confirm Delete =====
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState<Book | null>(null);

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
        loadBooks();
        loadCategories();
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

    // ===== Handlers: Toast =====
    const showToast = (t: Omit<ToastState, "open">) => {
        setToast({ open: true, ...t });
        window.setTimeout(() => {
            setToast((prev) => ({ ...prev, open: false }));
        }, 2500);
    };

    // ===== Handlers: API =====
    const loadBooks = async () => {
        try {
            const items = await adminGetBooks(1000);
            setBooks(items);
        } catch (error) {
            console.error("Error loading books:", error);
            showToast({
                type: "error",
                title: "โหลดข้อมูลไม่สำเร็จ",
                message: "เกิดข้อผิดพลาดในการเชื่อมต่อ",
            });
        }
    };

    const loadCategories = async () => {
        try {
            const items = await fetchCategories();
            setCategories(items as Category[]);
        } catch (error) {
            console.error("Error loading categories:", error);
        }
    };

    const saveBook = async () => {
        if (!form.title) {
            showToast({
                type: "error",
                title: "ข้อมูลไม่ครบ",
                message: "กรุณากรอกชื่อหนังสือ",
            });
            return;
        }

        if (form.categories.length === 0) {
            showToast({
                type: "error",
                title: "ข้อมูลไม่ครบ",
                message: "กรุณาเลือกหมวดหมู่อย่างน้อย 1 หมวด",
            });
            return;
        }

        const formData = new FormData();
        formData.append("title", form.title);
        formData.append("author", form.author);
        formData.append("publisher", form.publisher);
        formData.append("description", form.description);
        formData.append("description_tfidf", form.description_tfidf);
        formData.append("buy_link", form.buy_link);
        
        // Series fields (optional)
        if (form.series_title) {
            formData.append("series_title", form.series_title);
        }
        if (form.volume_no && form.volume_no.trim() !== "") {
            formData.append("volume_no", form.volume_no);
        }

        // ส่ง categoryIds เป็น number[] ตามสัญญา backend
        const categoryIds = form.categories.map((idStr) => Number(idStr)).filter((n) => !Number.isNaN(n));
        formData.append("categoryIds", JSON.stringify(categoryIds));

        if (file) formData.append("cover", file);

        try {
            if (editing) {
                await adminUpdateBook(editing.id, formData);
            } else {
                await adminCreateBook(formData);
            }

            showToast({
                type: "success",
                title: editing ? "แก้ไขหนังสือสำเร็จ" : "เพิ่มหนังสือสำเร็จ",
                message: "ข้อมูลหนังสือถูกบันทึกเรียบร้อย",
            });
            setOpen(false);
            setEditing(null);
            setForm({
                title: "",
                author: "",
                publisher: "",
                description: "",
                description_tfidf: "",
                series_title: "",
                volume_no: "",
                categories: [],
                buy_link: "",
            });
            setFile(null);
            loadBooks();
        } catch (err: any) {
            showToast({
                type: "error",
                title: "บันทึกไม่สำเร็จ",
                message: err.message || "เกิดข้อผิดพลาดในการบันทึก",
            });
        }
    };

    const deleteBook = async (id: number) => {
        try {
            await adminDeleteBook(id);
            showToast({
                type: "success",
                title: "ลบหนังสือสำเร็จ",
                message: "หนังสือถูกลบออกจากระบบแล้ว",
            });
            loadBooks();
        } catch (err: any) {
            showToast({
                type: "error",
                title: "ลบหนังสือไม่สำเร็จ",
                message: err.message || "เกิดข้อผิดพลาดในการลบ",
            });
        }
    };

    // ===== Derived Data =====
    const filtered = useMemo(() => {
        const searchLower = search.toLowerCase();
        return books.filter((b) => {
            // Match against title
            if (b.title.toLowerCase().includes(searchLower)) return true;
            
            // Match against author
            if ((b.author ?? "").toLowerCase().includes(searchLower)) return true;
            
            // Match against publisher
            if ((b.publisher ?? "").toLowerCase().includes(searchLower)) return true;
            
            // Match against categories (array)
            if (b.categories && Array.isArray(b.categories)) {
                if (b.categories.some((cat) => 
                    String(cat).toLowerCase().includes(searchLower)
                )) return true;
            }
            
            return false;
        });
    }, [books, search]);

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const pagedBooks = useMemo(() => {
        const startIndex = (page - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        return filtered.slice(startIndex, endIndex);
    }, [filtered, page]);

    // ===== Early Return =====
    if (!me) return null;

    // ===== Render =====
    return (
        <main className="min-h-screen bg-orange-50 p-4 md:p-8">
            <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">

                {/* ===== HEADER ===== */}
                <div className="bg-white rounded-3xl shadow px-4 py-4 md:px-6 md:py-5 border border-orange-100">
                    <h1 className="text-xl md:text-2xl font-bold text-orange-700">
                        📚 Admin • Book Management
                    </h1>
                    <p className="text-xs md:text-sm font-medium text-slate-700 mt-1">
                        จัดการนิยายทั้งหมดในระบบ
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
                        placeholder="🔍 ค้นหานิยาย / ผู้แต่ง / สำนักพิมพ์ / หมวดหมู่"
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
                            setForm({
                                title: "",
                                author: "",
                                publisher: "",
                                description: "",
                                description_tfidf: "",
                                series_title: "",
                                volume_no: "",
                                categories: [],
                                buy_link: "",
                            });
                            setFile(null);
                            setOpen(true);
                        }}
                        className="w-full md:w-auto px-5 py-2 rounded-xl bg-orange-600 text-white font-semibold text-sm md:text-base"
                    >
                        ➕ เพิ่มหนังสือ
                    </button>
                </div>

                {/* ===== TABLE (Desktop) ===== */}
                <div className="hidden md:block bg-white rounded-3xl shadow border border-orange-100 overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-orange-600 text-white text-sm font-semibold">
                            <tr>
                                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">ปก</th>
                                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">ชื่อเรื่อง</th>
                                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">ผู้แต่ง</th>
                                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">รายละเอียด</th>
                                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">สำนักพิมพ์</th>
                                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">หมวดหมู่</th>
                                <th className="px-3 py-3 text-center align-middle border-r border-orange-400/30">ลิ้งค์</th>
                                <th className="px-3 py-3 text-center align-middle">การดำเนินการ</th>
                            </tr>
                        </thead>

                        <tbody className="text-sm text-slate-800">
                            {pagedBooks.map((b) => (
                                <tr key={b.id} className="border-b border-slate-100 hover:bg-orange-50 transition-colors">
                                    {/* ปก */}
                                    <td className="px-3 py-3 text-center align-middle">
                                        {b.cover_image ? (
                                            <div className="w-20 h-[120px] rounded overflow-hidden mx-auto">
                                                <img
                                                    src={getImageUrl(b.cover_image)}
                                                    alt={b.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-20 h-[120px] bg-slate-200 rounded mx-auto" />
                                        )}
                                    </td>

                                    {/* ชื่อเรื่อง */}
                                    <td className="px-3 py-3 align-middle">
                                        <div className="font-semibold text-base text-slate-900">
                                            {b.title}
                                        </div>
                                    </td>

                                    {/* ผู้แต่ง */}
                                    <td className="px-3 py-3 text-center align-middle font-medium text-slate-700">
                                        {b.author || "-"}
                                    </td>

                                    {/* รายละเอียด */}
                                    <td className="px-3 py-3 text-center align-middle font-normal text-slate-600 max-w-xs">
                                        <p className="line-clamp-2 text-xs">
                                            {b.description || "-"}
                                        </p>
                                    </td>

                                    {/* สำนักพิมพ์ */}
                                    <td className="px-3 py-3 text-center align-middle font-medium text-slate-700">
                                        {b.publisher || "-"}
                                    </td>

                                    {/* หมวดหมู่ */}
                                    <td className="px-3 py-3 text-center align-middle">
                                        {b.categories && b.categories.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 justify-center">
                                                {b.categories.map((c) => (
                                                    <span
                                                        key={c}
                                                        className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 font-semibold text-xs"
                                                    >
                                                        {c}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 text-xs">-</span>
                                        )}
                                    </td>

                                    {/* ลิ้งค์ร้านค้า */}
                                    <td className="px-3 py-3 text-center align-middle">
                                        {b.buy_link ? (
                                            <a
                                                href={b.buy_link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 font-medium text-sky-600 hover:text-sky-700 hover:underline text-xs"
                                            >
                                                🔗 Go
                                            </a>
                                        ) : (
                                            <span className="text-slate-400 text-xs">-</span>
                                        )}
                                    </td>

                                    {/* Actions */}
                                    <td className="px-3 py-3 text-center align-middle">
                                        <div className="flex justify-center gap-1.5">
                                            <button
                                                onClick={() => {
                                                    setEditing(b);

                                                    // แปลง categories จากรูปแบบที่ backend ส่งมา (id / code / name)
                                                    // ให้เป็น string ของ id เพื่อใช้กับ checkbox และ payload
                                                    const mappedCategories =
                                                        (b.categories || [])
                                                            .map((val) => {
                                                                const strVal = String(val);

                                                                // กรณี backend ส่ง id ตรง ๆ
                                                                const byId = categories.find(
                                                                    (c) => String(c.id) === strVal
                                                                );
                                                                if (byId) return String(byId.id);

                                                                // กรณี backend ส่ง code
                                                                const byCode = categories.find(
                                                                    (c) => c.code === strVal
                                                                );
                                                                if (byCode) return String(byCode.id);

                                                                // กรณี backend ส่ง name
                                                                const byName = categories.find(
                                                                    (c) => c.name === strVal
                                                                );
                                                                if (byName) return String(byName.id);

                                                                return null;
                                                            })
                                                            .filter(
                                                                (idStr): idStr is string => Boolean(idStr)
                                                            );

                                                    setForm({
                                                        title: b.title,
                                                        author: b.author || "",
                                                        publisher: b.publisher || "",
                                                        description: b.description || "",
                                                        description_tfidf: b.description_tfidf || b.description || "",
                                                        series_title: b.series_title || "",
                                                        volume_no: b.volume_no ? String(b.volume_no) : "",
                                                        categories: mappedCategories,
                                                        buy_link: b.buy_link || "",
                                                    });
                                                    setOpen(true);
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-xs hover:bg-sky-600 transition-colors"
                                            >
                                                ✏️
                                            </button>

                                            <button
                                                onClick={() => {
                                                    setConfirmTarget(b);
                                                    setConfirmOpen(true);
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-colors"
                                            >
                                                🗑️
                                            </button>
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
                        {pagedBooks.map((b) => (
                            <div
                                key={b.id}
                                className="p-4 hover:bg-orange-50 transition-colors"
                            >
                                <div className="flex gap-3">
                                    {/* Cover Preview */}
                                    <div className="flex-shrink-0">
                                        {b.cover_image ? (
                                            <div className="w-16 h-24 rounded overflow-hidden">
                                                <img
                                                    src={getImageUrl(b.cover_image)}
                                                    alt={b.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                        ) : (
                                            <div className="w-16 h-24 bg-slate-200 rounded" />
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-base text-slate-900 mb-1 truncate">
                                            {b.title}
                                        </h3>
                                        {b.author && (
                                            <p className="text-sm text-slate-600 mb-2 truncate">
                                                โดย {b.author}
                                            </p>
                                        )}
                                        {b.publisher && (
                                            <p className="text-xs text-slate-500 mb-2 truncate">
                                                {b.publisher}
                                            </p>
                                        )}
                                        {b.categories && b.categories.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {b.categories.slice(0, 2).map((c) => (
                                                    <span
                                                        key={c}
                                                        className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 font-semibold text-xs"
                                                    >
                                                        {c}
                                                    </span>
                                                ))}
                                                {b.categories.length > 2 && (
                                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-xs">
                                                        +{b.categories.length - 2}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 mt-2">
                                            <button
                                                onClick={() => {
                                                    setEditing(b);

                                                    const mappedCategories =
                                                        (b.categories || [])
                                                            .map((val) => {
                                                                const strVal = String(val);
                                                                const byId = categories.find(
                                                                    (c) => String(c.id) === strVal
                                                                );
                                                                if (byId) return String(byId.id);
                                                                const byCode = categories.find(
                                                                    (c) => c.code === strVal
                                                                );
                                                                if (byCode) return String(byCode.id);
                                                                const byName = categories.find(
                                                                    (c) => c.name === strVal
                                                                );
                                                                if (byName) return String(byName.id);
                                                                return null;
                                                            })
                                                            .filter(
                                                                (idStr): idStr is string => Boolean(idStr)
                                                            );

                                                    setForm({
                                                        title: b.title,
                                                        author: b.author || "",
                                                        publisher: b.publisher || "",
                                                        description: b.description || "",
                                                        description_tfidf: b.description_tfidf || b.description || "",
                                                        series_title: b.series_title || "",
                                                        volume_no: b.volume_no ? String(b.volume_no) : "",
                                                        categories: mappedCategories,
                                                        buy_link: b.buy_link || "",
                                                    });
                                                    setOpen(true);
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-sky-500 text-white font-semibold text-xs hover:bg-sky-600 transition-colors"
                                            >
                                                ✏️ แก้ไข
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setConfirmTarget(b);
                                                    setConfirmOpen(true);
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-red-500 text-white font-semibold text-xs hover:bg-red-600 transition-colors"
                                            >
                                                🗑️ ลบ
                                            </button>
                                        </div>
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
                                หน้า {page} จาก {totalPages} • ทั้งหมด {filtered.length} เล่ม
                            </span>
                        </div>
                    </div>
                )}

                {/* ===== MODAL: ADD/EDIT BOOK ===== */}
                {open && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur flex items-center justify-center z-50 overflow-hidden px-4">
                        <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
                            {/* ===== HEADER ===== */}
                            <div className="p-4 sm:p-6 border-b border-slate-200">
                                <h3 className="text-lg sm:text-xl font-semibold text-orange-700">
                                    {editing ? "✏️ แก้ไขหนังสือ" : "➕ เพิ่มหนังสือ"}
                                </h3>
                            </div>

                            {/* ===== SCROLLABLE CONTENT ===== */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                                {/* ===== TITLE ===== */}
                                <input
                                    placeholder="ชื่อหนังสือ"
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
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                />

                                {/* ===== AUTHOR ===== */}
                                <input
                                    placeholder="ผู้แต่ง"
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
                                    value={form.author}
                                    onChange={(e) => setForm({ ...form, author: e.target.value })}
                                />

                                {/* ===== PUBLISHER ===== */}
                                <input
                                    placeholder="สำนักพิมพ์"
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
                                    value={form.publisher}
                                    onChange={(e) =>
                                        setForm({ ...form, publisher: e.target.value })
                                    }
                                />

                                {/* ===== DESCRIPTION ===== */}
                                <textarea
                                    placeholder="รายละเอียดหนังสือ"
                                    rows={4}
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
                                    value={form.description}
                                    onChange={(e) =>
                                        setForm({ ...form, description: e.target.value })
                                    }
                                />

                                {/* ===== DESCRIPTION TF-IDF ===== */}
                                <div>
                                    <textarea
                                        placeholder="คำอธิบาย (สำหรับระบบแนะนำ / TF-IDF)"
                                        rows={4}
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
                                        value={form.description_tfidf}
                                        onChange={(e) =>
                                            setForm({ ...form, description_tfidf: e.target.value })
                                        }
                                    />
                                </div>

                                {/* ===== SERIES (OPTIONAL) ===== */}
                                <div className="border-t border-slate-200 pt-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <input
                                            placeholder="ชื่อซีรีส์นิยาย (ถ้ามี)"
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
                                            value={form.series_title}
                                            onChange={(e) =>
                                                setForm({ ...form, series_title: e.target.value })
                                            }
                                        />
                                        <input
                                            type="number"
                                            placeholder="เลขเล่ม (ถ้ามี)"
                                            min="1"
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
                                            value={form.volume_no}
                                            onChange={(e) =>
                                                setForm({ ...form, volume_no: e.target.value })
                                            }
                                        />
                                    </div>
                                </div>

                                {/* ===== BUY LINK ===== */}
                                <input
                                    placeholder="ลิงก์ร้านค้า"
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
                                    value={form.buy_link}
                                    onChange={(e) =>
                                        setForm({ ...form, buy_link: e.target.value })
                                    }
                                />

                                {/* ===== MULTI CATEGORY ===== */}
                                <div>
                                    <p className="font-semibold text-slate-900 mb-2">
                                        หมวดหมู่ (เลือกได้หลายหมวด)
                                    </p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {categories.map((c) => {
                                            const idStr = String(c.id);
                                            const checked = form.categories.includes(idStr);
                                            return (
                                                <label
                                                    key={c.id}
                                                    className="flex items-center gap-2 text-sm font-medium text-slate-800"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => {
                                                            setForm((prev) => {
                                                                const exists = prev.categories.includes(idStr);
                                                                return {
                                                                    ...prev,
                                                                    categories: exists
                                                                        ? prev.categories.filter((x) => x !== idStr)
                                                                        : [...prev.categories, idStr],
                                                                };
                                                            });
                                                        }}
                                                    />
                                                    {c.name}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ===== COVER ===== */}
                                <label className="
                                    block
                                    border-2 border-dashed border-orange-300
                                    rounded-xl
                                    p-4
                                    text-center
                                    cursor-pointer
                                    font-semibold
                                    text-slate-800
                                    hover:bg-orange-50
                                ">
                                    📷 เลือกรูปปกหนังสือ
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    />
                                    {file && (
                                        <div className="text-xs mt-2 font-medium text-slate-700">
                                            {file.name}
                                        </div>
                                    )}
                                </label>
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
                                    onClick={saveBook}
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

            {/* ===== CONFIRM DELETE MODAL ===== */}
            {confirmOpen && confirmTarget && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-100 shadow-2xl">
                        <h3 className="text-xl font-bold text-red-600 mb-2">
                            ยืนยันการลบหนังสือ
                        </h3>
                        <p className="text-sm font-medium text-slate-800">
                            ต้องการลบหนังสือ{" "}
                            <span className="font-semibold">{confirmTarget.title}</span>{" "}
                            ใช่ไหม?
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
                                    await deleteBook(id);
                                }}
                                className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700"
                            >
                                ลบหนังสือ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
