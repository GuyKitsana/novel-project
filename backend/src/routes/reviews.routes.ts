// src/routes/reviews.routes.ts
import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  createOrUpdateReview,
  getReviewsByBookId,
  getMyReviews,
  getMyReviewByBookId,
  deleteReview,
} from "../controllers/reviews.controller";
import { validateBody, validateParams } from "../middleware/validate";
import { createReviewSchema, reviewBookIdParamsSchema, reviewIdParamsSchema } from "../validation/reviews.schemas";

const router = Router();

// 1) เพิ่ม/แก้รีวิว – ต้อง login
router.post(
  "/:bookId",
  authMiddleware,
  validateParams(reviewBookIdParamsSchema),
  validateBody(createReviewSchema),
  createOrUpdateReview
);

// 2) รีวิวทั้งหมดของหนังสือเล่มหนึ่ง – public (ไม่ต้อง login ก็ได้)
router.get("/book/:bookId", getReviewsByBookId);

// 3) รีวิวทั้งหมดของ user คนนี้ – ต้อง login
router.get("/me", authMiddleware, getMyReviews);

// 3b) รีวิวของ user คนนี้สำหรับหนังสือเล่มหนึ่ง – ต้อง login
router.get("/me/:bookId", authMiddleware, getMyReviewByBookId);

// 4) ลบรีวิว – ต้อง login (เจ้าของหรือ admin)
router.delete("/:reviewId", authMiddleware, validateParams(reviewIdParamsSchema), deleteReview);

export default router;
