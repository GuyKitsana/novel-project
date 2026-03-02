import { Request, Response } from "express";
import { query } from "../db";

/**
 * GET /api/onboarding/me
 * เช็กว่าผู้ใช้เคยเลือกหมวดหรือยัง
 */
export const getOnboardingStatus = async (
  req: Request,
  res: Response
) => {
  const userId = req.user!.id;

  const result = await query(
    `
    SELECT COUNT(*) AS category_count
    FROM user_categories
    WHERE user_id = $1
    `,
    [userId]
  );

  res.json({
    category_count: Number(result.rows[0].category_count),
  });
};

/**
 * PUT /api/onboarding/categories
 * บันทึกหมวดที่ผู้ใช้เลือก
 */
export const saveCategories = async (
  req: Request,
  res: Response
) => {
  const userId = req.user!.id;
  // req.body is already validated by Zod schema
  const { favoriteCategories } = req.body; // ['fantasy','romance'] - already validated as non-empty array

  // ลบของเดิม
  await query(
    "DELETE FROM user_categories WHERE user_id = $1",
    [userId]
  );

  // เพิ่มของใหม่
  for (const code of favoriteCategories) {
    const result = await query(
      "SELECT id FROM categories WHERE code = $1",
      [code]
    );

    if (result.rows.length > 0) {
      await query(
        "INSERT INTO user_categories (user_id, category_id) VALUES ($1, $2)",
        [userId, result.rows[0].id]
      );
    }
  }

  res.json({ message: "Onboarding completed" });
};

/**
 * GET /api/onboarding/categories
 * ดึงหมวดที่ผู้ใช้เลือก (category codes)
 */
export const getUserCategories = async (
  req: Request,
  res: Response
) => {
  const userId = req.user!.id;

  const result = await query(
    `
    SELECT c.code
    FROM user_categories uc
    JOIN categories c ON uc.category_id = c.id
    WHERE uc.user_id = $1
    ORDER BY c.code ASC
    `,
    [userId]
  );

  res.json({
    categories: result.rows.map((row) => row.code),
  });
};