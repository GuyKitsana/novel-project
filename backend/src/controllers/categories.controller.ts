import { Request, Response } from "express";
import { query } from "../db";
import { createAdminActivity } from "../utils/adminActivity";

/**
 * GET /api/categories
 * - Public endpoint
 * - ใช้ดึงรายการหมวดหมู่ทั้งหมด
 */
export const getCategories = async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `
      SELECT
        id,
        name,
        code
      FROM categories
      ORDER BY id ASC
      `
    );

    return res.json(result.rows);
  } catch (error) {
    console.error("getCategories error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/admin/categories
 * - Admin only
 * - สร้างหมวดหมู่ใหม่
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ (ต้องมี name และ code)" });
    }

    // Check if code already exists
    const existingResult = await query(
      `SELECT id FROM categories WHERE code = $1`,
      [code.trim()]
    );

    if ((existingResult.rowCount ?? 0) > 0) {
      return res.status(400).json({ message: "รหัสหมวดหมู่นี้มีอยู่แล้ว" });
    }

    // Insert new category
    const result = await query(
      `
      INSERT INTO categories (name, code)
      VALUES ($1, $2)
      RETURNING id, name, code
      `,
      [name.trim(), code.trim()]
    );

    const newCategory = result.rows[0];

    // Log activity
    await createAdminActivity({
      type: "category",
      action: "create",
      description: `เพิ่มหมวดหมู่ "${newCategory.name}"`,
      ref_id: newCategory.id,
    });

    return res.status(201).json(newCategory);
  } catch (error) {
    console.error("createCategory error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * PUT /api/admin/categories/:id
 * - Admin only
 * - แก้ไขหมวดหมู่
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ (ต้องมี name และ code)" });
    }

    const categoryId = Number(id);
    if (Number.isNaN(categoryId)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    // Check if category exists
    const existingResult = await query(
      `SELECT id FROM categories WHERE id = $1`,
      [categoryId]
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({ message: "ไม่พบหมวดหมู่นี้" });
    }

    // Check if code already exists (excluding current category)
    const codeCheckResult = await query(
      `SELECT id FROM categories WHERE code = $1 AND id != $2`,
      [code.trim(), categoryId]
    );

    if ((codeCheckResult.rowCount ?? 0) > 0) {
      return res.status(400).json({ message: "รหัสหมวดหมู่นี้มีอยู่แล้ว" });
    }

    // Update category
    const result = await query(
      `
      UPDATE categories
      SET name = $1, code = $2
      WHERE id = $3
      RETURNING id, name, code
      `,
      [name.trim(), code.trim(), categoryId]
    );

    const updatedCategory = result.rows[0];

    // Log activity
    await createAdminActivity({
      type: "category",
      action: "update",
      description: `แก้ไขหมวดหมู่ "${updatedCategory.name}"`,
      ref_id: updatedCategory.id,
    });

    return res.json(updatedCategory);
  } catch (error) {
    console.error("updateCategory error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * DELETE /api/admin/categories/:id
 * - Admin only
 * - ลบหมวดหมู่
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const categoryId = Number(id);

    if (Number.isNaN(categoryId)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    // Check if category exists and get name for activity log
    const existingResult = await query(
      `SELECT id, name FROM categories WHERE id = $1`,
      [categoryId]
    );

    if (existingResult.rowCount === 0) {
      return res.status(404).json({ message: "ไม่พบหมวดหมู่นี้" });
    }

    const categoryName = existingResult.rows[0].name;

    // Check if category is used in book_categories
    const usageCheck = await query(
      `SELECT COUNT(*)::int AS count FROM book_categories WHERE category_id = $1`,
      [categoryId]
    );

    const usageCount = usageCheck.rows[0]?.count || 0;
    if (usageCount > 0) {
      return res.status(400).json({
        message: `ไม่สามารถลบหมวดหมู่นี้ได้ เนื่องจากถูกใช้งานในหนังสือ ${usageCount} เล่ม`,
      });
    }

    // Delete category
    await query(`DELETE FROM categories WHERE id = $1`, [categoryId]);

    // Log activity
    await createAdminActivity({
      type: "category",
      action: "delete",
      description: `ลบหมวดหมู่ "${categoryName}"`,
      ref_id: categoryId,
    });

    return res.json({ message: "ลบหมวดหมู่สำเร็จ" });
  } catch (error) {
    console.error("deleteCategory error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


