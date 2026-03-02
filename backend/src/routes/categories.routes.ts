import { Router } from "express";
import { getCategories } from "../controllers/categories.controller";

const router = Router();

// Public: GET /api/categories
router.get("/", getCategories);

export default router;


