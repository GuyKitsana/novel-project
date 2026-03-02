import * as fs from "fs/promises";
import * as path from "path";

/**
 * Safely delete a file, ignoring ENOENT (file not found) errors
 */
export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err: any) {
    // Ignore file not found errors (file may have already been deleted)
    if (err.code !== "ENOENT") {
      console.error(`Failed to delete file ${filePath}:`, err);
      throw err;
    }
  }
}

/**
 * Check if a file path is within the uploads directory (prevents path traversal)
 */
export function isInUploadsDir(filePath: string, subdir: "books" | "avatars"): boolean {
  // Normalize path to handle both relative and absolute paths
  const normalizedPath = path.normalize(filePath);
  
  // Get absolute path for uploads directory using process.cwd() for better compatibility
  const uploadsDir = path.join(process.cwd(), "uploads", subdir);
  const absoluteUploadsDir = path.resolve(uploadsDir);
  
  // Get absolute path for the file
  const absoluteFilePath = path.resolve(normalizedPath);
  
  // Check if file path is within uploads directory
  return absoluteFilePath.startsWith(absoluteUploadsDir + path.sep) || 
         absoluteFilePath === absoluteUploadsDir;
}

/**
 * Extract relative path from URL or path string
 * Handles both "/uploads/books/xxx.jpg" and "uploads/books/xxx.jpg" formats
 * Also handles "/books/xxx.jpg" (which maps to uploads/books)
 */
export function extractUploadsRelativePath(
  urlOrPath: string | null | undefined,
  subdir: "books" | "avatars"
): string | null {
  if (!urlOrPath) return null;
  
  // Remove leading/trailing slashes
  const normalized = urlOrPath.trim().replace(/^\/+|\/+$/g, "");
  
  // Handle different path formats
  let relativePath: string | null = null;
  
  // Format 1: "/uploads/books/xxx.jpg" or "uploads/books/xxx.jpg"
  if (normalized.startsWith(`uploads/${subdir}/`) || normalized.startsWith(`/uploads/${subdir}/`)) {
    const parts = normalized.split(`${subdir}/`);
    if (parts.length > 1) {
      relativePath = parts[1];
    }
  }
  // Format 2: "/books/xxx.jpg" (backend serves /books as static from uploads/books)
  else if (subdir === "books" && (normalized.startsWith("books/") || normalized.startsWith("/books/"))) {
    const parts = normalized.split("books/");
    if (parts.length > 1) {
      relativePath = parts[1];
    }
  }
  // Format 2b: "/avatars/xxx.jpg" (backend serves /avatars as static from uploads/avatars)
  else if (subdir === "avatars" && (normalized.startsWith("avatars/") || normalized.startsWith("/avatars/"))) {
    const parts = normalized.split("avatars/");
    if (parts.length > 1) {
      relativePath = parts[1];
    }
  }
  // Format 3: Just filename "xxx.jpg" (assumed to be in uploads subdir)
  else if (!normalized.includes("/")) {
    relativePath = normalized;
  }
  
  return relativePath;
}

/**
 * Get full file path for a file in uploads directory
 */
export function getUploadsFilePath(
  relativePath: string,
  subdir: "books" | "avatars"
): string {
  return path.join(process.cwd(), "uploads", subdir, relativePath);
}

/**
 * Clean up a file from uploads directory if it exists
 * Safely handles path extraction and validation
 */
export async function cleanupUploadsFile(
  urlOrPath: string | null | undefined,
  subdir: "books" | "avatars"
): Promise<void> {
  if (!urlOrPath) return;
  
  const relativePath = extractUploadsRelativePath(urlOrPath, subdir);
  if (!relativePath) {
    console.warn(`Could not extract relative path from: ${urlOrPath}`);
    return;
  }
  
  const filePath = getUploadsFilePath(relativePath, subdir);
  
  // Safety check: ensure file is within uploads directory
  if (!isInUploadsDir(filePath, subdir)) {
    console.error(`Security check failed: file path outside uploads directory: ${filePath}`);
    return;
  }
  
  await safeUnlink(filePath);
}

