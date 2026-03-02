import { Request, Response } from "express";
import { query } from "../db";

/**
 * GET /api/favorites/me
 * ดูรายการหนังสือที่ user คนนี้กด Favorite ไว้
 */
export const getMyFavorites = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const result = await query(
      `
      SELECT 
        b.id,
        b.title,
        b.author,
        b.description,
        b.publisher,
        b.cover_image,
        f.created_at AS favorited_at
      FROM favorites f
      JOIN books b ON f.book_id = b.id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC
      `,
      [userId]
    );

    // Normalize id to ensure it's always a number
    const items = result.rows.map((row: any) => ({
      ...row,
      id: Number(row.id), // Ensure id is always a number
    }));

    return res.json({
      total: result.rowCount,
      items,
    });
  } catch (err) {
    console.error("getMyFavorites error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/favorites/:bookId
 * กด Favorite หนังสือ 1 เล่ม
 */
export const addFavorite = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const bookId = Number(req.params.bookId);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    if (Number.isNaN(bookId)) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    // เช็คว่าหนังสือมีอยู่จริงไหม
    const bookResult = await query("SELECT id FROM books WHERE id = $1", [
      bookId,
    ]);
    if (bookResult.rowCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    // เพิ่ม favorite (ถ้ามีอยู่แล้วจะไม่ซ้ำเพราะ UNIQUE)
    await query(
      `
      INSERT INTO favorites (user_id, book_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, book_id) DO NOTHING
      `,
      [userId, bookId]
    );

    return res.status(201).json({
      message: "Add favorite success",
    });
  } catch (err) {
    console.error("addFavorite error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * DELETE /api/favorites/:bookId
 * เอา Favorite ออก
 */
export const removeFavorite = async (req: Request, res: Response) => {
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
      DELETE FROM favorites
      WHERE user_id = $1 AND book_id = $2
      `,
      [userId, bookId]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "Favorite not found for this user/book" });
    }

    return res.json({ message: "Remove favorite success" });
  } catch (err) {
    console.error("removeFavorite error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
