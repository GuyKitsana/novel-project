// Load environment variables FIRST, before any other imports
import * as dotenv from "dotenv";
dotenv.config();

// Import after dotenv.config() to ensure env vars are available
import app from "./app";
import { testConnection } from "./db";

const PORT = process.env.PORT || 3001;

// Get server host (default to 0.0.0.0 for production, localhost for dev)
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost");
const PROTOCOL = process.env.PROTOCOL || "http";
const BASE_URL = process.env.BASE_URL || `${PROTOCOL}://${HOST}:${PORT}`;

// Start server
const server = app.listen(parseInt(PORT.toString()), HOST, async () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
  console.log(`🌐 API base URL: ${BASE_URL}/api`);
  console.log(`💚 Health check: ${BASE_URL}/api/health`);
  
  const corsOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL 
    : process.env.NODE_ENV !== "production" 
      ? "http://localhost:3000" 
      : "configure FRONTEND_URL";
  console.log(`🔒 CORS enabled for: ${corsOrigins}`);
  
  // Test database connection (non-blocking)
  if (process.env.DATABASE_URL || process.env.PGHOST) {
    const dbConnected = await testConnection();
    if (dbConnected) {
      console.log(`✅ Database connected`);
    } else {
      console.warn(`⚠️  Database connection failed - check DATABASE_URL or PG env vars`);
    }
  } else {
    console.warn(`⚠️  DATABASE_URL or PG environment variables not set`);
  }
});

// Handle server errors gracefully
server.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error(`❌ Server error:`, err);
  }
  process.exit(1);
});

// Graceful shutdown handlers
import { pool } from "./db";

const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Stop accepting new connections
  server.close(() => {
    console.log("HTTP server closed");
  });
  
  // Close database pool
  try {
    await pool.end();
    console.log("Database pool closed");
  } catch (err) {
    console.error("Error closing database pool:", err);
  }
  
  // Force exit after timeout
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit in production, but log the error
  if (process.env.NODE_ENV === "production") {
    // In production, log but don't crash - let the process manager handle it
    console.error("Unhandled promise rejection logged");
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", (err: Error) => {
  console.error("Uncaught Exception:", err);
  gracefulShutdown("uncaughtException");
});

// Handle termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
