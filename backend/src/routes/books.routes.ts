import { Router, Request, Response, NextFunction } from "express";
import {
  getBooks,
  getBookById,
  getPopularBooks,
  getAuthors,
  getPublishers,
  createBook,
  updateBook,
  deleteBook,
} from "../controllers/books.controller";
import { authMiddleware, adminOnly } from "../middleware/auth.middleware";
import { uploadBookCover } from "../middleware/upload";
import { validateBody, validateParams } from "../middleware/validate";
import { createBookSchema, updateBookSchema, bookIdParamsSchema } from "../validation/books.schemas";

const router = Router();

/**
 * Middleware to validate that :id parameter is numeric only
 * Prevents non-numeric strings (like "popular") from matching the :id route
 */
const requireNumericId = (req: Request, res: Response, next: NextFunction) => {
  const id = req.params.id;
  
  // Check if id is a string containing only digits
  if (!id || !/^\d+$/.test(id)) {
    if (process.env.NODE_ENV === "development") {
      console.log("[requireNumericId] Invalid id parameter:", id);
    }
    return res.status(400).json({ message: "Invalid book id" });
  }
  
  next();
};

// Public routes - Static routes MUST come before dynamic routes
router.get("/", getBooks);
router.get("/popular", getPopularBooks);
router.get("/authors", getAuthors);
router.get("/publishers", getPublishers);

// Dynamic route - MUST be last to avoid conflicts with static routes
// Middleware ensures only numeric IDs are accepted
router.get("/:id", requireNumericId, getBookById);

// Admin only + upload
router.post(
  "/",
  authMiddleware,
  adminOnly,
  uploadBookCover.single("cover"),
  validateBody(createBookSchema),
  createBook
);

router.put(
  "/:id",
  authMiddleware,
  adminOnly,
  validateParams(bookIdParamsSchema),
  uploadBookCover.single("cover"),
  validateBody(updateBookSchema),
  updateBook
);

router.delete("/:id", authMiddleware, adminOnly, validateParams(bookIdParamsSchema), deleteBook);

export default router;
