import { z } from "zod";

/**
 * Schema for POST /api/auth/register
 */
export const registerSchema = z.object({
  username: z
    .string()
    .min(1, "username is required")
    .max(100, "username must be less than 100 characters"),
  email: z
    .string()
    .min(1, "email is required")
    .email("invalid email format")
    .max(255, "email must be less than 255 characters"),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .max(255, "password must be less than 255 characters"),
});

/**
 * Schema for POST /api/auth/login
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "email is required")
    .email("invalid email format"),
  password: z.string().min(1, "password is required"),
});

/**
 * Schema for PATCH /api/auth/me
 */
export const updateMeSchema = z.object({
  username: z.string().min(3, "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร").max(30, "ชื่อผู้ใช้ต้องไม่เกิน 30 ตัวอักษร").trim().optional(),
  email: z.string().email("รูปแบบอีเมลไม่ถูกต้อง").optional(),
}).refine(data => data.username !== undefined || data.email !== undefined, {
  message: "ต้องระบุ username หรือ email อย่างน้อย 1 ฟิลด์",
});

