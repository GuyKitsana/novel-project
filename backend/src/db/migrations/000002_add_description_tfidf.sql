-- ========================================================================
-- MIGRATION: Add description_tfidf column to books table
-- ========================================================================
-- 
-- PURPOSE:
--   Adds description_tfidf field for TF-IDF/CBF recommendation system.
--   This field is optional - existing description field remains unchanged for UI display.
--   TF-IDF will use: description_tfidf ?? description ?? ""
--
-- ========================================================================

-- Add description_tfidf column to books table
ALTER TABLE public.books
ADD COLUMN IF NOT EXISTS description_tfidf TEXT NULL;

-- Backfill existing rows: set description_tfidf = description where description_tfidf is null
UPDATE public.books
SET description_tfidf = description
WHERE description_tfidf IS NULL
  AND description IS NOT NULL
  AND description != '';

-- ========================================================================
-- END OF MIGRATION
-- ========================================================================
