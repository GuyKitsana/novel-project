import { Request, Response } from "express";
import { query } from "../db";

/**
 * GET /api/admin/activities
 * Returns recent admin activities
 */
export const getActivities = async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5, 50); // Max 50

    const result = await query(
      `
      SELECT 
        id,
        type,
        action,
        description,
        ref_id,
        created_at
      FROM admin_activities
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("getActivities error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/admin/dashboard
 * Returns dashboard stats and recent activities
 */
export const getDashboard = async (_req: Request, res: Response) => {
  try {
    // ===== STATS: Count queries =====
    const booksCountResult = await query(`SELECT COUNT(*)::int AS count FROM books`);
    const categoriesCountResult = await query(`SELECT COUNT(*)::int AS count FROM categories`);
    const usersCountResult = await query(`SELECT COUNT(*)::int AS count FROM users`);
    const reviewsCountResult = await query(`SELECT COUNT(*)::int AS count FROM reviews`);

    const stats = {
      totalBooks: booksCountResult.rows[0]?.count || 0,
      totalCategories: categoriesCountResult.rows[0]?.count || 0,
      totalUsers: usersCountResult.rows[0]?.count || 0,
      totalReviews: reviewsCountResult.rows[0]?.count || 0,
    };

    return res.json({
      stats,
    });
  } catch (error) {
    console.error("getDashboard error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

