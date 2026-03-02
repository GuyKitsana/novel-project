import { Router } from "express";
import {
  getRecommendationsForMe,
  getSimilarBooksToBook,
  trackBookView,
} from "../controllers/recommend.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validateQuery, validateParams } from "../middleware/validate";
import {
  recommendMeQuerySchema,
  similarBooksQuerySchema,
  bookIdParamsSchema,
} from "../validation/recommend.schemas";
import recommendDebugRoutes from "./recommendDebug.routes";

const router = Router();

/**
 * GET /api/recommend/me
 * Get personalized recommendations for authenticated user
 * Query params: limit (1-50, default: 20), behaviorRatio (0-1, default: 0.7)
 */
router.get(
  "/me",
  authMiddleware,
  validateQuery(recommendMeQuerySchema),
  getRecommendationsForMe
);

/**
 * GET /api/recommend/similar/:bookId
 * Get books similar to a given book (public, no auth required)
 * Query params: limit (1-50, default: 10)
 */
router.get(
  "/similar/:bookId",
  validateParams(bookIdParamsSchema),
  validateQuery(similarBooksQuerySchema),
  getSimilarBooksToBook
);

/**
 * POST /api/recommend/track-view/:bookId
 * Track that a user viewed a book (optional feature)
 * Requires authentication
 */
router.post(
  "/track-view/:bookId",
  authMiddleware,
  validateParams(bookIdParamsSchema),
  trackBookView
);

/**
 * Debug routes (only enabled in non-production)
 * Mounted at /api/recommend/debug/*
 */
router.use("/debug", recommendDebugRoutes);

export default router;
