import { Router } from "express";
import { authMiddleware, adminOnly } from "../middleware/auth.middleware";
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/admin.controller";
import { getDashboard, getActivities } from "../controllers/adminDashboard.controller";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/categories.controller";
import { getAllReviews } from "../controllers/reviews.controller";

const router = Router();

router.get("/dashboard", authMiddleware, adminOnly, getDashboard);
router.get("/activities", authMiddleware, adminOnly, getActivities);
router.get("/users", authMiddleware, adminOnly, getAllUsers);
router.post("/users", authMiddleware, adminOnly, createUser);
router.put("/users/:id", authMiddleware, adminOnly, updateUser);
router.delete("/users/:id", authMiddleware, adminOnly, deleteUser);

// Category admin routes
router.post("/categories", authMiddleware, adminOnly, createCategory);
router.put("/categories/:id", authMiddleware, adminOnly, updateCategory);
router.delete("/categories/:id", authMiddleware, adminOnly, deleteCategory);

// Reviews admin routes
router.get("/reviews", authMiddleware, adminOnly, getAllReviews);

export default router;
