import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { uploadAvatar as uploadAvatarMiddleware } from "../middleware/upload-avatar";
import { validateBody } from "../middleware/validate";
import { updateMeSchema } from "../validation/auth.schemas";
import {
  getMyProfile,
  updateMyProfile,
  uploadMyAvatar,
} from "../controllers/users.controller";

const router = Router();

// GET /api/users/me - Get current user profile
router.get("/me", authMiddleware, getMyProfile);

// PUT /api/users/me - Update current user profile
// Supports both JSON (username, email) and multipart/form-data (username, email, avatar file)
// Multer middleware only processes multipart/form-data requests, passes through JSON
router.put(
  "/me", 
  authMiddleware,
  // Only use multer for multipart/form-data, otherwise pass through
  (req, res, next) => {
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      uploadAvatarMiddleware.single("avatar")(req, res, next);
    } else {
      next();
    }
  },
  updateMyProfile
);

// POST /api/users/me/avatar - Upload user avatar only (kept for backward compatibility)
router.post("/me/avatar", authMiddleware, uploadAvatarMiddleware.single("avatar"), uploadMyAvatar);

export default router;

