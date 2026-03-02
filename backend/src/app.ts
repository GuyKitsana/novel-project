import * as express from "express";
import * as cors from "cors";
import * as path from "path";

import authRoutes from "./routes/auth.routes";
import booksRoutes from "./routes/books.routes";
import favoritesRoutes from "./routes/favorites.routes";
import reviewsRoutes from "./routes/reviews.routes";
import onboardingRoutes from "./routes/onboarding.routes";
import adminRoutes from "./routes/admin.routes";
import categoriesRoutes from "./routes/categories.routes";
import usersRoutes from "./routes/users.routes";
import recommendRoutes from "./routes/recommend.routes";

import { authMiddleware, adminOnly } from "./middleware/auth.middleware";
import { errorHandler } from "./middleware/error-handler";
import { query } from "./db";

// ใน CommonJS โดยไม่มี esModuleInterop namespace import คือ default export
const app = express();

/* ================= GLOBAL MIDDLEWARE ================= */
// การตั้งค่า CORS - อนุญาต Next.js dev server และ production domain
const getAllowedOrigins = (): string[] => {
  const origins: string[] = [];
  
  // Add production frontend URL from environment
  if (process.env.FRONTEND_URL) {
    origins.push(process.env.FRONTEND_URL);
  }
  
  // Add development frontend URL (only in development)
  if (process.env.NODE_ENV !== "production") {
    origins.push("http://localhost:3000");
  }
  
  // Fallback to localhost if no origins configured (development only)
  if (origins.length === 0) {
    origins.push("http://localhost:3000");
  }
  
  return origins;
};

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Type"],
};

app.use(cors(corsOptions));

// จัดการ preflight requests อย่างชัดเจนด้วย regex pattern (รองรับ Express 5)
app.options(/.*/, cors(corsOptions));

app.use(express.json());

/* ================= STATIC FILES (UPLOADS) ================= */
// ใช้ process.cwd() เพื่อให้แน่ใจว่า path ถูกต้องไม่ว่าจะ compile ที่ไหน
const uploadsDir = path.join(process.cwd(), "uploads");
const uploadsBooksDir = path.join(process.cwd(), "uploads", "books");
const uploadsAvatarsDir = path.join(process.cwd(), "uploads", "avatars");

console.log("[app.ts] Serving uploads from:", uploadsDir);
console.log("[app.ts] Serving books from:", uploadsBooksDir);
console.log("[app.ts] Serving avatars from:", uploadsAvatarsDir);

// 👉 เสิร์ฟไฟล์ใน backend/uploads ภายใต้ prefix /uploads
//    ตัวอย่าง: http://localhost:3001/uploads/books/xxx.jpg
app.use("/uploads", express.static(uploadsDir));

// 👉 เพิ่ม prefix /books สำหรับรูปปกหนังสือที่เก็บใน backend/uploads/books
//    ทำให้ path แบบที่บันทึกใน DB เป็น "/books/filename.jpg" ใช้งานได้ตรง ๆ
//    เช่น GET /books/orv_5.jpg -> backend/uploads/books/orv_5.jpg
app.use("/books", express.static(uploadsBooksDir));

// 👉 เสิร์ฟไฟล์ avatar ที่เก็บใน backend/uploads/avatars
app.use("/avatars", express.static(uploadsAvatarsDir));


/* ================= ROUTES ================= */
app.use("/api/auth", authRoutes);
app.use("/api/books", booksRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/recommend", recommendRoutes);

/* ================= REMOVED DUPLICATE ROUTES ================= */
// หมายเหตุ: routes ต่อไปนี้ถูกลบเพราะซ้ำกับ routes ที่กำหนดไว้แล้วในไฟล์ route:
// - /api/auth/me: ควรเพิ่มใน auth.routes.ts ถ้าจำเป็น (ปัจจุบันจัดการโดย /api/onboarding/me)
// - /api/admin/users: กำหนดไว้แล้วใน admin.routes.ts
// - /api/admin/test: Test route ถูกลบ (ใช้ /api/admin/dashboard สำหรับทดสอบ)
// - /api/profile: ถูกลบ (ใช้ /api/auth/me หรือ /api/onboarding/me แทน)

/* ================= HEALTH CHECK ================= */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "ok", message: "Backend is running", timestamp: new Date().toISOString() });
});

/* ================= ERROR HANDLER ================= */
// ⬇️ ต้องอยู่ล่างสุด
app.use(errorHandler);

export default app;
