import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  getOnboardingStatus,
  saveCategories,
  getUserCategories,
} from "../controllers/onboarding.controller";
import { validateBody } from "../middleware/validate";
import { saveCategoriesSchema } from "../validation/onboarding.schemas";

const router = Router();

// เช็กว่าเคยทำ onboarding แล้วหรือยัง
router.get("/me", authMiddleware, getOnboardingStatus);

// บันทึกหมวดที่เลือก
router.put("/categories", authMiddleware, validateBody(saveCategoriesSchema), saveCategories);

// ดึงหมวดที่ผู้ใช้เลือก
router.get("/categories", authMiddleware, getUserCategories);

export default router;
