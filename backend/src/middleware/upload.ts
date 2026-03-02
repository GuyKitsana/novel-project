// Use namespace import for multer (CommonJS mode without esModuleInterop)
import * as multerNs from "multer";
// In CommonJS, namespace import IS the default export
const multer = multerNs;
import * as path from "path";
import * as fs from "fs";

// Use process.cwd() instead of __dirname for better compatibility
const booksUploadDir = path.join(process.cwd(), "uploads", "books");

// Ensure directory exists at module load time
try {
  fs.mkdirSync(booksUploadDir, { recursive: true });
  console.log("[upload] Books directory ready:", booksUploadDir);
} catch (err) {
  console.error("[upload] Failed to create books directory:", err);
  throw err;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // ให้แน่ใจว่าโฟลเดอร์ backend/uploads/books มีอยู่ ถ้าไม่มีก็สร้าง
    try {
      fs.mkdirSync(booksUploadDir, { recursive: true });
    } catch (err) {
      return cb(err as Error, "");
    }

    cb(null, booksUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);

    // ใช้ title จาก body มาสร้าง slug ที่ปลอดภัย
    const rawTitle = (req.body?.title as string) || "book";

    const slug = rawTitle
      .toLowerCase()
      // แทนที่อักษรที่ไม่ใช่ a-z 0-9 ด้วยช่องว่าง
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      // แปลงช่องว่างหลายตัวเป็นขีดกลางตัวเดียว
      .replace(/\s+/g, "-") || "book";

    // suffix ป้องกันชื่อไฟล์ซ้ำ
    const uniqueSuffix = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    cb(null, `${slug}-${uniqueSuffix}${ext}`);
  },
});

export const uploadBookCover = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files allowed"));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
