import { Request, Response } from "express";
import * as bcrypt from "bcrypt";
import { query } from "../db";
import { createAdminActivity } from "../utils/adminActivity";

/* GET all users */
export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const result = await query(
      "SELECT id, username, email, role FROM users ORDER BY id ASC"
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error("getAllUsers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* CREATE user */
export const createUser = async (req: Request, res: Response) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }

    // Check if email already exists
    const existingUser = await query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if ((existingUser.rowCount ?? 0) > 0) {
      return res.status(400).json({ message: "อีเมลนี้มีอยู่แล้ว" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const result = await query(
      `
      INSERT INTO users (username, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id
      `,
      [username.trim(), email.trim(), hashed, role || "user"]
    );

    const newUserId = result.rows[0].id;

    // Log activity
    try {
      await createAdminActivity({
        type: "user",
        action: "create",
        description: `เพิ่มผู้ใช้ "${username}"`,
        ref_id: newUserId,
      });
    } catch (activityErr) {
      console.warn("Failed to log admin activity:", activityErr);
    }

    res.status(201).json({ message: "User created" });
  } catch (err: any) {
    console.error("createUser error:", err);
    if (err.code === "23505") {
      // PostgreSQL unique constraint violation
      return res.status(400).json({ message: "อีเมลหรือชื่อผู้ใช้นี้มีอยู่แล้ว" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* UPDATE user */
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, email, password, role } = req.body;

    const userId = Number(id);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    // Fetch username before update for activity log
    const userResult = await query("SELECT username, email FROM users WHERE id = $1", [userId]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const oldUsername = userResult.rows[0].username;
    const oldEmail = userResult.rows[0].email;

    // Check if email is being changed and if new email already exists
    if (email && email !== oldEmail) {
      const emailCheck = await query(
        "SELECT id FROM users WHERE email = $1 AND id != $2",
        [email.trim(), userId]
      );
      if ((emailCheck.rowCount ?? 0) > 0) {
        return res.status(400).json({ message: "อีเมลนี้มีอยู่แล้ว" });
      }
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await query(
        `
        UPDATE users
        SET username=$1, email=$2, password_hash=$3, role=$4
        WHERE id=$5
        `,
        [username.trim(), email.trim(), hashed, role, userId]
      );
    } else {
      await query(
        `
        UPDATE users
        SET username=$1, email=$2, role=$3
        WHERE id=$4
        `,
        [username.trim(), email.trim(), role, userId]
      );
    }

    // Log activity
    try {
      await createAdminActivity({
        type: "user",
        action: "update",
        description: `แก้ไขผู้ใช้ "${oldUsername}"`,
        ref_id: userId,
      });
    } catch (activityErr) {
      console.warn("Failed to log admin activity:", activityErr);
    }

    res.json({ message: "User updated" });
  } catch (err: any) {
    console.error("updateUser error:", err);
    if (err.code === "23505") {
      return res.status(400).json({ message: "อีเมลหรือชื่อผู้ใช้นี้มีอยู่แล้ว" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* DELETE user */
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const userId = Number(id);
    if (Number.isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    // Fetch username before delete for activity log
    const userResult = await query("SELECT username FROM users WHERE id = $1", [userId]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    const username = userResult.rows[0].username;

    // Prevent deleting yourself
    if (req.user?.id === userId) {
      return res.status(400).json({ message: "ไม่สามารถลบบัญชีของตัวเองได้" });
    }

    // Delete user (cascade will handle related records)
    await query("DELETE FROM users WHERE id = $1", [userId]);

    // Log activity
    try {
      await createAdminActivity({
        type: "user",
        action: "delete",
        description: `ลบผู้ใช้ "${username}"`,
        ref_id: userId,
      });
    } catch (activityErr) {
      console.warn("Failed to log admin activity:", activityErr);
    }

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("deleteUser error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
