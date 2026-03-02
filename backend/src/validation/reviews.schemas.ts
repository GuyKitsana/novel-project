import { z } from "zod";

/**
 * Schema for POST /api/reviews/:bookId
 */
export const createReviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, "rating must be between 1 and 5")
    .max(5, "rating must be between 1 and 5"),
  comment: z
    .string()
    .max(5000, "comment must be less than 5000 characters")
    .optional()
    .nullable(),
});

/**
 * Schema for review bookId params
 */
export const reviewBookIdParamsSchema = z.object({
  bookId: z
    .string()
    .regex(/^\d+$/, "book id must be a positive integer")
    .transform((val) => parseInt(val, 10)),
});

/**
 * Schema for review ID params
 */
export const reviewIdParamsSchema = z.object({
  reviewId: z
    .string()
    .regex(/^\d+$/, "review id must be a positive integer")
    .transform((val) => parseInt(val, 10)),
});

