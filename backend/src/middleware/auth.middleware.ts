import { Request, Response, NextFunction } from "express";
import * as jwt from "jsonwebtoken";

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  // Validate JWT_SECRET exists before using it
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    console.error("JWT_SECRET is not set in environment variables");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      id: number;
      role?: string;
      email?: string;
    };

    // ⭐ เก็บ user ไว้ใน req.user
    req.user = payload;

    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const adminOnly = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: admin only" });
  }
  next();
};
