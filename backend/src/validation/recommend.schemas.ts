import { z } from "zod";

/**
 * Schema for GET /api/recommend/me query params
 */
export const recommendMeQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 20;
      const num = Number(val);
      return Math.max(1, Math.min(50, Math.floor(num))); // Clamp between 1 and 50
    }),
  behaviorRatio: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 0.7;
      const num = Number(val);
      return Math.max(0, Math.min(1, num)); // Clamp between 0 and 1
    }),
});

/**
 * Schema for GET /api/recommend/similar/:bookId query params
 */
export const similarBooksQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 10;
      const num = Number(val);
      return Math.max(1, Math.min(50, Math.floor(num))); // Clamp between 1 and 50
    }),
});

/**
 * Schema for bookId param
 */
export const bookIdParamsSchema = z.object({
  bookId: z
    .string()
    .regex(/^\d+$/, "book id must be a positive integer")
    .transform((val) => parseInt(val, 10)),
});

/**
 * Schema for GET /api/recommend/debug/book/:bookId query params
 */
export const debugBookQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 10;
      const num = Number(val);
      return Math.max(1, Math.min(50, Math.floor(num))); // Clamp between 1 and 50
    }),
  terms: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 20;
      const num = Number(val);
      return Math.max(5, Math.min(50, Math.floor(num))); // Clamp between 5 and 50
    }),
});