// Use namespace import for multer (CommonJS mode without esModuleInterop)
import * as multerNs from "multer";
// In CommonJS, namespace import IS the default export
const multer = multerNs;
import * as path from "path";
import * as fs from "fs";

// Use process.cwd() to ensure correct path regardless of compiled location
// This works in both CommonJS and ES modules contexts
const avatarsUploadDir = path.join(process.cwd(), "uploads", "avatars");

// Ensure directory exists at module load time
try {
  fs.mkdirSync(avatarsUploadDir, { recursive: true });
  console.log("[upload-avatar] Avatars directory ready:", avatarsUploadDir);
} catch (err) {
  console.error("[upload-avatar] Failed to create avatars directory:", err);
  throw err;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Ensure avatars directory exists
    try {
      fs.mkdirSync(avatarsUploadDir, { recursive: true });
    } catch (err) {
      return cb(err as Error, "");
    }

    cb(null, avatarsUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const userId = (req as any).user?.id || "user";
    
    // Use format: avatar_user_<userId>_<timestamp>.<ext>
    const timestamp = Date.now();
    const uniqueSuffix = Math.random()
      .toString(36)
      .slice(2, 8);

    cb(null, `avatar_user_${userId}_${timestamp}_${uniqueSuffix}${ext}`);
  },
});

export const uploadAvatar = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    // Restrict to specific image types: jpg, jpeg, png, webp
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedMimes.includes(file.mimetype)) {
      cb(new Error("Only jpg, jpeg, png, and webp images are allowed"));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

