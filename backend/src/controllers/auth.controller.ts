import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import * as path from "path";
import { query } from "../db";
import { cleanupUploadsFile } from "../utils/fileCleanup";

/**
 * POST /api/auth/login
 */
export const login = async (req: Request, res: Response) => {
  try {
    // req.body is already validated by Zod schema
    const { email, password } = req.body;

    // หา user
    let result;
    try {
      result = await query(
        "SELECT id, username, email, password_hash, role FROM users WHERE email = $1",
        [email]
      );
    } catch (dbErr) {
      console.error("Database error in login:", dbErr);
      return res.status(500).json({ message: "Internal server error" });
    }

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Validate password_hash exists
    if (!user.password_hash) {
      console.error("User found but password_hash is missing for user:", user.id);
      return res.status(500).json({ message: "Internal server error" });
    }

    // เช็ครหัสผ่าน
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password_hash);
    } catch (bcryptErr) {
      console.error("Bcrypt compare error:", bcryptErr);
      return res.status(500).json({ message: "Internal server error" });
    }

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Check JWT_SECRET
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error("JWT_SECRET is not set");
      return res.status(500).json({ message: "Server config error" });
    }

    // นับจำนวนหมวดที่ผู้ใช้เลือก
    let categoryCount = 0;
    try {
      const countRes = await query(
        "SELECT COUNT(*) AS category_count FROM user_categories WHERE user_id = $1",
        [user.id]
      );
      categoryCount = Number(countRes.rows[0]?.category_count || 0);
    } catch (countErr) {
      console.warn("Failed to count user categories:", countErr);
      // Continue with categoryCount = 0
    }

    // Get avatar if exists (use avatar column)
    let avatarUrl = null;
    try {
      const avatarResult = await query(
        "SELECT avatar FROM users WHERE id = $1",
        [user.id]
      );
      
      if (avatarResult.rows[0]?.avatar) {
        const avatarPath = avatarResult.rows[0].avatar;
        // Normalize to /avatars/<filename> format
        if (avatarPath.startsWith("/avatars/")) {
          avatarUrl = avatarPath;
        } else if (avatarPath.startsWith("/uploads/avatars/")) {
          avatarUrl = avatarPath.replace("/uploads/avatars/", "/avatars/");
        } else {
          avatarUrl = `/avatars/${path.basename(avatarPath)}`;
        }
      }
    } catch (avatarErr) {
      console.warn("Failed to fetch avatar:", avatarErr);
      // Continue with avatarUrl = null
    }

    // สร้าง token
    let token: string;
    try {
      token = jwt.sign(
        { id: user.id, role: user.role, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
    } catch (jwtErr) {
      console.error("JWT signing error:", jwtErr);
      return res.status(500).json({ message: "Internal server error" });
    }

    // Normalize avatar path to /avatars/<filename> format
    let normalizedAvatar: string | null = null;
    if (avatarUrl) {
      // If stored as /uploads/avatars/xxx, normalize to /avatars/xxx
      if (avatarUrl.startsWith("/uploads/avatars/")) {
        normalizedAvatar = avatarUrl.replace("/uploads/avatars/", "/avatars/");
      } else if (avatarUrl.startsWith("/avatars/")) {
        normalizedAvatar = avatarUrl;
      } else {
        normalizedAvatar = avatarUrl;
      }
    }

    return res.json({
      message: "Login success",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        category_count: categoryCount, // ⭐ ใช้ตัดสิน onboarding
        avatar: normalizedAvatar, // Return avatar (not avatar_url) for consistency
      },
    });
  } catch (err) {
    console.error("Login error (unexpected):", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/auth/me
 * Get current user profile from JWT token
 */
export const getMe = async (req: Request, res: Response) => {
  try {
    // req.user is set by authMiddleware
    const userId = req.user!.id;

    // Fetch user with avatar column
    const result = await query(
      "SELECT id, username, email, role, avatar FROM users WHERE id = $1",
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    // Count categories for onboarding status
    let categoryCount = 0;
    try {
      const countRes = await query(
        "SELECT COUNT(*) AS category_count FROM user_categories WHERE user_id = $1",
        [userId]
      );
      categoryCount = Number(countRes.rows[0]?.category_count || 0);
    } catch (countErr) {
      console.warn("Failed to count user categories:", countErr);
      // Continue with categoryCount = 0
    }

    // Normalize avatar path to /avatars/<filename> format
    let normalizedAvatar: string | null = null;
    if (user.avatar) {
      // If stored as /uploads/avatars/xxx, normalize to /avatars/xxx
      if (user.avatar.startsWith("/uploads/avatars/")) {
        normalizedAvatar = user.avatar.replace("/uploads/avatars/", "/avatars/");
      } else if (user.avatar.startsWith("/avatars/")) {
        normalizedAvatar = user.avatar;
      } else if (user.avatar.includes("/")) {
        // If it has a path but not the expected format, try to extract filename
        normalizedAvatar = `/avatars/${path.basename(user.avatar)}`;
      } else {
        // If it's just a filename, prepend /avatars/
        normalizedAvatar = `/avatars/${user.avatar}`;
      }
    }

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      category_count: categoryCount,
      avatar: normalizedAvatar, // Always return avatar (not avatar_url) for consistency
    });
  } catch (err: any) {
    console.error("getMe error:", err);
    console.error("Error stack:", err.stack);
    return res.status(500).json({ 
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * POST /api/auth/me/avatar
 * Upload user avatar image
 */
export const uploadAvatar = async (req: Request, res: Response) => {
  // Defensive check: ensure user is authenticated
  if (!req.user || !req.user.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userId = req.user.id;
  const file = (req as any).file;

  // Validate file exists
  if (!file) {
    return res.status(400).json({ message: "Avatar file is required" });
  }

  console.log(`[uploadAvatar] User ${userId} uploading avatar: ${file.filename}`);

  // Store path as /avatars/<filename> to match static route
  const avatarPath = `/avatars/${file.filename}`;

  try {
    // Get old avatar before updating (for cleanup)
    let oldAvatarFilename: string | null = null;
    try {
      const oldUserResult = await query(
        "SELECT avatar FROM users WHERE id = $1",
        [userId]
      );
      oldAvatarFilename = oldUserResult.rows[0]?.avatar || null;
      if (oldAvatarFilename) {
        // Extract filename for cleanup
        oldAvatarFilename = path.basename(oldAvatarFilename);
      }
    } catch (err) {
      console.warn("[uploadAvatar] Failed to fetch old avatar:", err);
      // Continue anyway
    }

    console.log(`[uploadAvatar] Updating DB with avatar path: ${avatarPath}`);
    
    // Update user record with avatar column - CRITICAL: Check rowCount
    const updateResult = await query(
      "UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, email, role, avatar",
      [avatarPath, userId]
    );
    
    // If no rows updated, delete uploaded file and return error
    if (updateResult.rowCount !== 1) {
      console.error(`[uploadAvatar] UPDATE failed: rowCount = ${updateResult.rowCount}, expected 1`);
      // Clean up uploaded file
      try {
        await cleanupUploadsFile(`/avatars/${file.filename}`, "avatars");
        console.log(`[uploadAvatar] Cleaned up uploaded file due to DB update failure`);
      } catch (cleanupErr) {
        console.error("[uploadAvatar] Failed to cleanup uploaded file:", cleanupErr);
      }
      return res.status(404).json({ message: "User not found" });
    }
    
    console.log(`[uploadAvatar] DB updated successfully: rowCount = ${updateResult.rowCount}`);

    const user = updateResult.rows[0];
    console.log(`[uploadAvatar] Updated user avatar: ${user.avatar}`);
      
    // Delete old avatar file if it exists (after successful DB update)
    if (oldAvatarFilename) {
      try {
        await cleanupUploadsFile(`/avatars/${oldAvatarFilename}`, "avatars");
        console.log(`[uploadAvatar] Old avatar file cleaned up: ${oldAvatarFilename}`);
      } catch (cleanupErr) {
        // Log but don't fail the request if cleanup fails
        console.warn("[uploadAvatar] Failed to cleanup old avatar:", cleanupErr);
      }
    }

    // Return updated user from UPDATE RETURNING clause (no need for separate SELECT)
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: user.avatar, // Return avatar field (canonical)
      },
    });
  } catch (err: any) {
    console.error("[uploadAvatar] Error:", err);
    console.error("[uploadAvatar] Error details:", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });

    // Clean up uploaded file on any error
    try {
      await cleanupUploadsFile(`/avatars/${file.filename}`, "avatars");
      console.log(`[uploadAvatar] Cleaned up uploaded file due to error`);
    } catch (cleanupErr) {
      console.error("[uploadAvatar] Failed to cleanup uploaded file:", cleanupErr);
    }

    return res.status(500).json({ 
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err?.message : undefined,
    });
  }
};

/**
 * PUT /api/auth/me
 * Update current user profile (username, email)
 * Uses same pattern as admin updateUser but for current user
 */
export const updateMe = async (req: Request, res: Response) => {
  try {
    // Defensive check: ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.id;
    // req.body is already validated by Zod schema
    const { username, email } = req.body;

    // Fetch current user data before update (for comparison)
    const currentUserResult = await query(
      "SELECT id, username, email, role, avatar FROM users WHERE id = $1",
      [userId]
    );
    
    if (currentUserResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const currentUser = currentUserResult.rows[0];
    const currentUsername = currentUser.username;
    const currentEmail = currentUser.email;

    // Normalize avatar path if exists
    let normalizedAvatar: string | null = null;
    if (currentUser.avatar) {
      if (currentUser.avatar.startsWith("/uploads/avatars/")) {
        normalizedAvatar = currentUser.avatar.replace("/uploads/avatars/", "/avatars/");
      } else if (currentUser.avatar.startsWith("/avatars/")) {
        normalizedAvatar = currentUser.avatar;
      } else {
        normalizedAvatar = `/avatars/${path.basename(currentUser.avatar)}`;
      }
    }

    // Determine final values (use provided values or keep current)
    const finalUsername = username !== undefined ? username.trim() : currentUsername;
    const finalEmail = email !== undefined ? email.trim() : currentEmail;

    // Check if there are any changes
    const usernameChanged = username !== undefined && finalUsername !== currentUsername;
    const emailChanged = email !== undefined && finalEmail !== currentEmail;
    const hasChanges = usernameChanged || emailChanged;

    // If no changes, return current user without error (200 OK)
    if (!hasChanges) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[updateMe] No changes detected, returning current user`);
      }
      
      return res.status(200).json({
        message: "No changes to update",
        user: {
          id: currentUser.id,
          username: currentUser.username,
          email: currentUser.email,
          role: currentUser.role,
          avatar: normalizedAvatar,
        },
      });
    }

    // Validate username if provided
    if (usernameChanged) {
      if (!finalUsername) {
        return res.status(400).json({ message: "username cannot be empty" });
      }
      if (finalUsername.length < 3) {
        return res.status(400).json({ message: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" });
      }
      if (finalUsername.length > 30) {
        return res.status(400).json({ message: "ชื่อผู้ใช้ต้องไม่เกิน 30 ตัวอักษร" });
      }
    }

    // Validate email if provided
    if (emailChanged) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(finalEmail)) {
        return res.status(400).json({ message: "รูปแบบอีเมลไม่ถูกต้อง" });
      }

      // Check if new email already exists
      const emailCheck = await query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [finalEmail, userId]
      );
      if (emailCheck.rowCount && emailCheck.rowCount > 0) {
        return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
      }
    }

    // Build update query - update both fields (current values if unchanged)
    const updateQuery = `
      UPDATE users 
      SET username = $1, email = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, username, email, role, avatar
    `;

    if (process.env.NODE_ENV === "development") {
      console.log(`[updateMe] Executing update query with values: [username="${finalUsername}", email="${finalEmail}", userId=${userId}]`);
    }

    const result = await query(updateQuery, [finalUsername, finalEmail, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = result.rows[0];

    // Normalize avatar path to /avatars/<filename> format
    let normalizedAvatarResponse: string | null = null;
    if (user.avatar) {
      if (user.avatar.startsWith("/uploads/avatars/")) {
        normalizedAvatarResponse = user.avatar.replace("/uploads/avatars/", "/avatars/");
      } else if (user.avatar.startsWith("/avatars/")) {
        normalizedAvatarResponse = user.avatar;
      } else {
        normalizedAvatarResponse = `/avatars/${path.basename(user.avatar)}`;
      }
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[updateMe] Update successful - username: ${user.username}, email: ${user.email}, avatar: ${normalizedAvatarResponse || 'null'}`);
    }

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatar: normalizedAvatarResponse, // Return avatar (not avatar_url) for consistency
      },
    });
  } catch (err: any) {
    console.error("updateMe error:", err);
    if (err.code === "23505") {
      // PostgreSQL unique constraint violation
      return res.status(400).json({ message: "อีเมลหรือชื่อผู้ใช้นี้มีอยู่แล้ว" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/auth/register
 */
export const register = async (req: Request, res: Response) => {
  try {
    // req.body is already validated by Zod schema
    const { username, email, password } = req.body;

    // 2) เช็ค email ซ้ำ
    const existing = await query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
    }

    // 3) hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4) insert user (role = user)
    const insertResult = await query(
      `
      INSERT INTO users (username, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, role
      `,
      [username, email, hashedPassword, "user"]
    );

    const newUser = insertResult.rows[0];

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      console.error("JWT_SECRET is not set");
      return res.status(500).json({ message: "Server config error" });
    }

    // 5) สร้าง token
    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Get avatar if exists (use avatar column)
    let normalizedAvatar: string | null = null;
    try {
      const avatarResult = await query(
        "SELECT avatar FROM users WHERE id = $1",
        [newUser.id]
      );
      
      if (avatarResult.rows[0]?.avatar) {
        const avatarPath = avatarResult.rows[0].avatar;
        // Normalize to /avatars/<filename> format
        if (avatarPath.startsWith("/avatars/")) {
          normalizedAvatar = avatarPath;
        } else if (avatarPath.startsWith("/uploads/avatars/")) {
          normalizedAvatar = avatarPath.replace("/uploads/avatars/", "/avatars/");
        } else {
          normalizedAvatar = `/avatars/${path.basename(avatarPath)}`;
        }
      }
    } catch (avatarErr) {
      console.warn("Failed to fetch avatar:", avatarErr);
      // Continue with normalizedAvatar = null for new users
    }

    return res.status(201).json({
      message: "Register success",
      token,
      user: {
        ...newUser,
        category_count: 0, // ⭐ ผู้ใช้ใหม่ → ต้องเข้า onboarding
        avatar: normalizedAvatar, // Return avatar (not avatar_url) for consistency
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
