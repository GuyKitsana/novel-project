import { z } from "zod";

/**
 * Schema for POST /api/books (create book)
 * Note: cover file is handled by multer middleware, not in body
 */
export const createBookSchema = z.object({
  title: z
    .string()
    .min(1, "title is required")
    .max(500, "title must be less than 500 characters"),
  author: z
    .string()
    .max(255, "author must be less than 255 characters")
    .optional()
    .nullable(),
  publisher: z
    .string()
    .max(255, "publisher must be less than 255 characters")
    .optional()
    .nullable(),
  description: z
    .string()
    .max(5000, "description must be less than 5000 characters")
    .optional()
    .nullable(),
  description_tfidf: z
    .string()
    .max(5000, "description_tfidf must be less than 5000 characters")
    .optional()
    .nullable(),
  buy_link: z
    .string()
    .url("buy_link must be a valid URL")
    .max(1000, "buy_link must be less than 1000 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  categoryIds: z
    .union([
      z.string(), // JSON string from FormData
      z.array(z.number().int().positive()),
    ])
    .transform((val) => {
      // Handle JSON string from FormData
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [];
        }
      }
      return val;
    })
    .pipe(
      z
        .array(z.number().int().positive())
        .min(1, "at least one category is required")
    ),
});

/**
 * Schema for PUT /api/books/:id (update book)
 * Note: cover file is handled by multer middleware, not in body
 */
export const updateBookSchema = z.object({
  title: z
    .string()
    .min(1, "title is required")
    .max(500, "title must be less than 500 characters"),
  author: z
    .string()
    .max(255, "author must be less than 255 characters")
    .optional()
    .nullable(),
  publisher: z
    .string()
    .max(255, "publisher must be less than 255 characters")
    .optional()
    .nullable(),
  description: z
    .string()
    .max(5000, "description must be less than 5000 characters")
    .optional()
    .nullable(),
  description_tfidf: z
    .string()
    .max(5000, "description_tfidf must be less than 5000 characters")
    .optional()
    .nullable(),
  series_title: z
    .string()
    .max(500, "series_title must be less than 500 characters")
    .optional()
    .nullable(),
  volume_no: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val === null || val === undefined || val === "") return undefined;
      const num = typeof val === "string" ? parseInt(val, 10) : Number(val);
      return Number.isNaN(num) ? undefined : num;
    }),
  buy_link: z
    .string()
    .url("buy_link must be a valid URL")
    .max(1000, "buy_link must be less than 1000 characters")
    .optional()
    .nullable()
    .or(z.literal("")),
  categoryIds: z
    .union([
      z.string(), // JSON string from FormData
      z.array(z.number().int().positive()),
    ])
    .transform((val) => {
      // Handle JSON string from FormData
      if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [];
        }
      }
      return val;
    })
    .pipe(
      z
        .array(z.number().int().positive())
        .min(1, "at least one category is required")
    ),
});

/**
 * Schema for book ID params
 */
export const bookIdParamsSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "book id must be a positive integer")
    .transform((val) => parseInt(val, 10)),
});

