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
    try {
      req.body = schema.parse(req.body);
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

