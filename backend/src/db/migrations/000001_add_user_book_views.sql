-- ========================================================================
-- MIGRATION: Add User Book Views Tracking
-- ========================================================================
-- 
-- PURPOSE:
--   Adds optional table to track user book views for recommendation system.
--   This is non-breaking - existing functionality continues to work without it.
--
-- ========================================================================

-- Create user_book_views table for tracking user interactions
CREATE TABLE IF NOT EXISTS public.user_book_views (
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    last_viewed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    views_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_user_book_views_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_book_views_book FOREIGN KEY (book_id) 
        REFERENCES public.books(id) ON DELETE CASCADE
);

-- Indexes for user_book_views table
CREATE INDEX IF NOT EXISTS idx_user_book_views_user_id ON public.user_book_views (user_id);
CREATE INDEX IF NOT EXISTS idx_user_book_views_book_id ON public.user_book_views (book_id);
CREATE INDEX IF NOT EXISTS idx_user_book_views_last_viewed_at ON public.user_book_views (last_viewed_at DESC);

-- ========================================================================
-- END OF MIGRATION
-- ========================================================================
