import { Router } from "express";
import { getBookDebugInfo } from "../controllers/recommendDebug.controller";
import { validateQuery, validateParams } from "../middleware/validate";
import {
  bookIdParamsSchema,
  debugBookQuerySchema,
} from "../validation/recommend.schemas";

const router = Router();

/**
 * GET /api/recommend/debug/book/:bookId
 * Debug endpoint to inspect TF-IDF + Cosine Similarity results
 * 
 * Query params:
 * - limit: 1-50 (default: 10) - number of similar books to return
 * - terms: 5-50 (default: 20) - number of top terms to return
 * 
 * SAFETY: Only enabled in non-production environments
 * If NODE_ENV === "production", returns 404
 */
router.get(
  "/book/:bookId",
  validateParams(bookIdParamsSchema),
  validateQuery(debugBookQuerySchema),
  getBookDebugInfo
);

export default router;