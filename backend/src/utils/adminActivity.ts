import { query } from "../db";

export type ActivityType = "book" | "user" | "review" | "category";
export type ActivityAction = "create" | "update" | "delete";

/**
 * Helper function to log admin activity
 * Should be called after successful CRUD operations
 * 
 * @param type - Entity type (book, user, review, category)
 * @param action - Action performed (create, update, delete)
 * @param description - Human-readable description in Thai
 * @param refId - Optional reference ID to the related entity
 */
export const logAdminActivity = async (
  type: ActivityType,
  action: ActivityAction,
  description: string,
  refId?: number
): Promise<void> => {
  try {
    await query(
      `
      INSERT INTO admin_activities (type, action, description, ref_id)
      VALUES ($1, $2, $3, $4)
      `,
      [type, action, description, refId ?? null]
    );
  } catch (error) {
    // Log error but don't throw - activity logging should not break main operations
    console.error("Failed to log admin activity:", error);
  }
};

/**
 * @deprecated Use logAdminActivity instead
 * Kept for backward compatibility
 */
export const createAdminActivity = async (params: {
  type: ActivityType;
  action: ActivityAction;
  description: string;
  ref_id: number;
}): Promise<void> => {
  return logAdminActivity(params.type, params.action, params.description, params.ref_id);
};

