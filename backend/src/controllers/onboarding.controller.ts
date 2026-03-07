import { Request, Response } from "express";
import { query } from "../db";

/**
 * GET /api/onboarding/me
 * เช็กว่าผู้ใช้เคยเลือกหมวดหรือยัง
 */
export const getOnboardingStatus = async (
  req: Request,
  res: Response
) => {
  const userId = req.user!.id;

  const result = await query(
    `
    SELECT COUNT(*) AS category_count
    FROM user_categories
    WHERE user_id = $1
    `,
    [userId]
  );

  res.json({
    category_count: Number(result.rows[0].category_count),
  });
};

/**
 * PUT /api/onboarding/categories
 * บันทึกหมวดที่ผู้ใช้เลือก
 */
export const saveCategories = async (
  req: Request,
  res: Response
) => {
  const userId = req.user!.id;
  
  console.log("[ONBOARDING CONTROLLER] Step 1: Controller called:", {
    userId,
    hasUser: !!req.user,
    bodyExists: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    timestamp: new Date().toISOString(),
  });
  
  // req.body is already validated by Zod schema
  const { favoriteCategories } = req.body; // ['fantasy','romance'] - already validated as non-empty array

  // DEBUG: Log categories received by backend
  console.log("[ONBOARDING CONTROLLER] Step 2: Categories received (after validation):", {
    userId,
    favoriteCategories,
    count: favoriteCategories.length,
    isArray: Array.isArray(favoriteCategories),
    timestamp: new Date().toISOString(),
  });

  // Step 3: Delete existing categories
  console.log("[ONBOARDING CONTROLLER] Step 3: Deleting existing categories for user:", {
    userId,
    timestamp: new Date().toISOString(),
  });
  
  try {
    const deleteResult = await query(
      "DELETE FROM user_categories WHERE user_id = $1",
      [userId]
    );
    
    console.log("[ONBOARDING CONTROLLER] Step 3: Delete completed:", {
      userId,
      rowsDeleted: deleteResult.rowCount,
      timestamp: new Date().toISOString(),
    });
  } catch (deleteErr) {
    console.error("[ONBOARDING CONTROLLER] Step 3: Delete failed:", {
      userId,
      error: deleteErr,
      timestamp: new Date().toISOString(),
    });
    throw deleteErr;
  }

  const storedCategoryIds: number[] = [];
  const failedCategoryCodes: string[] = [];

  // Step 3.5: Verify category codes exist in database
  console.log("[ONBOARDING CONTROLLER] Step 3.5: Checking if category codes exist in database:", {
    userId,
    favoriteCategories,
    timestamp: new Date().toISOString(),
  });
  
  try {
    // Check all category codes at once
    const categoryCodesCheck = await query(
      `SELECT code, id, name FROM categories WHERE code = ANY($1::text[])`,
      [favoriteCategories]
    );
    
    console.log("[ONBOARDING CONTROLLER] Step 3.5: Category codes check result:", {
      userId,
      requestedCodes: favoriteCategories,
      foundCodes: categoryCodesCheck.rows.map((r: any) => ({ code: r.code, id: r.id, name: r.name })),
      foundCount: categoryCodesCheck.rows.length,
      missingCodes: favoriteCategories.filter((code: string) => 
        !categoryCodesCheck.rows.some((r: any) => r.code === code)
      ),
      timestamp: new Date().toISOString(),
    });
  } catch (checkErr) {
    console.error("[ONBOARDING CONTROLLER] Step 3.5: Category codes check failed:", {
      userId,
      error: checkErr,
      timestamp: new Date().toISOString(),
    });
  }

  // Step 4: Insert new categories
  console.log("[ONBOARDING CONTROLLER] Step 4: Starting category insertion loop:", {
    userId,
    favoriteCategories,
    loopCount: favoriteCategories.length,
    timestamp: new Date().toISOString(),
  });

  for (let i = 0; i < favoriteCategories.length; i++) {
    const code = favoriteCategories[i];
    
    console.log("[ONBOARDING CONTROLLER] Step 4." + (i + 1) + ": Processing category code:", {
      userId,
      code,
      index: i,
      timestamp: new Date().toISOString(),
    });
    
    try {
      // Look up category ID
      const lookupResult = await query(
        "SELECT id FROM categories WHERE code = $1",
        [code]
      );

      console.log("[ONBOARDING CONTROLLER] Step 4." + (i + 1) + ": Category lookup result:", {
        userId,
        code,
        found: lookupResult.rows.length > 0,
        categoryId: lookupResult.rows.length > 0 ? lookupResult.rows[0].id : null,
        timestamp: new Date().toISOString(),
      });

      if (lookupResult.rows.length > 0) {
        const categoryId = Number(lookupResult.rows[0].id);
        
        console.log("[ONBOARDING CONTROLLER] Step 4." + (i + 1) + ": Inserting into user_categories:", {
          userId,
          categoryId,
          code,
          timestamp: new Date().toISOString(),
        });
        
        try {
          const insertResult = await query(
            "INSERT INTO user_categories (user_id, category_id) VALUES ($1, $2)",
            [userId, categoryId]
          );
          
          console.log("[ONBOARDING CONTROLLER] Step 4." + (i + 1) + ": Insert successful:", {
            userId,
            categoryId,
            code,
            rowCount: insertResult.rowCount,
            timestamp: new Date().toISOString(),
          });
          
          storedCategoryIds.push(categoryId);
        } catch (insertErr: any) {
          console.error("[ONBOARDING CONTROLLER] Step 4." + (i + 1) + ": Insert failed:", {
            userId,
            categoryId,
            code,
            error: insertErr,
            errorMessage: insertErr?.message,
            errorCode: insertErr?.code,
            timestamp: new Date().toISOString(),
          });
          failedCategoryCodes.push(code);
        }
      } else {
        console.warn(`[ONBOARDING CONTROLLER] Step 4.${i + 1}: Category code not found in database:`, {
          userId,
          code,
          timestamp: new Date().toISOString(),
        });
        failedCategoryCodes.push(code);
      }
    } catch (lookupErr: any) {
      console.error("[ONBOARDING CONTROLLER] Step 4." + (i + 1) + ": Category lookup failed:", {
        userId,
        code,
        error: lookupErr,
        errorMessage: lookupErr?.message,
        errorCode: lookupErr?.code,
        timestamp: new Date().toISOString(),
      });
      failedCategoryCodes.push(code);
    }
  }

  // Step 5: Verify what was actually stored
  console.log("[ONBOARDING CONTROLLER] Step 5: Verifying stored categories:", {
    userId,
    timestamp: new Date().toISOString(),
  });
  
  try {
    const verifyResult = await query(
      `SELECT uc.category_id, c.code, c.name 
       FROM user_categories uc 
       JOIN categories c ON uc.category_id = c.id 
       WHERE uc.user_id = $1 
       ORDER BY c.code ASC`,
      [userId]
    );
    
    console.log("[ONBOARDING CONTROLLER] Step 5: Verification query result:", {
      userId,
      rowsFound: verifyResult.rows.length,
      storedCategories: verifyResult.rows.map((r: any) => ({
        categoryId: Number(r.category_id),
        code: r.code,
        name: r.name,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (verifyErr) {
    console.error("[ONBOARDING CONTROLLER] Step 5: Verification query failed:", {
      userId,
      error: verifyErr,
      timestamp: new Date().toISOString(),
    });
  }

  // DEBUG: Log categories stored in database
  console.log("[ONBOARDING CONTROLLER] Step 6: Final summary:", {
    userId,
    requestedCategories: favoriteCategories,
    requestedCount: favoriteCategories.length,
    storedCategoryIds: storedCategoryIds,
    storedCount: storedCategoryIds.length,
    failedCategoryCodes: failedCategoryCodes,
    failedCount: failedCategoryCodes.length,
    success: storedCategoryIds.length > 0,
    timestamp: new Date().toISOString(),
  });

  if (storedCategoryIds.length === 0) {
    console.error("[ONBOARDING CONTROLLER] CRITICAL: No categories were stored!", {
      userId,
      favoriteCategories,
      failedCategoryCodes,
      timestamp: new Date().toISOString(),
    });
    return res.status(400).json({ 
      message: "Failed to store categories. Please check if category codes are valid.",
      errors: failedCategoryCodes.length > 0 ? failedCategoryCodes.map(code => `Category code "${code}" not found`) : ["No categories could be stored"]
    });
  }

  res.json({ 
    message: "Onboarding completed",
    storedCount: storedCategoryIds.length,
    failedCount: failedCategoryCodes.length,
  });
};

/**
 * GET /api/onboarding/categories
 * ดึงหมวดที่ผู้ใช้เลือก (category codes)
 */
export const getUserCategories = async (
  req: Request,
  res: Response
) => {
  const userId = req.user!.id;

  const result = await query(
    `
    SELECT c.code
    FROM user_categories uc
    JOIN categories c ON uc.category_id = c.id
    WHERE uc.user_id = $1
    ORDER BY c.code ASC
    `,
    [userId]
  );

  res.json({
    categories: result.rows.map((row) => row.code),
  });
};