-- ========================================================================
-- LEGACY / MANUAL SCHEMA SCRIPT
-- ========================================================================
-- 
-- ⚠️  WARNING: This is a LEGACY script. 
-- 
-- Source of truth has moved to: backend/src/db/migrations/
-- 
-- DO NOT use this file for new schema changes.
-- New schema changes must be added as NEW migration files in:
--   backend/src/db/migrations/
-- 
-- Migration files follow naming: 000000_baseline_schema.sql, 
--   000001_*.sql, 000002_*.sql, etc.
--
-- Current canonical baseline: backend/src/db/migrations/000000_baseline_schema.sql
--
-- ========================================================================
-- 
-- This legacy script adds the 'views' column to the books table.
-- This functionality is now included in the baseline migration.
-- 
-- HOW TO RUN:
-- 1. Make sure you have PostgreSQL database connection configured
-- 2. Connect to your database using psql or any PostgreSQL client
-- 3. Run this script: psql -d your_database_name -f apply_schema_updates.sql
--    OR copy-paste the SQL commands directly into your PostgreSQL client
--
-- IMPORTANT:
-- - This script is idempotent (safe to run multiple times)
-- - It checks if the column exists before adding it
-- - Existing data will be preserved (default value is 0)

-- Add 'views' column to books table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'books' 
        AND column_name = 'views'
    ) THEN
        ALTER TABLE books ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added views column to books table';
    ELSE
        RAISE NOTICE 'views column already exists in books table';
    END IF;
END $$;

-- Optional: Create index on views column for faster sorting (uncomment if needed)
-- CREATE INDEX IF NOT EXISTS idx_books_views ON books(views DESC);

