/**
 * Series Service
 * 
 * Handles series creation and lookup operations
 */

import { query } from "../db";
import { normalizeSeriesTitle } from "../utils/seriesNormalize";

/**
 * Get or create series ID by title
 * - Normalizes the title
 * - Looks up existing series by normalized_title
 * - Creates new series if not found
 * - Returns series ID
 */
export async function getOrCreateSeriesIdByTitle(
  rawSeriesTitle: string
): Promise<number> {
  if (!rawSeriesTitle || typeof rawSeriesTitle !== "string") {
    throw new Error("Series title is required");
  }

  const normalized = normalizeSeriesTitle(rawSeriesTitle);
  
  if (!normalized) {
    throw new Error("Series title cannot be empty after normalization");
  }

  // Try to find existing series
  const existingResult = await query(
    `SELECT id FROM public.series WHERE normalized_title = $1 LIMIT 1`,
    [normalized]
  );

  if ((existingResult.rowCount ?? 0) > 0) {
    return Number(existingResult.rows[0].id);
  }

  // Create new series
  const insertResult = await query(
    `INSERT INTO public.series (title, normalized_title)
     VALUES ($1, $2)
     RETURNING id`,
    [rawSeriesTitle.trim(), normalized]
  );

  if (insertResult.rowCount === 0) {
    throw new Error("Failed to create series");
  }

  return Number(insertResult.rows[0].id);
}
