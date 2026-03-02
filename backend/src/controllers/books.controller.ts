import { Request, Response } from "express";
import { query } from "../db";
import { createAdminActivity } from "../utils/adminActivity";
import { cleanupUploadsFile } from "../utils/fileCleanup";
import { getOrCreateSeriesIdByTitle } from "../services/series.service";
import { extractVolumeNoFromTitle } from "../utils/seriesNormalize";
import * as path from "path";

const parseCategoryIds = (categories: string | string[] | undefined): number[] => {
  if (!categories) return [];
  const arr = Array.isArray(categories) ? categories : [categories];
  return arr
    .map((c) => Number(c))
    .filter((n) => !Number.isNaN(n) && n > 0);
};

/**
 * GET /api/books/authors
 * Get distinct authors for filter options
 */
export const getAuthors = async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `
      SELECT DISTINCT author
      FROM books
      WHERE author IS NOT NULL
        AND author != ''
        AND author != 'null'
      ORDER BY author ASC
      `
    );

    const authors = result.rows.map((row) => row.author).filter((a) => a);
    return res.json(authors);
  } catch (err) {
    console.error("getAuthors error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/books/publishers
 * Get distinct publishers for filter options
 */
export const getPublishers = async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `
      SELECT DISTINCT publisher
      FROM books
      WHERE publisher IS NOT NULL
        AND publisher != ''
        AND publisher != 'null'
      ORDER BY publisher ASC
      `
    );

    const publishers = result.rows.map((row) => row.publisher).filter((p) => p);
    return res.json(publishers);
  } catch (err) {
    console.error("getPublishers error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/books
 * Query params:
 * - sort: "recommended" for ranking by rating/favorites, otherwise by id
 * - q: search query
 * - categories: filter by categories
 * - authors: filter by authors
 * - publishers: filter by publishers
 * - limit: number of results
 * - offset: pagination offset
 */
export const getBooks = async (req: Request, res: Response) => {
  try {
    const { 
      q, 
      categories, 
      authors, 
      publishers, 
      limit = "20", 
      offset = "0",
      sort
    } = req.query;

    const isRecommendedSort = sort === "recommended";

    const params: any[] = [];
    let paramIndex = 1;
    const conditions: string[] = [];

    // Build base query - include rating/favorites when using recommended sort
    let sql = `
      SELECT
        b.id,
        b.title,
        b.author,
        b.description,
        b.description_tfidf,
        b.publisher,
        b.cover_image,
        b.buy_link,
        b.series_id,
        b.volume_no,
        s.title AS series_title,
        COALESCE(
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name), NULL),
          '{}'
        ) AS categories
        ${isRecommendedSort ? `
        ,COALESCE(AVG(r.rating), 0)::float AS rating_avg
        ,COALESCE(COUNT(DISTINCT r.id), 0)::int AS reviews_count
        ,COALESCE(COUNT(DISTINCT f.user_id), 0)::int AS favorites_count
        ` : ''}
      FROM books b
      LEFT JOIN book_categories bc ON bc.book_id = b.id
      LEFT JOIN categories c ON c.id = bc.category_id
      LEFT JOIN public.series s ON s.id = b.series_id
      ${isRecommendedSort ? `
      LEFT JOIN reviews r ON r.book_id = b.id
      LEFT JOIN favorites f ON f.book_id = b.id
      ` : ''}
    `;

    // Text search (q)
    if (q && typeof q === "string") {
      const searchTerm = `%${q}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      conditions.push(`(
        b.title ILIKE $${paramIndex}
        OR b.author ILIKE $${paramIndex + 1}
        OR b.description ILIKE $${paramIndex + 2}
      )`);
      paramIndex += 3;
    }

    // Categories filter (can be array or comma-separated string)
    if (categories) {
      const categoryIds = parseCategoryIds(categories as string | string[]);
      if (categoryIds.length > 0) {
        const placeholders = categoryIds.map((_, i) => `$${paramIndex + i}`).join(", ");
        params.push(...categoryIds);
        conditions.push(`b.id IN (
          SELECT DISTINCT bc2.book_id
          FROM book_categories bc2
          WHERE bc2.category_id IN (${placeholders})
        )`);
        paramIndex += categoryIds.length;
      }
    }

    // Authors filter (can be array or comma-separated string)
    if (authors) {
      const authorArray = Array.isArray(authors) ? authors : [authors];
      const validAuthors = authorArray.filter((a) => a && typeof a === "string");
      if (validAuthors.length > 0) {
        const placeholders = validAuthors.map((_, i) => `$${paramIndex + i}`).join(", ");
        params.push(...validAuthors);
        conditions.push(`b.author IN (${placeholders})`);
        paramIndex += validAuthors.length;
      }
    }

    // Publishers filter (can be array or comma-separated string)
    if (publishers) {
      const publisherArray = Array.isArray(publishers) ? publishers : [publishers];
      const validPublishers = publisherArray.filter((p) => p && typeof p === "string");
      if (validPublishers.length > 0) {
        const placeholders = validPublishers.map((_, i) => `$${paramIndex + i}`).join(", ");
        params.push(...validPublishers);
        conditions.push(`b.publisher IN (${placeholders})`);
        paramIndex += validPublishers.length;
      }
    }

    // Add WHERE clause if there are conditions
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(" AND ")}`;
    }

    sql += `
      GROUP BY
        b.id,
        b.title,
        b.author,
        b.description,
        b.description_tfidf,
        b.publisher,
        b.cover_image,
        b.buy_link,
        b.series_id,
        b.volume_no,
        s.title
    `;

    // Apply sorting
    if (isRecommendedSort) {
      // Recommended sort: rated books first, then by rating_avg DESC, favorites_count DESC, random tiebreaker
      // Use CASE to ensure rated books (reviews_count > 0) come before unrated
      sql += `
        ORDER BY 
          CASE WHEN COUNT(DISTINCT r.id) > 0 THEN 0 ELSE 1 END,
          COALESCE(AVG(r.rating), 0) DESC,
          COALESCE(COUNT(DISTINCT f.user_id), 0) DESC,
          RANDOM()
      `;
    } else {
      // Default sort: by id ASC
      sql += ` ORDER BY b.id ASC`;
    }

    // Get total count (before pagination) - simplified approach
    let countSql = `
      SELECT COUNT(DISTINCT b.id) as total
      FROM books b
    `;
    
    // Build count conditions (similar to main query but simpler)
    const countConditions: string[] = [];
    let countParamIndex = 1;
    const countParams: any[] = [];
    
    // Text search
    if (q && typeof q === "string") {
      const searchTerm = `%${q}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
      countConditions.push(`(
        b.title ILIKE $${countParamIndex}
        OR b.author ILIKE $${countParamIndex + 1}
        OR b.description ILIKE $${countParamIndex + 2}
      )`);
      countParamIndex += 3;
    }
    
    // Categories filter
    if (categories) {
      const categoryIds = parseCategoryIds(categories as string | string[]);
      if (categoryIds.length > 0) {
        countSql += `
          INNER JOIN book_categories bc_count ON bc_count.book_id = b.id
        `;
        const placeholders = categoryIds.map((_, i) => `$${countParamIndex + i}`).join(", ");
        countParams.push(...categoryIds);
        countConditions.push(`bc_count.category_id IN (${placeholders})`);
        countParamIndex += categoryIds.length;
      }
    }
    
    // Authors filter
    if (authors) {
      const authorArray = Array.isArray(authors) ? authors : [authors];
      const validAuthors = authorArray.filter((a) => a && typeof a === "string");
      if (validAuthors.length > 0) {
        const placeholders = validAuthors.map((_, i) => `$${countParamIndex + i}`).join(", ");
        countParams.push(...validAuthors);
        countConditions.push(`b.author IN (${placeholders})`);
        countParamIndex += validAuthors.length;
      }
    }
    
    // Publishers filter
    if (publishers) {
      const publisherArray = Array.isArray(publishers) ? publishers : [publishers];
      const validPublishers = publisherArray.filter((p) => p && typeof p === "string");
      if (validPublishers.length > 0) {
        const placeholders = validPublishers.map((_, i) => `$${countParamIndex + i}`).join(", ");
        countParams.push(...validPublishers);
        countConditions.push(`b.publisher IN (${placeholders})`);
        countParamIndex += validPublishers.length;
      }
    }
    
    if (countConditions.length > 0) {
      countSql += ` WHERE ${countConditions.join(" AND ")}`;
    }

    const limitNum = Math.max(Number(limit) || 20, 1);
    const offsetNum = Math.max(Number(offset) || 0, 0);

    // For recommended sort, we need special handling: get more results then mix rated/unrated
    let finalLimit = limitNum;
    let queryLimit = limitNum;
    
    if (isRecommendedSort) {
      // Fetch more than needed to have enough rated books, then mix with unrated
      queryLimit = limitNum * 2; // Fetch 2x to have buffer for mixing
    }

    params.push(queryLimit);
    sql += ` LIMIT $${params.length}`;

    // Only apply offset for non-recommended sort (recommended sort handles mixing)
    if (!isRecommendedSort) {
      params.push(offsetNum);
      sql += ` OFFSET $${params.length}`;
    }

    // Execute queries
    const [result, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, countParams), // Use countParams for count query
    ]);

    const total = Number(countResult.rows[0]?.total || 0);

    // Process results
    let items: any[];
    
    if (isRecommendedSort) {
      // Separate rated and unrated books
      const ratedBooks: any[] = [];
      const unratedBooks: any[] = [];
      
      result.rows.forEach((row: any) => {
        const reviewsCount = Number(row.reviews_count) || 0;
        const bookItem = {
          id: Number(row.id),
          title: row.title,
          author: row.author,
          description: row.description,
          description_tfidf: row.description_tfidf ?? null,
          publisher: row.publisher,
          cover_image: row.cover_image,
          buy_link: row.buy_link !== undefined && row.buy_link !== null && row.buy_link !== "" 
            ? row.buy_link 
            : (row as any).store_url ?? null,
          series_id: row.series_id ? Number(row.series_id) : null,
          volume_no: row.volume_no ? Number(row.volume_no) : null,
          series_title: row.series_title || null,
          categories: Array.isArray(row.categories) ? row.categories : [],
          rating_avg: Number.isNaN(Number(row.rating_avg)) ? 0 : Number(row.rating_avg) || 0,
          reviews_count: reviewsCount,
          favorites_count: Number.isNaN(Number(row.favorites_count)) ? 0 : Number(row.favorites_count) || 0,
        };
        
        if (reviewsCount > 0) {
          ratedBooks.push(bookItem);
        } else {
          unratedBooks.push(bookItem);
        }
      });
      
      // Sort rated books by: rating_avg DESC, favorites_count DESC
      // (RANDOM() in SQL already applied, but we'll shuffle unrated for variety)
      ratedBooks.sort((a, b) => {
        if (b.rating_avg !== a.rating_avg) {
          return b.rating_avg - a.rating_avg;
        }
        return b.favorites_count - a.favorites_count;
      });
      
      // Shuffle unrated books randomly
      for (let i = unratedBooks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unratedBooks[i], unratedBooks[j]] = [unratedBooks[j], unratedBooks[i]];
      }
      
      // Combine: rated books first, then fill remaining slots with unrated
      const needed = limitNum;
      items = ratedBooks.slice(0, needed);
      const remaining = needed - items.length;
      if (remaining > 0 && unratedBooks.length > 0) {
        items.push(...unratedBooks.slice(0, remaining));
      }
      
      // Apply offset if needed (for pagination)
      if (offsetNum > 0) {
        items = items.slice(offsetNum);
      }
    } else {
      // Default: no special ranking, just normalize fields
      items = (result.rows as any[]).map((row) => {
        const buyLink =
          row.buy_link !== undefined && row.buy_link !== null && row.buy_link !== ""
            ? row.buy_link
            : row.store_url ?? null;

        return {
          ...row,
          id: Number(row.id), // Ensure id is always a number
          buy_link: buyLink,
          description_tfidf: row.description_tfidf ?? null,
          series_id: row.series_id ? Number(row.series_id) : null,
          volume_no: row.volume_no ? Number(row.volume_no) : null,
          series_title: row.series_title || null,
          categories: Array.isArray(row.categories) ? row.categories : [],
        };
      });
    }

    return res.json({
      items,
      total,
      page: Math.floor(offsetNum / limitNum) + 1,
      limit: limitNum,
    });
  } catch (err) {
    console.error("getBooks error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/books/:id
 * Get a single book by ID with categories, ratings, and favorites
 */
export const getBookById = async (req: Request, res: Response) => {
  try {
    // Parse and validate ID - must be a positive integer
    const idParam = req.params.id;
    const id = Number(idParam);
    
    if (process.env.NODE_ENV === "development") {
      console.log("[getBookById] Request params.id:", idParam, "parsed id:", id);
      console.log("[getBookById] Request params:", req.params, "query:", req.query);
    }
    
    // Defensive validation: ensure id is a valid positive integer
    if (!Number.isInteger(id) || id <= 0 || Number.isNaN(id)) {
      if (process.env.NODE_ENV === "development") {
        console.log("[getBookById] Invalid id, returning 400");
      }
      return res.status(400).json({ message: "Invalid book id" });
    }

    // Fetch book with categories, ratings, and favorites
    // Fix: favorites table has composite key (user_id, book_id), no id column
    // Use COUNT(DISTINCT f.user_id) instead of COUNT(DISTINCT f.id)
    // Ensure all aggregates are properly cast and use COALESCE
    const result = await query(
      `
      SELECT
        b.id AS id,
        b.title,
        b.author,
        b.description,
        b.description_tfidf,
        b.publisher,
        b.cover_image,
        b.buy_link,
        COALESCE(
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), NULL),
          '{}'
        ) AS categories,
        COALESCE(AVG(r.rating), 0)::float AS rating_avg,
        COUNT(DISTINCT r.id)::int AS reviews_count,
        COUNT(DISTINCT f.user_id)::int AS favorites_count
      FROM books b
      LEFT JOIN book_categories bc ON bc.book_id = b.id
      LEFT JOIN categories c ON c.id = bc.category_id
      LEFT JOIN reviews r ON r.book_id = b.id
      LEFT JOIN favorites f ON f.book_id = b.id
      WHERE b.id = $1
      GROUP BY b.id, b.title, b.author, b.description, b.description_tfidf, b.publisher, b.cover_image, b.buy_link
      `,
      [id]
    );

    if (process.env.NODE_ENV === "development") {
      console.log("[getBookById] Query result rowCount:", result.rowCount);
      if ((result.rowCount ?? 0) > 0) {
        console.log("[getBookById] First row keys:", Object.keys(result.rows[0]));
        console.log("[getBookById] First row sample:", {
          id: result.rows[0].id,
          title: result.rows[0].title,
          rating_avg: result.rows[0].rating_avg,
          reviews_count: result.rows[0].reviews_count,
          favorites_count: result.rows[0].favorites_count,
        });
      }
    }

    if (result.rowCount === 0) {
      if (process.env.NODE_ENV === "development") {
        console.log("[getBookById] Book not found, returning 404");
      }
      return res.status(404).json({ message: "Book not found" });
    }

    const book = result.rows[0];
    
    if (process.env.NODE_ENV === "development") {
      console.log("[getBookById] Book found - raw book.id:", book.id, "type:", typeof book.id, "title:", book.title);
    }

    // Defensive check: ensure book.id exists and is valid
    const bookId = book.id ?? (book as any).book_id;
    if (!bookId || Number.isNaN(Number(bookId)) || Number(bookId) <= 0) {
      console.error("[getBookById] Book row has invalid id:", bookId, "book:", book);
      return res.status(500).json({ message: "Internal server error: invalid book data" });
    }

    // Increment views if views column exists (gracefully handle if column doesn't exist)
    try {
      await query(`UPDATE books SET views = COALESCE(views, 0) + 1 WHERE id = $1`, [id]);
    } catch (viewsErr) {
      // Views column might not exist, ignore error
      console.warn("Failed to increment views (column may not exist):", viewsErr);
    }

    // Format response
    const buyLink =
      book.buy_link !== undefined && book.buy_link !== null && book.buy_link !== ""
        ? book.buy_link
        : (book as any).store_url ?? null;

    // Standardize response format: return { item: {...} } to match list endpoint pattern
    // Ensure id is always a valid positive integer
    const numericId = Number(bookId);
    if (Number.isNaN(numericId) || !Number.isInteger(numericId) || numericId <= 0) {
      console.error("[getBookById] Failed to convert bookId to valid number:", bookId);
      return res.status(500).json({ message: "Internal server error: invalid book id" });
    }

    // Ensure categories is always an array (not null or undefined)
    const categories = Array.isArray(book.categories) 
      ? book.categories 
      : (book.categories ? [book.categories] : []);

    const bookItem = {
      id: numericId, // Ensure id is always a valid positive integer
      title: book.title || "",
      author: book.author || null,
      description: book.description || null,
      description_tfidf: book.description_tfidf ?? null,
      publisher: book.publisher || null,
      cover_image: book.cover_image || null,
      buy_link: buyLink,
      series_id: book.series_id ? Number(book.series_id) : null,
      volume_no: book.volume_no ? Number(book.volume_no) : null,
      series_title: book.series_title || null,
      categories: categories, // Always an array
      rating_avg: Number.isNaN(Number(book.rating_avg)) ? 0 : Number(book.rating_avg) || 0,
      reviews_count: Number.isNaN(Number(book.reviews_count)) ? 0 : Number(book.reviews_count) || 0,
      favorites_count: Number.isNaN(Number(book.favorites_count)) ? 0 : Number(book.favorites_count) || 0,
    };

    if (process.env.NODE_ENV === "development") {
      console.log("[getBookById] Returning response with item.id:", bookItem.id);
    }

    return res.json({ item: bookItem });
  } catch (err: any) {
    // Comprehensive error logging to identify the exact issue
    console.error("[getBookById] Error occurred:", err);
    console.error("[getBookById] Error message:", err?.message);
    console.error("[getBookById] Error stack:", err?.stack);
    console.error("[getBookById] Request params:", req.params);
    console.error("[getBookById] Request query:", req.query);
    
    // Log SQL-related errors if available
    if (err?.code) {
      console.error("[getBookById] PostgreSQL error code:", err.code);
    }
    if (err?.detail) {
      console.error("[getBookById] PostgreSQL error detail:", err.detail);
    }
    if (err?.hint) {
      console.error("[getBookById] PostgreSQL error hint:", err.hint);
    }
    
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/books/popular
 * Get popular books sorted by popularity score
 * Popularity score = (favorites_count * 3) + (reviews_count * 2) + avg_rating
 * Query params: limit (number), timeframe (week|month|all, default: all)
 */
export const getPopularBooks = async (req: Request, res: Response) => {
  try {
    // Parse limit safely: ensure it's between 1 and 50
    const rawLimit = Number(req.query.limit) || 12;
    const limit = Math.max(1, Math.min(50, Math.floor(rawLimit)));

    // Parse timeframe: week, month, or all (default: all)
    const timeframe = req.query.timeframe === "week" || req.query.timeframe === "month" 
      ? req.query.timeframe 
      : "all";

    if (process.env.NODE_ENV === "development") {
      console.log("[getPopularBooks] Request received with limit:", limit, "timeframe:", timeframe);
    }

    // Build SQL query with popularity score formula:
    // score = (favorite_count * 3) + (review_count * 2) + avg_rating
    let sql = "";
    
    if (timeframe === "week" || timeframe === "month") {
      const days = timeframe === "week" ? 7 : 30;
      // Use subqueries with WHERE clauses to filter by timeframe
      sql = `
      SELECT
        b.id AS id,
        b.title,
        b.author,
        b.cover_image,
        COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name), NULL), '{}') AS categories,
        COALESCE(
          (SELECT AVG(r2.rating) FROM reviews r2 WHERE r2.book_id = b.id AND r2.created_at >= NOW() - INTERVAL '${days} days'),
          0
        )::float AS rating_avg,
        COALESCE(
          (SELECT COUNT(*)::int FROM reviews r2 WHERE r2.book_id = b.id AND r2.created_at >= NOW() - INTERVAL '${days} days'),
          0
        ) AS reviews_count,
        COALESCE(
          (SELECT COUNT(DISTINCT f2.user_id)::int FROM favorites f2 WHERE f2.book_id = b.id AND f2.created_at >= NOW() - INTERVAL '${days} days'),
          0
        ) AS favorites_count,
        (
          COALESCE(
            (SELECT COUNT(DISTINCT f2.user_id)::int FROM favorites f2 WHERE f2.book_id = b.id AND f2.created_at >= NOW() - INTERVAL '${days} days'),
            0
          ) * 3 +
          COALESCE(
            (SELECT COUNT(*)::int FROM reviews r2 WHERE r2.book_id = b.id AND r2.created_at >= NOW() - INTERVAL '${days} days'),
            0
          ) * 2 +
          COALESCE(
            (SELECT AVG(r2.rating) FROM reviews r2 WHERE r2.book_id = b.id AND r2.created_at >= NOW() - INTERVAL '${days} days'),
            0
          )
        )::float AS popularity_score
      FROM books b
      LEFT JOIN book_categories bc ON bc.book_id = b.id
      LEFT JOIN categories c ON c.id = bc.category_id
      GROUP BY b.id, b.title, b.author, b.cover_image
      ORDER BY popularity_score DESC, b.created_at DESC
      LIMIT $1
      `;
    } else {
      // For "all", use JOINs for better performance
      sql = `
      SELECT
        b.id AS id,
        b.title,
        b.author,
        b.cover_image,
        COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name), NULL), '{}') AS categories,
        COALESCE(AVG(r.rating), 0)::float AS rating_avg,
        COALESCE(COUNT(DISTINCT r.id), 0)::int AS reviews_count,
        COALESCE(COUNT(DISTINCT f.user_id), 0)::int AS favorites_count,
        (
          COALESCE(COUNT(DISTINCT f.user_id), 0) * 3 +
          COALESCE(COUNT(DISTINCT r.id), 0) * 2 +
          COALESCE(AVG(r.rating), 0)
        )::float AS popularity_score
      FROM books b
      LEFT JOIN book_categories bc ON bc.book_id = b.id
      LEFT JOIN categories c ON c.id = bc.category_id
      LEFT JOIN reviews r ON r.book_id = b.id
      LEFT JOIN favorites f ON f.book_id = b.id
      GROUP BY b.id, b.title, b.author, b.cover_image, b.created_at
      ORDER BY popularity_score DESC, b.created_at DESC
      LIMIT $1
      `;
    }
    
    if (process.env.NODE_ENV === "development") {
      console.log("[getPopularBooks] Using popularity score (favorites + reviews)");
    }

    const result = await query(sql, [limit]);

    // Map results with defensive parsing to handle NULL/NaN values
    const items = result.rows.map((row: any) => {
      const bookId = row.id ?? row.book_id;
      const numericId = Number(bookId);
      
      return {
        id: Number.isNaN(numericId) || numericId <= 0 ? null : numericId,
        title: row.title || "",
        author: row.author || null,
        cover_image: row.cover_image || null,
        categories: Array.isArray(row.categories) ? row.categories : [],
        rating_avg: Number.isNaN(Number(row.rating_avg)) ? 0 : Number(row.rating_avg) || 0,
        reviews_count: Number.isNaN(Number(row.reviews_count)) ? 0 : Number(row.reviews_count) || 0,
        favorites_count: Number.isNaN(Number(row.favorites_count)) ? 0 : Number(row.favorites_count) || 0,
      };
    }).filter((item) => item.id !== null); // Filter out items with invalid IDs

    if (process.env.NODE_ENV === "development") {
      console.log("[getPopularBooks] Returning", items.length, "items");
    }

    return res.json({ items });
  } catch (err: any) {
    console.error("[getPopularBooks] Error:", err);
    if (process.env.NODE_ENV === "development") {
      console.error("[getPopularBooks] Error details:", err.message, err.stack);
    }
    
    // Fallback to simple query: return newest books
    try {
      if (process.env.NODE_ENV === "development") {
        console.log("[getPopularBooks] Fallback to newest books");
      }
      
      const rawLimit = Number(req.query.limit) || 12;
      const limit = Math.max(1, Math.min(50, Math.floor(rawLimit)));
      
      const fallbackSql = `
        SELECT
          b.id AS id,
          b.title,
          b.author,
          b.cover_image,
          COALESCE(ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name), NULL), '{}') AS categories,
          0::float AS rating_avg,
          0::int AS reviews_count,
          0::int AS favorites_count
        FROM books b
        LEFT JOIN book_categories bc ON bc.book_id = b.id
        LEFT JOIN categories c ON c.id = bc.category_id
        GROUP BY b.id, b.title, b.author, b.cover_image
        ORDER BY b.created_at DESC
        LIMIT $1
      `;
      
      const fallbackResult = await query(fallbackSql, [limit]);
      
      const items = fallbackResult.rows.map((row: any) => ({
        id: Number(row.id) || 0,
        title: row.title || "",
        author: row.author || null,
        cover_image: row.cover_image || null,
        categories: Array.isArray(row.categories) ? row.categories : [],
        rating_avg: 0,
        reviews_count: 0,
        favorites_count: 0,
      })).filter((item) => item.id > 0);
      
      return res.json({ items });
    } catch (fallbackErr) {
      console.error("[getPopularBooks] Fallback query also failed:", fallbackErr);
      return res.json({ items: [] });
    }
  }
};

/**
 * POST /api/books
 * Create a new book (admin only)
 */
export const createBook = async (req: Request, res: Response) => {
  try {
    // req.body is already validated by Zod schema
    const { title, author, publisher, description, description_tfidf, buy_link, categoryIds, series_title, volume_no } = req.body;
    
    // categoryIds is already validated and transformed to number[] by Zod
    const categoryIdsArray: number[] = categoryIds;

    // Handle cover image file path
    let coverImagePath: string | null = null;
    if (req.file) {
      // File is saved to backend/uploads/books/, store path as /books/filename
      coverImagePath = `/books/${req.file.filename}`;
    }

    // Handle description_tfidf: if missing/empty, fallback to description
    // FormData may send undefined (field not present) or empty string (field present but empty)
    const descriptionTfIdfValue = (description_tfidf && description_tfidf.trim())
      ? description_tfidf.trim()
      : (description?.trim() || null);
    const descriptionValue = description?.trim() || null;

    // Handle series: determine seriesTitleFinal
    // If series_title exists and not empty -> use that, else fallback to book.title
    const seriesTitleFinal = (series_title && typeof series_title === "string" && series_title.trim() !== "")
      ? series_title.trim()
      : title.trim();
    
    // Get or create series_id
    const seriesId = await getOrCreateSeriesIdByTitle(seriesTitleFinal);

    // Handle volume_no: if missing, try to extract from title
    let volumeNoValue: number | null = null;
    if (volume_no !== undefined && volume_no !== null && volume_no !== "") {
      const parsed = typeof volume_no === "string" ? parseInt(volume_no, 10) : Number(volume_no);
      if (!Number.isNaN(parsed) && parsed > 0) {
        volumeNoValue = parsed;
      }
    } else {
      // Try to extract from title
      volumeNoValue = extractVolumeNoFromTitle(title) || null;
    }

    // Insert book
    const bookResult = await query(
      `
      INSERT INTO books (title, author, publisher, description, description_tfidf, cover_image, buy_link, series_id, volume_no)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, title, author, publisher, description, description_tfidf, cover_image, buy_link, series_id, volume_no
      `,
      [
        title.trim(),
        author?.trim() || null,
        publisher?.trim() || null,
        descriptionValue,
        descriptionTfIdfValue,
        coverImagePath,
        buy_link?.trim() || null,
        seriesId,
        volumeNoValue,
      ]
    );

    const book = bookResult.rows[0];
    const bookId = book.id;

    // Insert book_categories relationships
    for (const categoryId of categoryIdsArray) {
      await query(
        `
        INSERT INTO book_categories (book_id, category_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        `,
        [bookId, categoryId]
      );
    }

    // Log admin activity
    try {
      await createAdminActivity({
        type: "book",
        action: "create",
        description: `เพิ่มหนังสือ "${book.title}"`,
        ref_id: bookId,
      });
    } catch (activityErr) {
      console.warn("Failed to log admin activity:", activityErr);
    }

    return res.status(201).json(book);
  } catch (err) {
    console.error("createBook error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * PUT /api/books/:id
 * Update a book (admin only)
 */
export const updateBook = async (req: Request, res: Response) => {
  try {
    // req.params.id is already validated and transformed to number by Zod
    const id = req.params.id;
    
    // req.body is already validated by Zod schema
    const { title, author, publisher, description, description_tfidf, buy_link, categoryIds, series_title, volume_no } = req.body;
    
    // categoryIds is already validated and transformed to number[] by Zod
    const categoryIdsArray: number[] = categoryIds;

    // Check if book exists and get old cover_image and series_id
    const existingResult = await query("SELECT id, title, cover_image, series_id FROM books WHERE id = $1", [id]);
    if (existingResult.rowCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    const oldCoverImage = existingResult.rows[0].cover_image;
    const existingSeriesId = existingResult.rows[0].series_id;

    // Handle cover image file path (only update if new file is provided)
    let coverImageUpdate = "";
    const params: any[] = [title.trim(), author?.trim() || null, publisher?.trim() || null, description?.trim() || null, buy_link?.trim() || null];
    let paramIndex = 6;
    
    // Handle description_tfidf: only update if provided (not undefined)
    // FormData sends empty string if field exists but is empty, undefined if field is missing
    let descriptionTfIdfUpdate = "";
    if (description_tfidf !== undefined) {
      // Field was provided (even if empty string from FormData)
      const trimmedTfIdf = (description_tfidf || "").trim();
      // Set to trimmed value (empty string becomes NULL)
      const valueToSet = trimmedTfIdf !== "" ? trimmedTfIdf : null;
      params.push(valueToSet);
      descriptionTfIdfUpdate = `, description_tfidf = $${paramIndex}`;
      paramIndex++;
    }
    // If description_tfidf is not provided (undefined), don't update it (keep existing value)

    // Handle series: only update if series_title exists in request AND trim not empty
    let seriesUpdate = "";
    if (series_title !== undefined && series_title !== null && typeof series_title === "string" && series_title.trim() !== "") {
      const seriesId = await getOrCreateSeriesIdByTitle(series_title.trim());
      params.push(seriesId);
      seriesUpdate = `, series_id = $${paramIndex}`;
      paramIndex++;
    }
    // Else keep existing series_id unchanged

    // Handle volume_no: if provided and valid int -> update volume_no
    let volumeNoUpdate = "";
    if (volume_no !== undefined && volume_no !== null && volume_no !== "") {
      const parsed = typeof volume_no === "string" ? parseInt(volume_no, 10) : Number(volume_no);
      if (!Number.isNaN(parsed) && parsed > 0) {
        params.push(parsed);
        volumeNoUpdate = `, volume_no = $${paramIndex}`;
        paramIndex++;
      }
    }
    // If not provided or invalid -> keep unchanged

    if (req.file) {
      const coverImagePath = `/books/${req.file.filename}`;
      params.push(coverImagePath);
      coverImageUpdate = `, cover_image = $${paramIndex}`;
      paramIndex++;
      
      // Delete old cover image if it exists
      if (oldCoverImage) {
        try {
          await cleanupUploadsFile(oldCoverImage, "books");
        } catch (cleanupErr) {
          // Log but don't fail the request if cleanup fails
          console.warn("Failed to cleanup old cover image:", cleanupErr);
        }
      }
    }

    params.push(id);

    // Update book
    const updateResult = await query(
      `
      UPDATE books
      SET title = $1,
          author = $2,
          publisher = $3,
          description = $4,
          buy_link = $5
          ${descriptionTfIdfUpdate}
          ${seriesUpdate}
          ${volumeNoUpdate}
          ${coverImageUpdate}
      WHERE id = $${paramIndex}
      RETURNING id, title, author, publisher, description, description_tfidf, cover_image, buy_link, series_id, volume_no
      `,
      params
    );

    const book = updateResult.rows[0];

    // Update book_categories relationships (delete old, insert new)
    await query("DELETE FROM book_categories WHERE book_id = $1", [id]);

    for (const categoryId of categoryIdsArray) {
      await query(
        `
        INSERT INTO book_categories (book_id, category_id)
        VALUES ($1, $2)
        `,
        [id, categoryId]
      );
    }

    // Log admin activity
    try {
      await createAdminActivity({
        type: "book",
        action: "update",
        description: `แก้ไขหนังสือ "${book.title}"`,
        ref_id: Number(id),
      });
    } catch (activityErr) {
      console.warn("Failed to log admin activity:", activityErr);
    }

    return res.json(book);
  } catch (err) {
    console.error("updateBook error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * DELETE /api/books/:id
 * Delete a book (admin only)
 */
export const deleteBook = async (req: Request, res: Response) => {
  try {
    // req.params.id is already validated and transformed to number by Zod
    const id = req.params.id;

    // Check if book exists and get title and cover_image for cleanup/activity log
    const existingResult = await query("SELECT id, title, cover_image FROM books WHERE id = $1", [id]);
    if (existingResult.rowCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    const bookTitle = existingResult.rows[0].title;
    const coverImage = existingResult.rows[0].cover_image;

    // Delete related records (cascade should handle this, but being explicit)
    await query("DELETE FROM book_categories WHERE book_id = $1", [id]);
    // Note: reviews and favorites might have foreign key constraints
    // If CASCADE DELETE is set, these will be deleted automatically
    // Otherwise, you may need to delete them first or handle the error

    // Delete book
    await query("DELETE FROM books WHERE id = $1", [id]);

    // Delete cover image file if it exists
    if (coverImage) {
      try {
        await cleanupUploadsFile(coverImage, "books");
      } catch (cleanupErr) {
        // Log but don't fail the request if cleanup fails (book is already deleted from DB)
        console.warn("Failed to cleanup cover image after book deletion:", cleanupErr);
      }
    }

    // Log admin activity
    try {
      await createAdminActivity({
        type: "book",
        action: "delete",
        description: `ลบหนังสือ "${bookTitle}"`,
        ref_id: Number(id),
      });
    } catch (activityErr) {
      console.warn("Failed to log admin activity:", activityErr);
    }

    return res.json({ message: "Book deleted successfully" });
  } catch (err) {
    console.error("deleteBook error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
