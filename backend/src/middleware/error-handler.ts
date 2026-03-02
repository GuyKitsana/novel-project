import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error("[error-handler] Unhandled error:", err);
  if (err instanceof Error) {
    console.error("[error-handler] Stack trace:", err.stack);
  }
  // Log error message for all environments
  if (err?.message) {
    console.error("[error-handler] Error message:", err.message);
  }
  if (err?.code) {
    console.error("[error-handler] Error code:", err.code);
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
}
