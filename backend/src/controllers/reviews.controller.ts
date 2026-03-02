import { Request, Response } from "express";
import { query } from "../db";
import { createAdminActivity } from "../utils/adminActivity";

/**
 * POST /api/reviews/:bookId
 * - เพิ่มหรือแก้ไขรีวิวของ user สำหรับหนังสือ 1 เล่ม
 * - ถ้าเคยรีวิวแล้วจะ update แทน (ใช้ UNIQUE(user_id, book_id))
 */
export const createOrUpdateReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    // req.params.bookId is already validated and transformed to number by Zod
    const bookId = req.params.bookId;
    // req.body is already validated by Zod schema
    const { rating, comment } = req.body;
    const numericRating = rating; // Already validated as number 1-5 by Zod

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // เช็คว่าหนังสือมีอยู่จริงไหม
    const bookResult = await query("SELECT id FROM books WHERE id = $1", [
      bookId,
    ]);
    if (bookResult.rowCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    // INSERT หรือ UPDATE รีวิว (upsert)
    const result = await query(
      `
      INSERT INTO reviews (user_id, book_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, book_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        updated_at = NOW()
      RETURNING id, user_id, book_id, rating, comment, created_at, updated_at;
      `,
      [userId, bookId, numericRating, comment ?? null]
    );

    const review = result.rows[0];

    return res.status(201).json({
      message: "Review saved",
      review,
    });
  } catch (err) {
    console.error("createOrUpdateReview error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/reviews/book/:bookId
 * - ดูรีวิวทั้งหมดของหนังสือเล่มหนึ่ง
 */
export const getReviewsByBookId = async (req: Request, res: Response) => {
  try {
    const bookId = Number(req.params.bookId);

    if (Number.isNaN(bookId)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const result = await query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        r.updated_at,
        u.id AS user_id,
        u.username
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.book_id = $1
      ORDER BY r.created_at DESC;
      `,
      [bookId]
    );

    return res.json({
      total: result.rowCount,
      items: result.rows,
    });
  } catch (err) {
    console.error("getReviewsByBookId error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/reviews/me
 * - ดูรีวิวทั้งหมดที่ user คนนี้เคยเขียน
 */
export const getMyReviews = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        r.updated_at,
        b.id AS book_id,
        b.title,
        b.author
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC;
      `,
      [userId]
    );

    return res.json({
      total: result.rowCount,
      items: result.rows,
    });
  } catch (err) {
    console.error("getMyReviews error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/reviews/me/:bookId
 * - ดูรีวิวของ user คนนี้สำหรับหนังสือเล่มหนึ่ง
 */
export const getMyReviewByBookId = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (Number.isNaN(bookId)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    const result = await query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        r.updated_at,
        b.id AS book_id,
        b.title
      FROM reviews r
      JOIN books b ON r.book_id = b.id
      WHERE r.user_id = $1 AND r.book_id = $2
      `,
      [userId, bookId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error("getMyReviewByBookId error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * DELETE /api/reviews/:reviewId
 * - ลบรีวิว
 * - owner ลบเองได้
 * - admin ลบของใครก็ได้
 */
export const deleteReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    // req.params.reviewId is already validated and transformed to number by Zod
    const reviewId = req.params.reviewId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // ดึงรีวิวก่อนเพื่อตรวจสิทธิ์
    const reviewResult = await query(
      "SELECT id, user_id FROM reviews WHERE id = $1",
      [reviewId]
    );

    if (reviewResult.rowCount === 0) {
      return res.status(404).json({ message: "Review not found" });
    }

    const review = reviewResult.rows[0];

    // เช็คสิทธิ์: เจ้าของหรือ admin เท่านั้น
    if (review.user_id !== userId && role !== "admin") {
      return res
        .status(403)
        .json({ message: "Forbidden: cannot delete this review" });
    }

    // Fetch review details for activity log (only if admin)
    let bookTitle = "";
    let username = "";
    if (role === "admin") {
      const reviewDetailResult = await query(
        `
        SELECT b.title, u.username
        FROM reviews r
        JOIN books b ON r.book_id = b.id
        JOIN users u ON r.user_id = u.id
        WHERE r.id = $1
        `,
        [reviewId]
      );
      if ((reviewDetailResult.rowCount ?? 0) > 0) {
        bookTitle = reviewDetailResult.rows[0].title || "หนังสือ";
        username = reviewDetailResult.rows[0].username || "ผู้ใช้";
      }
    }

    await query("DELETE FROM reviews WHERE id = $1", [reviewId]);

    // Log activity (only for admin deletions)
    if (role === "admin") {
      await createAdminActivity({
        type: "review",
        action: "delete",
        description: `ลบรีวิวหนังสือ: ${bookTitle} โดย ${username}`,
        ref_id: Number(reviewId),
      });
    }

    return res.json({ message: "Delete review success" });
  } catch (err) {
    console.error("deleteReview error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/admin/reviews
 * - Get all reviews for admin dashboard
 * - Admin only
 * - Returns reviews with book_title and username
 */
export const getAllReviews = async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.username,
        b.title AS book_title
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN books b ON r.book_id = b.id
      ORDER BY r.created_at DESC
      `,
      []
    );

    return res.json({
      items: result.rows,
    });
  } catch (err) {
    console.error("getAllReviews error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
