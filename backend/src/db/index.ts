import { Pool } from "pg";

/**
 * Database connection pool
 * Requires DATABASE_URL environment variable for production safety
 */
const getDbConfig = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  
  return {
    connectionString,
  };
};

export const pool = new Pool(getDbConfig());

// Handle pool errors (prevents crashes from connection issues)
pool.on("error", (err, client) => {
  console.error("Unexpected error on idle database client", err);
  // Don't exit - let the pool handle reconnection
});

// Handle pool connection events for monitoring
pool.on("connect", () => {
  if (process.env.NODE_ENV === "development") {
    console.log("[DB] New client connected to database");
  }
});

/**
 * Execute a SQL query
 * @param text SQL query string
 * @param params Query parameters (optional)
 * @returns Promise with query result
 */
export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

/**
 * Test database connection
 * @returns Promise<boolean> - true if connection successful
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    console.error("[DB] Connection test failed:", err);
    return false;
  }
};
