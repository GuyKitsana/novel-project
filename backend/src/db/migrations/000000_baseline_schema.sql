-- ========================================================================
-- BASELINE MIGRATION: Current Database Schema
-- ========================================================================
-- 
-- PURPOSE:
--   This migration represents the CURRENT state of the database schema.
--   It is a BASELINE migration that should be run ONCE to establish the
--   starting point for schema versioning.
--
-- IMPORTANT NOTES:
--   1. This migration uses CREATE TABLE IF NOT EXISTS to be idempotent
--   2. It should be marked as applied manually for existing databases
--   3. Do NOT run this on production if tables already exist (mark as applied instead)
--   4. This migration is for documentation and validation purposes
--
-- HOW TO USE:
--   - For NEW databases: Run this migration first
--   - For EXISTING databases: Mark this migration as applied without running it
--     INSERT INTO migrations (name) VALUES ('000000_baseline_schema.sql');
--
-- ========================================================================

-- Create migrations tracking table (if not already exists)
CREATE TABLE IF NOT EXISTS public.migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP DEFAULT NOW()
);

-- ========================================================================
-- USERS TABLE
-- ========================================================================
-- Stores user account information including authentication data
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    avatar VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT users_email_unique UNIQUE (email),
    CONSTRAINT users_username_unique UNIQUE (username),
    CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'))
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users (role);

-- ========================================================================
-- CATEGORIES TABLE
-- ========================================================================
-- Stores book categories (genres, themes, etc.)
CREATE TABLE IF NOT EXISTS public.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT categories_name_unique UNIQUE (name),
    CONSTRAINT categories_code_unique UNIQUE (code)
);

-- Indexes for categories table
CREATE INDEX IF NOT EXISTS idx_categories_code ON public.categories (code);

-- ========================================================================
-- BOOKS TABLE
-- ========================================================================
-- Stores book information
CREATE TABLE IF NOT EXISTS public.books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    author VARCHAR(255),
    publisher VARCHAR(255),
    description TEXT,
    cover_image VARCHAR(500),
    buy_link VARCHAR(500),
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for books table
CREATE INDEX IF NOT EXISTS idx_books_created_at ON public.books (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_books_views ON public.books (views DESC);
CREATE INDEX IF NOT EXISTS idx_books_author ON public.books (author);

-- ========================================================================
-- BOOK_CATEGORIES TABLE (Junction Table)
-- ========================================================================
-- Many-to-many relationship between books and categories
CREATE TABLE IF NOT EXISTS public.book_categories (
    book_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (book_id, category_id),
    CONSTRAINT fk_book_categories_book FOREIGN KEY (book_id) 
        REFERENCES public.books(id) ON DELETE CASCADE,
    CONSTRAINT fk_book_categories_category FOREIGN KEY (category_id) 
        REFERENCES public.categories(id) ON DELETE CASCADE
);

-- Indexes for book_categories table
CREATE INDEX IF NOT EXISTS idx_book_categories_book_id ON public.book_categories (book_id);
CREATE INDEX IF NOT EXISTS idx_book_categories_category_id ON public.book_categories (category_id);

-- ========================================================================
-- REVIEWS TABLE
-- ========================================================================
-- Stores user reviews/ratings for books
CREATE TABLE IF NOT EXISTS public.reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_reviews_book FOREIGN KEY (book_id) 
        REFERENCES public.books(id) ON DELETE CASCADE,
    CONSTRAINT reviews_user_book_unique UNIQUE (user_id, book_id),
    CONSTRAINT reviews_rating_check CHECK (rating >= 1 AND rating <= 5)
);

-- Indexes for reviews table
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON public.reviews (book_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews (created_at DESC);

-- ========================================================================
-- FAVORITES TABLE (Junction Table)
-- ========================================================================
-- Stores user favorites/bookmarks
CREATE TABLE IF NOT EXISTS public.favorites (
    user_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_favorites_book FOREIGN KEY (book_id) 
        REFERENCES public.books(id) ON DELETE CASCADE
);

-- Indexes for favorites table
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_book_id ON public.favorites (book_id);
CREATE INDEX IF NOT EXISTS idx_favorites_created_at ON public.favorites (created_at DESC);

-- ========================================================================
-- USER_CATEGORIES TABLE (Junction Table)
-- ========================================================================
-- Stores user's selected categories during onboarding
CREATE TABLE IF NOT EXISTS public.user_categories (
    user_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, category_id),
    CONSTRAINT fk_user_categories_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_categories_category FOREIGN KEY (category_id) 
        REFERENCES public.categories(id) ON DELETE CASCADE
);

-- Indexes for user_categories table
CREATE INDEX IF NOT EXISTS idx_user_categories_user_id ON public.user_categories (user_id);
CREATE INDEX IF NOT EXISTS idx_user_categories_category_id ON public.user_categories (category_id);

-- ========================================================================
-- ADMIN_ACTIVITIES TABLE
-- ========================================================================
-- Logs admin actions for audit trail
CREATE TABLE IF NOT EXISTS public.admin_activities (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    ref_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT admin_activities_type_check CHECK (type IN ('book', 'user', 'review', 'category')),
    CONSTRAINT admin_activities_action_check CHECK (action IN ('create', 'update', 'delete'))
);

-- Indexes for admin_activities table
CREATE INDEX IF NOT EXISTS idx_admin_activities_type ON public.admin_activities (type);
CREATE INDEX IF NOT EXISTS idx_admin_activities_action ON public.admin_activities (action);
CREATE INDEX IF NOT EXISTS idx_admin_activities_created_at ON public.admin_activities (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activities_ref_id ON public.admin_activities (ref_id);

-- ========================================================================
-- END OF BASELINE MIGRATION
-- ========================================================================
-- 
-- NOTES:
--   - All tables use IF NOT EXISTS for idempotency
--   - Foreign keys use ON DELETE CASCADE where appropriate
--   - Indexes are created for performance optimization
--   - Constraints ensure data integrity
--   - Timestamps default to NOW() for created_at/updated_at
--
-- ========================================================================
