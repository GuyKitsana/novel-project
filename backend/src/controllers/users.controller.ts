import { Request, Response } from "express";
import * as path from "path";
import { query } from "../db";
import { cleanupUploadsFile } from "../utils/fileCleanup";

/**
 * Helper to build avatar URL from filename stored in DB
 */
// Removed buildAvatarUrl - not needed, return DB value directly like books.cover_image

/**
 * Helper to get user with avatar
 */
async function getUserWithAvatar(userId: number, req: Request) {
  // Select only columns that exist in users table
  const result = await query(
    "SELECT id, username, email, role, avatar FROM users WHERE id = $1",
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const user = result.rows[0];

  const avatarValue = user.avatar;
  
  console.log(`[getUserWithAvatar] User ${userId} - avatar from DB: ${avatarValue}`);
  
  // Return user object with avatar field
  // Backend stores "/avatars/<filename>", return it as-is for frontend to resolve
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    avatar: avatarValue || null, // Return DB value directly, null if not set
  };
}

/**
 * GET /api/users/me
 * Get current user profile
 */
export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    console.log(`[getMyProfile] Fetching profile for user ${userId}`);
    
    const user = await getUserWithAvatar(userId, req);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`[getMyProfile] Returning user profile:`, {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    });

    return res.json(user);
  } catch (err: any) {
    console.error("getMyProfile error:", err);
    console.error("Error stack:", err?.stack);
    return res.status(500).json({ 
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err?.message : undefined,
    });
  }
};

/**
 * PUT /api/users/me
 * Update current user profile
 * Accepts JSON body or multipart/form-data with optional:
 *   - username (text field)
 *   - email (text field)
 *   - avatar (file field - only in multipart/form-data)
 */
export const updateMyProfile = async (req: Request, res: Response) => {
  try {
    // Defensive check: ensure user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.id;
    
    if (process.env.NODE_ENV === "development") {
      console.log(`[updateMyProfile] Updating profile for user ${userId}`);
    }
    
    const file = (req as any).file;
    
    // Get username and email from body (can be form-data text field or JSON)
    // When using multipart/form-data, multer adds fields to req.body as strings
    // When using JSON, express.json() parses it normally
    if (process.env.NODE_ENV === "development") {
      console.log(`[updateMyProfile] Request Content-Type:`, req.headers["content-type"]);
      console.log(`[updateMyProfile] Request body keys:`, Object.keys(req.body || {}));
    }
    
    let username = req.body?.username;
    let email = req.body?.email;
    
    // Handle form-data string values (multer converts everything to strings)
    // Also handle undefined/null/empty strings
    if (username !== undefined && username !== null) {
      if (typeof username === 'string') {
        username = username.trim() || undefined;
      } else {
        username = String(username).trim() || undefined;
      }
    } else {
      username = undefined;
    }
    
    if (email !== undefined && email !== null) {
      if (typeof email === 'string') {
        email = email.trim() || undefined;
      } else {
        email = String(email).trim() || undefined;
      }
    } else {
      email = undefined;
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log(`[updateMyProfile] Incoming fields - username: ${username ? `"${username}"` : 'missing'}, email: ${email ? `"${email}"` : 'missing'}, file: ${file ? 'provided' : 'missing'}`);
    }

    // Handle avatar upload if file is provided
    if (file) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[updateMyProfile] Processing avatar upload: ${file.filename}`);
      }
      
      // Get old avatar before updating
      let oldAvatarFilename: string | null = null;
      try {
        const oldUserResult = await query(
          "SELECT avatar FROM users WHERE id = $1",
          [userId]
        );
        oldAvatarFilename = oldUserResult.rows[0]?.avatar || null;
        if (oldAvatarFilename) {
          if (process.env.NODE_ENV === "development") {
            console.log(`[updateMyProfile] Old avatar found: ${oldAvatarFilename}`);
          }
          // Extract filename for cleanup
          if (oldAvatarFilename.includes("/")) {
            oldAvatarFilename = path.basename(oldAvatarFilename);
          }
        }
      } catch (err) {
        console.warn("[updateMyProfile] Failed to fetch old avatar:", err);
      }

      // Save path to database - use "/avatars/filename" format (backend serves /avatars -> uploads/avatars)
      const avatarPath = `/avatars/${file.filename}`;
      
      if (process.env.NODE_ENV === "development") {
        console.log(`[updateMyProfile] Saving avatar path to DB: ${avatarPath}`);
      }
      
      // Update avatar column with RETURNING clause
      const updateResult = await query(
        "UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, email, role, avatar",
        [avatarPath, userId]
      );
      
      if (updateResult.rowCount !== 1) {
        // Clean up uploaded file on failure
        try {
          await cleanupUploadsFile(`/avatars/${file.filename}`, "avatars");
        } catch (cleanupErr) {
          console.error("[updateMyProfile] Failed to cleanup uploaded file:", cleanupErr);
        }
        return res.status(404).json({ message: "User not found" });
      }
      
      if (process.env.NODE_ENV === "development") {
        console.log(`[updateMyProfile] Avatar updated in DB: rowCount = ${updateResult.rowCount}`);
      }

      // Delete old avatar file if it exists (after successful DB update)
      if (oldAvatarFilename) {
        try {
          await cleanupUploadsFile(`/avatars/${oldAvatarFilename}`, "avatars");
          if (process.env.NODE_ENV === "development") {
            console.log(`[updateMyProfile] Old avatar file cleaned up: ${oldAvatarFilename}`);
          }
        } catch (cleanupErr) {
          console.warn("[updateMyProfile] Failed to cleanup old avatar:", cleanupErr);
        }
      }
    }

    // Fetch current user data for comparison (mirror admin pattern)
    const currentUserResult = await query(
      "SELECT username, email FROM users WHERE id = $1",
      [userId]
    );
    if (currentUserResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const currentUser = currentUserResult.rows[0];
    const currentUsername = currentUser.username;
    const currentEmail = currentUser.email;

    // Validate and process username if provided
    let finalUsername = currentUsername; // Default to current value
    if (username !== undefined && username !== null && username !== '') {
      const trimmedUsername = typeof username === 'string' ? username.trim() : String(username).trim();
      
      if (!trimmedUsername) {
        return res.status(400).json({ message: "username cannot be empty" });
      }

      // Validate username length
      if (trimmedUsername.length < 3) {
        return res.status(400).json({ message: "ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร" });
      }
      if (trimmedUsername.length > 30) {
        return res.status(400).json({ message: "ชื่อผู้ใช้ต้องไม่เกิน 30 ตัวอักษร" });
      }

      finalUsername = trimmedUsername;
      if (process.env.NODE_ENV === "development") {
        console.log(`[updateMyProfile] Username will be updated from "${currentUsername}" to "${finalUsername}"`);
      }
    }

    // Validate and process email if provided
    let finalEmail = currentEmail; // Default to current value
    if (email !== undefined && email !== null) {
      const trimmedEmail = typeof email === 'string' ? email.trim() : String(email).trim();
      
      // If email is provided but empty, keep current email (don't allow clearing email)
      if (!trimmedEmail) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[updateMyProfile] Email is empty, keeping current email: "${currentEmail}"`);
        }
        finalEmail = currentEmail;
      } else {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
          return res.status(400).json({ message: "รูปแบบอีเมลไม่ถูกต้อง" });
        }

        // Check if email is being changed and if new email already exists
        if (trimmedEmail !== currentEmail) {
          const emailCheck = await query(
            "SELECT id FROM users WHERE email = $1 AND id != $2",
            [trimmedEmail, userId]
          );
          if (emailCheck.rowCount && emailCheck.rowCount > 0) {
            if (process.env.NODE_ENV === "development") {
              console.log(`[updateMyProfile] Email already in use: ${trimmedEmail}`);
            }
            return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
          }
        }

        finalEmail = trimmedEmail;
        if (process.env.NODE_ENV === "development") {
          console.log(`[updateMyProfile] Email will be updated from "${currentEmail}" to "${finalEmail}"`);
        }
      }
    }

    // Check if there are any changes
    const usernameChanged = username !== undefined && finalUsername !== currentUsername;
    const emailChanged = email !== undefined && finalEmail !== currentEmail;
    const hasChanges = usernameChanged || emailChanged || file;
    
    // If no changes, return current user without error (200 OK)
    if (!hasChanges) {
      if (process.env.NODE_ENV === "development") {
        console.log(`[updateMyProfile] No changes detected, returning current user`);
      }
      
      // Fetch current user with avatar
      const currentUserResult = await query(
        "SELECT id, username, email, role, avatar FROM users WHERE id = $1",
        [userId]
      );
      
      if (currentUserResult.rowCount === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const currentUser = currentUserResult.rows[0];
      
      return res.status(200).json({
        message: "No changes to update",
        user: {
          id: currentUser.id,
          username: currentUser.username,
          email: currentUser.email,
          role: currentUser.role,
          avatar: currentUser.avatar || null,
        },
      });
    }

    // Execute update query - update username and email
    const updateQuery = `
      UPDATE users 
      SET username = $1, email = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, username, email, role, avatar
    `;
    
    if (process.env.NODE_ENV === "development") {
      console.log(`[updateMyProfile] Executing update query with values: [username="${finalUsername}", email="${finalEmail}", userId=${userId}]`);
    }
    
    try {
      const result = await query(updateQuery, [finalUsername, finalEmail, userId]);
      
      if (result.rowCount === 0) {
        console.error(`[updateMyProfile] User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }
      
      const user = result.rows[0];
      
      if (process.env.NODE_ENV === "development") {
        console.log(`[updateMyProfile] Update successful - username: ${user.username}, email: ${user.email}, avatar: ${user.avatar || 'null'}`);
      }

      return res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          avatar: user.avatar || null, // Canonical field only
        },
      });
    } catch (updateErr: any) {
      console.error(`[updateMyProfile] Update query failed:`, updateErr);
      throw updateErr; // Let outer catch handle it
    }
  } catch (err: any) {
    console.error("updateMyProfile error:", err);
    console.error("Error code:", err.code);
    console.error("Error message:", err.message);
    console.error("Error stack:", err?.stack);
    console.error("Error detail:", err.detail);
    
    // Handle PostgreSQL errors
    if (err.code === "23505") {
      // PostgreSQL unique constraint violation (duplicate email/username)
      // Check error detail to determine which field
      if (err.detail?.includes("email") || err.message?.toLowerCase().includes("email")) {
        return res.status(409).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
      } else if (err.detail?.includes("username") || err.message?.toLowerCase().includes("username")) {
        return res.status(409).json({ message: "ชื่อผู้ใช้นี้ถูกใช้งานแล้ว" });
      }
      return res.status(409).json({ message: "ชื่อผู้ใช้หรืออีเมลนี้มีอยู่แล้ว" });
    }
    
    // Handle other PostgreSQL errors
    if (err.code === "23503") {
      // Foreign key constraint violation
      return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
    }
    
    if (err.code === "23502") {
      // Not null constraint violation
      return res.status(400).json({ message: "ข้อมูลจำเป็นต้องกรอก" });
    }
    
    // Unknown error - return 500 with details in development
    return res.status(500).json({ 
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err?.message : undefined,
      code: process.env.NODE_ENV === "development" ? err?.code : undefined,
    });
  }
};

/**
 * POST /api/users/me/avatar
 * Upload user avatar image
 */
export const uploadMyAvatar = async (req: Request, res: Response) => {
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

  console.log(`[uploadMyAvatar] User ${userId} uploading avatar: ${file.filename}`);

  // Store uploaded file path for cleanup on failure
  const uploadedFilePath = file.path;
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
      console.warn("[uploadMyAvatar] Failed to fetch old avatar:", err);
      // Continue anyway
    }

    console.log(`[uploadMyAvatar] Updating DB with avatar path: ${avatarPath}`);
    
    // Update avatar column - CRITICAL: Check rowCount
    const updateResult = await query(
      "UPDATE users SET avatar = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username, email, role, avatar",
      [avatarPath, userId]
    );
    
    // If no rows updated, delete uploaded file and return error
    if (updateResult.rowCount !== 1) {
      console.error(`[uploadMyAvatar] UPDATE failed: rowCount = ${updateResult.rowCount}, expected 1`);
      // Clean up uploaded file
      try {
        await cleanupUploadsFile(`/avatars/${file.filename}`, "avatars");
        console.log(`[uploadMyAvatar] Cleaned up uploaded file due to DB update failure`);
      } catch (cleanupErr) {
        console.error("[uploadMyAvatar] Failed to cleanup uploaded file:", cleanupErr);
      }
      return res.status(404).json({ message: "User not found" });
    }
    
    console.log(`[uploadMyAvatar] DB updated successfully: rowCount = ${updateResult.rowCount}`);

    const user = updateResult.rows[0];
    console.log(`[uploadMyAvatar] Updated user avatar: ${user.avatar}`);

    // Delete old avatar file if it exists (after successful DB update)
    if (oldAvatarFilename) {
      try {
        await cleanupUploadsFile(`/avatars/${oldAvatarFilename}`, "avatars");
        console.log(`[uploadMyAvatar] Old avatar file cleaned up: ${oldAvatarFilename}`);
      } catch (cleanupErr) {
        // Log but don't fail the request if cleanup fails
        console.warn("[uploadMyAvatar] Failed to cleanup old avatar:", cleanupErr);
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
    console.error("[uploadMyAvatar] Error:", err);
    console.error("[uploadMyAvatar] Error details:", {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    });

    // Clean up uploaded file on any error
    try {
      await cleanupUploadsFile(`/avatars/${file.filename}`, "avatars");
      console.log(`[uploadMyAvatar] Cleaned up uploaded file due to error`);
    } catch (cleanupErr) {
      console.error("[uploadMyAvatar] Failed to cleanup uploaded file:", cleanupErr);
    }

    return res.status(500).json({
      message: "Internal server error",
      error: process.env.NODE_ENV === "development" ? err?.message : undefined,
    });
  }
};

