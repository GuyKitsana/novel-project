import { Request, Response } from "express";
import {
  getPersonalizedRecommendations,
  getSimilarBooks,
} from "../services/recommend.service";
import { query } from "../db";

/**
 * GET /api/recommend/me
 * Get personalized recommendations for the authenticated user
 * 
 * Implements 3-stage priority logic:
 * - Stage 1: Category-based (cold start)
 * - Stage 2: Controlled random (fill remaining)
 * - Stage 3: Behavior-based (TF-IDF + Cosine Similarity)
 * 
 * Hybrid mix: 70% behavior-based + 30% discovery (when user has behavior)
 */
export const getRecommendationsForMe = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const limit = Number(req.query.limit) || 20;
    const behaviorRatio = Number(req.query.behaviorRatio) || 0.7;

    // DEBUG: Always log request parameters
    console.log("[RECOMMEND DEBUG] Request params:", {
      userId,
      limit,
      behaviorRatio,
    });

    const recommendations = await getPersonalizedRecommendations(
      userId,
      Math.max(1, Math.min(50, limit)),
      Math.max(0, Math.min(1, behaviorRatio))
    );

    // Ensure we always return an array (defensive check)
    const items = Array.isArray(recommendations) ? recommendations : [];
    
    // DEBUG: Always log response
    console.log("[RECOMMEND DEBUG] Controller response:", {
      userId,
      itemsCount: items.length,
      firstBookId: items[0]?.id || null,
      allBookIds: items.map((item: any) => item.id),
    });
    
    return res.json({ items });
  } catch (err: any) {
    console.error("[getRecommendationsForMe] Error:", err);
    // Always log stack trace for debugging
    if (err instanceof Error) {
      console.error("[getRecommendationsForMe] Stack trace:", err.stack);
    }
    if (err?.message) {
      console.error("[getRecommendationsForMe] Error message:", err.message);
    }
    if (err?.code) {
      console.error("[getRecommendationsForMe] Error code:", err.code);
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/recommend/similar/:bookId
 * Get books similar to a given book using TF-IDF + Cosine Similarity
 * 
 * Public endpoint (no auth required, but can use user context if available)
 */
export const getSimilarBooksToBook = async (req: Request, res: Response) => {
  try {
    const bookId = Number(req.params.bookId);
    if (Number.isNaN(bookId) || bookId <= 0) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    // Verify book exists
    const bookCheck = await query("SELECT id FROM books WHERE id = $1", [
      bookId,
    ]);
    if (bookCheck.rowCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    const limit = Number(req.query.limit) || 10;
    const similarBooks = await getSimilarBooks(
      bookId,
      Math.max(1, Math.min(50, limit))
    );

    return res.json({ items: similarBooks });
  } catch (err: any) {
    console.error("[getSimilarBooksToBook] Error:", err);
    if (process.env.NODE_ENV === "development") {
      console.error("[getSimilarBooksToBook] Error details:", err.message, err.stack);
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/recommend/track-view/:bookId
 * Track that a user viewed a book (optional feature)
 * 
 * Requires authentication
 */
export const trackBookView = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (Number.isNaN(bookId) || bookId <= 0) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    // Verify book exists
    const bookCheck = await query("SELECT id FROM books WHERE id = $1", [
      bookId,
    ]);
    if (bookCheck.rowCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Upsert view tracking (increment count if exists, create if not)
    try {
      await query(
        `
        INSERT INTO user_book_views (user_id, book_id, views_count, last_viewed_at)
        VALUES ($1, $2, 1, NOW())
        ON CONFLICT (user_id, book_id) 
        DO UPDATE SET 
          views_count = user_book_views.views_count + 1,
          last_viewed_at = NOW()
        `,
        [userId, bookId]
      );
    } catch (viewErr: any) {
      // If table doesn't exist, silently fail (it's an optional feature)
      if (viewErr.message?.includes("does not exist") || viewErr.code === "42P01") {
        // Table doesn't exist, skip tracking
        return res.json({ message: "View tracked (table not available)" });
      }
      throw viewErr;
    }

    return res.json({ message: "View tracked" });
  } catch (err: any) {
    console.error("[trackBookView] Error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
