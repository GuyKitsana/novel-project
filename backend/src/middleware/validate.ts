import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

const formatZodIssues = (issues: any[]) =>
  issues.map((issue) => ({
    path: (issue?.path ?? []).map(String).join("."),
    message: String(issue?.message ?? "Invalid input"),
  }));

/**
 * Middleware to validate request body against a Zod schema
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Enhanced logging for onboarding categories validation
    const isOnboardingCategories = req.path === "/onboarding/categories" && req.method === "PUT";
    
    if (isOnboardingCategories) {
      console.log("[ONBOARDING VALIDATION] Step 1: Request body received (before validation):", {
        path: req.path,
        method: req.method,
        rawBody: req.body,
        bodyType: typeof req.body,
        bodyKeys: req.body ? Object.keys(req.body) : [],
        timestamp: new Date().toISOString(),
      });
    }
    
    try {
      const parsedBody = schema.parse(req.body);
      req.body = parsedBody;
      
      if (isOnboardingCategories) {
        // Type assertion for logging - parsedBody is validated by Zod schema
        const typedBody = parsedBody as { favoriteCategories?: string[] };
        console.log("[ONBOARDING VALIDATION] Step 2: Validation successful:", {
          path: req.path,
          parsedBody: parsedBody,
          favoriteCategories: typedBody.favoriteCategories,
          favoriteCategoriesCount: Array.isArray(typedBody.favoriteCategories) ? typedBody.favoriteCategories.length : 0,
          timestamp: new Date().toISOString(),
        });
      }
      
      next();
    } catch (error) {
      if (isOnboardingCategories) {
        console.error("[ONBOARDING VALIDATION] Step 2: Validation failed:", {
          path: req.path,
          error: error,
          rawBody: req.body,
          timestamp: new Date().toISOString(),
        });
      }
      
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: formatZodIssues((error as any).issues ?? (error as any).errors ?? []),
        });
      }
      next(error);
    }
  };
};

/**
 * Middleware to validate request params against a Zod schema
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params) as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: formatZodIssues((error as any).issues ?? (error as any).errors ?? []),
        });
      }
      next(error);
    }
  };
};

/**
 * Middleware to validate request query against a Zod schema
 * 
 * Note: Uses Object.assign to merge validated values into req.query
 * instead of reassigning, to support Express 5 where req.query is getter-only
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req.query);
      // Merge validated values into existing req.query (Express 5 compatibility)
      if (req.query && typeof req.query === "object") {
        Object.assign(req.query as any, parsed);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          message: "Validation error",
          errors: formatZodIssues((error as any).issues ?? (error as any).errors ?? []),
        });
      }
      next(error);
    }
  };
};

