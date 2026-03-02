import { Router } from "express";
import {
  getMyFavorites,
  addFavorite,
  removeFavorite,
} from "../controllers/favorites.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/me", authMiddleware, getMyFavorites);
router.post("/:bookId", authMiddleware, addFavorite);
router.delete("/:bookId", authMiddleware, removeFavorite);

export default router; 
