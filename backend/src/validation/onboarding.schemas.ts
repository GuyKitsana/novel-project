import { z } from "zod";

/**
 * Schema for PUT /api/onboarding/categories
 */
export const saveCategoriesSchema = z.object({
  favoriteCategories: z
    .array(z.string().min(1, "category code cannot be empty"))
    .min(1, "กรุณาเลือกอย่างน้อย 1 หมวด")
    .max(4, "เลือกได้ไม่เกิน 4 หมวด"),
});

