import { Router } from "express";
import { login, register, getMe, uploadAvatar, updateMe } from "../controllers/auth.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { uploadAvatar as uploadAvatarMiddleware } from "../middleware/upload-avatar";
import { validateBody } from "../middleware/validate";
import { loginSchema, registerSchema, updateMeSchema } from "../validation/auth.schemas";

const router = Router();

// POST /api/auth/login
router.post("/login", validateBody(loginSchema), login);

// POST /api/auth/register
router.post("/register", validateBody(registerSchema), register);

// GET /api/auth/me - Get current user profile (requires auth)
router.get("/me", authMiddleware, getMe);

// POST /api/auth/me/avatar - Upload user avatar (requires auth)
router.post("/me/avatar", authMiddleware, uploadAvatarMiddleware.single("avatar"), uploadAvatar);

// PUT /api/auth/me - Update user profile (requires auth)
router.put("/me", authMiddleware, validateBody(updateMeSchema), updateMe);

export default router;
