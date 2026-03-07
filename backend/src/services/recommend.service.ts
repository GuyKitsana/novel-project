import { query } from "../db";
import {
  computeTfIdfVectors,
  type BookDocument,
  type SparseVector,
  type TfIdfResult,
} from "../utils/tfidf";
import {
  cosineSimilarity,
  findSimilarBooks,
} from "../utils/similarity";

export interface BookWithMetadata {
  id: number;
  title: string;
  author?: string | null;
  publisher?: string | null;
  description?: string | null;
  description_tfidf?: string | null;
  cover_image?: string | null;
  buy_link?: string | null;
  categories: string[];
  rating_avg?: number;
  reviews_count?: number;
  favorites_count?: number;
  similarity?: number;
  reason?: string;
  series_id?: number | null;
  volume_no?: number | null;
  is_next_volume_recommendation?: boolean;
}

let tfIdfCache: {
  result: TfIdfResult | null;
  lastBuiltAt: number;
  lastBookUpdatedAt: number | null;
} = {
  result: null,
  lastBuiltAt: 0,
  lastBookUpdatedAt: null,
};


async function getLastBookUpdateTime(): Promise<number> {
  try {
    const result = await query(`
      SELECT COALESCE(MAX(GREATEST(
        b.updated_at,
        COALESCE(MAX(bc_times.max_bc_time), '1970-01-01'::timestamp)
      )), '1970-01-01'::timestamp) AS max_updated_at
      FROM books b
      LEFT JOIN (
        SELECT book_id, MAX(created_at) AS max_bc_time
        FROM book_categories
        GROUP BY book_id
      ) bc_times ON bc_times.book_id = b.id
    `);

    const maxTime = result.rows[0]?.max_updated_at;
    if (maxTime) {
      return new Date(maxTime).getTime();
    }
    return 0;
  } catch (err) {
    console.error("[recommend.service] Error getting last book update time:", err);
    return 0;
  }
}


async function fetchAllBooksForTfIdf(): Promise<BookDocument[]> {
  const result = await query(`
    SELECT
      b.id,
      b.title,
      b.description,
      b.description_tfidf,
      COALESCE(
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT c.name) FILTER (WHERE c.name IS NOT NULL), NULL),
        '{}'
      ) AS categories
    FROM books b
    LEFT JOIN book_categories bc ON bc.book_id = b.id
    LEFT JOIN categories c ON c.id = bc.category_id
    GROUP BY b.id, b.title, b.description, b.description_tfidf
    ORDER BY b.id
  `);

  return result.rows.map((row: any) => ({
    id: Number(row.id),
    title: row.title || "",
    description: row.description || null,
    description_tfidf: row.description_tfidf || null,
    categories: Array.isArray(row.categories) ? row.categories : [],
  }));
}


export async function getTfIdfVectors(): Promise<TfIdfResult> {
  const now = Date.now();
  const lastBookUpdate = await getLastBookUpdateTime();

  if (
    !tfIdfCache.result ||
    !tfIdfCache.lastBookUpdatedAt ||
    lastBookUpdate > tfIdfCache.lastBookUpdatedAt
  ) {
    const books = await fetchAllBooksForTfIdf();
    const result = computeTfIdfVectors(books);

    tfIdfCache = {
      result,
      lastBuiltAt: now,
      lastBookUpdatedAt: lastBookUpdate,
    };
  }

  return tfIdfCache.result!;
}

export function resetTfIdfCacheForDebug(): void {
  tfIdfCache = {
    result: null,
    lastBuiltAt: 0,
    lastBookUpdatedAt: null,
  };
}


async function fetchUserFavorites(userId: number): Promise<Set<number>> {
  const result = await query(
    `SELECT book_id FROM favorites WHERE user_id = $1`,
    [userId]
  );
  return new Set(result.rows.map((row: any) => Number(row.book_id)));
}


async function fetchUserReviews(
  userId: number
): Promise<Map<number, number>> {
  const result = await query(
    `SELECT book_id, rating FROM reviews WHERE user_id = $1`,
    [userId]
  );
  const reviewMap = new Map<number, number>();
  for (const row of result.rows as any[]) {
    reviewMap.set(Number(row.book_id), Number(row.rating));
  }
  return reviewMap;
}


async function fetchUserCategories(userId: number): Promise<Set<number>> {
  const result = await query(
    `SELECT category_id FROM user_categories WHERE user_id = $1`,
    [userId]
  );
  const categoryIds = new Set<number>(result.rows.map((row: any) => Number(row.category_id)));

  // DEBUG: Always log categories retrieved from database (not just in non-production)
  const categoryArray = Array.from(categoryIds);
  if (categoryArray.length > 0) {
    const placeholders = categoryArray.map((_, i) => `$${i + 1}`).join(", ");
    const categoryInfoResult = await query(
      `SELECT id, name, code FROM categories WHERE id IN (${placeholders})`,
      categoryArray
    );
    console.log("[RECOMMEND DEBUG] User categories retrieved from database:", {
      userId,
      categoryIds: categoryArray,
      categoryNames: categoryInfoResult.rows.map((r: any) => ({ id: r.id, name: r.name, code: r.code })),
      count: categoryArray.length,
    });
  } else {
    console.log("[RECOMMEND DEBUG] User categories retrieved from database:", {
      userId,
      categoryIds: [],
      message: "No categories found for user",
      rawRows: result.rows,
    });
  }
  
  return categoryIds;
}


function isMissingRelation(err: any, relName: string): boolean {
  const msg = String(err?.message || "");
  const code = String(err?.code || "");
  return (
    msg.includes(`relation "${relName}" does not exist`) ||
    msg.includes(`relation ${relName} does not exist`) ||
    msg.includes(`table "${relName}" does not exist`) ||
    msg.includes(`table ${relName} does not exist`) ||
    code === "42P01" // PostgreSQL error code สำหรับ undefined_table
  );
}

async function getSeenAndSeriesProgress(
  userId: number
): Promise<{
  seenBookIds: Set<number>;
  seriesMaxVolume: Map<number, number>;
}> {

  const seenBookIds = new Set<number>();
  const seriesMaxVolume = new Map<number, number>();

  try {
    const favoritesResult = await query(
      `
      SELECT f.book_id, b.series_id, b.volume_no
      FROM favorites f
      JOIN books b ON b.id = f.book_id
      WHERE f.user_id = $1
      `,
      [userId]
    );

    for (const row of favoritesResult.rows) {
      const bookId = Number(row.book_id);
      seenBookIds.add(bookId);

      const seriesId = row.series_id != null ? Number(row.series_id) : null;
      const vol = row.volume_no != null ? Number(row.volume_no) : null;
      if (seriesId !== null && vol !== null) {
        const prev = seriesMaxVolume.get(seriesId) ?? 0;
        if (vol > prev) {
          seriesMaxVolume.set(seriesId, vol);
        }
      }
    }

    // LOG ชั่วคราว: ติดตามความคืบหน้าซีรีส์ (เฉพาะ non-production)
    if (process.env.NODE_ENV !== "production") {
      console.log("[RECOMMEND DEBUG] Series progress (favorites only):", {
        userId,
        favoritesCount: seenBookIds.size,
        seriesProgress: Array.from(seriesMaxVolume.entries()).map(([seriesId, maxVol]) => ({
          seriesId,
          maxFavoritedVolume: maxVol,
        })),
      });
    }
  } catch (err) {
    console.error("[getSeenAndSeriesProgress] Error:", err);
    if (err instanceof Error) {
      console.error("[getSeenAndSeriesProgress] Stack:", err.stack);
    }
    // คืนค่า empty sets เมื่อเกิด error (graceful degradation - ไม่ให้ endpoint crash)
  }

  return { seenBookIds, seriesMaxVolume };
}


async function getNextVolumeCandidates(
  seriesMaxVolume: Map<number, number>,
  seenBookIds: Set<number>
): Promise<Set<number>> {
  const nextVolumeBookIds = new Set<number>();

  if (seriesMaxVolume.size === 0) {
    return nextVolumeBookIds;
  }

  try {
    // สร้าง map ของ series_id -> next volume ที่คาดหวัง
    const expectedVolumes = new Map<number, number>();
    for (const [seriesId, maxVol] of seriesMaxVolume.entries()) {
      expectedVolumes.set(seriesId, maxVol + 1);
    }

    // สำหรับแต่ละซีรีส์ query หาหนังสือที่เป็น next volume
    const seriesIds = Array.from(seriesMaxVolume.keys());
    
    if (seriesIds.length === 0) {
      return nextVolumeBookIds;
    }

    const excludeArray = Array.from(seenBookIds);
    
    // สร้าง query ด้วย parameterized arrays ที่ถูกต้อง
    let queryText: string;
    let queryParams: any[];

    if (excludeArray.length > 0) {
      queryText = `
        SELECT b.id, b.series_id, b.volume_no
        FROM books b
        WHERE b.series_id = ANY($1::int[])
          AND b.id != ALL($2::int[])
      `;
      queryParams = [seriesIds, excludeArray];
    } else {
      queryText = `
        SELECT b.id, b.series_id, b.volume_no
        FROM books b
        WHERE b.series_id = ANY($1::int[])
      `;
      queryParams = [seriesIds];
    }

    const result = await query(queryText, queryParams);

    // ตรวจสอบหนังสือไหนตรงกับ next volume
    for (const row of result.rows) {
      const bookId = Number(row.id);
      const seriesId = Number(row.series_id);
      const volumeNo = row.volume_no ? Number(row.volume_no) : null;

      if (volumeNo === null) continue;

      const expectedVol = expectedVolumes.get(seriesId);
      if (expectedVol !== undefined && volumeNo === expectedVol) {
        nextVolumeBookIds.add(bookId);
      }
    }
  } catch (err) {
    console.error("[getNextVolumeCandidates] Error:", err);
    // คืนค่า empty set เมื่อเกิด error (graceful degradation)
  }

  return nextVolumeBookIds;
}


const DEFAULT_TOP_K = 10;
const DEFAULT_MAX_PER_CATEGORY_IN_TOP_K = 2;

async function fetchCategoryIdsByBookIds(
  bookIds: number[]
): Promise<Map<number, number[]>> {
  const categoryIdsByBookId = new Map<number, number[]>();

  if (bookIds.length === 0) {
    return categoryIdsByBookId;
  }

  try {
    const result = await query(
      `
      SELECT bc.book_id, bc.category_id
      FROM public.book_categories bc
      WHERE bc.book_id = ANY($1::int[])
      ORDER BY bc.book_id, bc.category_id ASC
      `,
      [bookIds]
    );

    for (const row of result.rows) {
      const bookId = Number(row.book_id);
      const categoryId = Number(row.category_id);

      if (!categoryIdsByBookId.has(bookId)) {
        categoryIdsByBookId.set(bookId, []);
      }
      categoryIdsByBookId.get(bookId)!.push(categoryId);
    }
  } catch (err) {
    console.error("[fetchCategoryIdsByBookIds] Error:", err);
    // คืนค่า empty map เมื่อเกิด error (graceful degradation)
  }

  return categoryIdsByBookId;
}


function applyTopKCategoryDiversity(options: {
  ranked: BookWithMetadata[];
  categoryIdsByBookId: Map<number, number[]>;
  seenBookIds: Set<number>;
  limit: number;
  topK: number;
  maxPerCategoryInTopK: number;
}): BookWithMetadata[] {
  let { ranked, categoryIdsByBookId, seenBookIds, limit, topK, maxPerCategoryInTopK } = options;

  // Safety: ensure inputs are valid
  if (!ranked || !Array.isArray(ranked)) {
    return [];
  }
  if (!categoryIdsByBookId) {
    categoryIdsByBookId = new Map();
  }
  if (!seenBookIds) {
    seenBookIds = new Set<number>();
  }
  if (!limit || limit < 0) {
    return ranked;
  }
  if (!topK || topK < 0) {
    topK = DEFAULT_TOP_K;
  }

  const pickTop: BookWithMetadata[] = [];
  const fillRest: BookWithMetadata[] = [];
  const categoryCountsInTopK = new Map<number, number>(); // ติดตามจำนวนเฉพาะ top K
  const usedSeriesIds = new Set<number>();
  const pickedBookIds = new Set<number>();

  // Helper สำหรับดึง primary category ID ของหนังสือ
  const getPrimaryCategoryId = (bookId: number): number | null => {
    const categoryIds = categoryIdsByBookId.get(bookId);
    if (!categoryIds || categoryIds.length === 0) {
      return null; // ไม่มีหมวดหมู่ = ข้ามการจำกัด
    }
    return categoryIds[0]; // Primary = หมวดหมู่แรก (เรียงจากน้อยไปมาก, stable)
  };

  // ขั้นตอน A: สร้าง TOP K พร้อมบังคับใช้การจำกัดหมวดหมู่
  for (const book of ranked) {
    if (pickTop.length >= topK) break;
    if (pickedBookIds.has(book.id)) continue;
    if (seenBookIds.has(book.id)) continue;

    // Respect series dedupe
    const seriesId = book.series_id;
    if (seriesId !== null && seriesId !== undefined) {
      if (usedSeriesIds.has(seriesId)) {
        continue; // Skip if series already represented
      }
    }

    // ตรวจสอบการจำกัดหมวดหมู่ (เฉพาะ top K)
    const primaryCategoryId = getPrimaryCategoryId(book.id);
    if (primaryCategoryId !== null) {
      const currentCount = categoryCountsInTopK.get(primaryCategoryId) || 0;
      if (currentCount >= maxPerCategoryInTopK) {
        continue; // ข้ามถ้าถึงขีดจำกัดหมวดหมู่ใน top K แล้ว
      }
    }

    // เลือกหนังสือเล่มนี้สำหรับ top K
    pickTop.push(book);
    pickedBookIds.add(book.id);
    if (seriesId !== null && seriesId !== undefined) {
      usedSeriesIds.add(seriesId);
    }
    if (primaryCategoryId !== null) {
      categoryCountsInTopK.set(primaryCategoryId, (categoryCountsInTopK.get(primaryCategoryId) || 0) + 1);
    }
  }

  // ขั้นตอน B: เติมตำแหน่งที่เหลือ (topK+1 ถึง limit) โดยไม่จำกัดหมวดหมู่
  for (const book of ranked) {
    const totalPicked = pickTop.length + fillRest.length;
    if (totalPicked >= limit) break;
    if (pickedBookIds.has(book.id)) continue;
    if (seenBookIds.has(book.id)) continue;

    // เคารพ series dedupe (ยังบังคับใช้อยู่)
    const seriesId = book.series_id;
    if (seriesId !== null && seriesId !== undefined) {
      if (usedSeriesIds.has(seriesId)) {
        continue; // Skip if series already represented
      }
    }

    // เลือกหนังสือเล่มนี้สำหรับตำแหน่งที่เหลือ (ไม่ตรวจสอบการจำกัดหมวดหมู่)
    fillRest.push(book);
    pickedBookIds.add(book.id);
    if (seriesId !== null && seriesId !== undefined) {
      usedSeriesIds.add(seriesId);
    }
  }

  // รวมและตัดให้เหลือตาม limit
  const finalResults = [...pickTop, ...fillRest].slice(0, limit);
  return finalResults;
}


function applySeriesDedupeAndNextVolumeRule(
  rankedBooks: BookWithMetadata[],
  nextVolumeBookIds: Set<number>,
  seenBookIds: Set<number>,
  limit: number
): BookWithMetadata[] {

  if (!rankedBooks || !Array.isArray(rankedBooks)) {
    return [];
  }
  if (!nextVolumeBookIds) {
    nextVolumeBookIds = new Set<number>();
  }
  if (!seenBookIds) {
    seenBookIds = new Set<number>();
  }
  if (!limit || limit < 0) {
    limit = 20;
  }

  const result: BookWithMetadata[] = [];
  const usedSeriesIds = new Set<number>();
  const usedBookIds = new Set<number>();

  for (const book of rankedBooks) {
    if (result.length >= limit) break;
    if (usedBookIds.has(book.id)) continue;
    if (seenBookIds.has(book.id)) continue;
    if (!nextVolumeBookIds.has(book.id)) continue; // เฉพาะหนังสือที่เป็น next volume ในขั้นแรก

    const seriesId = book.series_id;

    // ถ้าหนังสืออยู่ในซีรีส์ ตรวจสอบว่าเรามีจากซีรีส์นี้แล้วหรือยัง
    if (seriesId !== null && seriesId !== undefined) {
      if (usedSeriesIds.has(seriesId)) {
        continue; // ข้ามถ้าซีรีส์นี้มีอยู่แล้ว (next volume ควรเป็น unique ต่อซีรีส์)
      }
      usedSeriesIds.add(seriesId);
    }

    result.push({
      ...book,
      is_next_volume_recommendation: true,
    });
    usedBookIds.add(book.id);
  }

  // ขั้นสอง: เติมตำแหน่งที่เหลือด้วยหนังสืออื่น (เคารพ series dedupe)
  for (const book of rankedBooks) {
    if (result.length >= limit) break;
    if (usedBookIds.has(book.id)) continue;
    if (seenBookIds.has(book.id)) continue;

    const seriesId = book.series_id;

    // ถ้าหนังสืออยู่ในซีรีส์และเรามีจากซีรีส์นี้แล้ว ให้ข้าม
    if (seriesId !== null && seriesId !== undefined) {
      if (usedSeriesIds.has(seriesId)) {
        continue;
      }
      usedSeriesIds.add(seriesId);
    }

    result.push({
      ...book,
      is_next_volume_recommendation: false,
    });
    usedBookIds.add(book.id);
  }

  return result;
}

/**
 * ดึงหนังสือพร้อม metadata เต็มรูปแบบ (สำหรับผลลัพธ์สุดท้าย)
 */
async function fetchBooksWithMetadata(
  bookIds: number[]
): Promise<Map<number, BookWithMetadata>> {
  if (bookIds.length === 0) {
    return new Map();
  }

  const placeholders = bookIds.map((_, i) => `$${i + 1}`).join(", ");
  const result = await query(
    `
    SELECT
      b.id,
      b.title,
      b.author,
      b.publisher,
      b.description,
      b.cover_image,
      b.buy_link,
      b.created_at,
      b.series_id,
      b.volume_no,
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
    WHERE b.id IN (${placeholders})
    GROUP BY b.id, b.title, b.author, b.publisher, b.description, b.cover_image, b.buy_link, b.created_at, b.series_id, b.volume_no
    `,
    bookIds
  );

  const bookMap = new Map<number, BookWithMetadata>();
  for (const row of result.rows) {
    const bookId = Number(row.id);
    const book: any = {
      id: bookId,
      title: row.title || "",
      author: row.author,
      publisher: row.publisher,
      description: row.description,
      cover_image: row.cover_image,
      buy_link: row.buy_link,
      categories: Array.isArray(row.categories) ? row.categories : [],
      rating_avg: Number(row.rating_avg) || 0,
      reviews_count: Number(row.reviews_count) || 0,
      favorites_count: Number(row.favorites_count) || 0,
      series_id: row.series_id ? Number(row.series_id) : null,
      volume_no: row.volume_no ? Number(row.volume_no) : null,
    };
    // รวม created_at สำหรับ tie-breaking (ไม่อยู่ใน interface แต่จำเป็นสำหรับการเรียง)
    if (row.created_at) {
      book.created_at = row.created_at;
    }
    bookMap.set(bookId, book);
  }

  return bookMap;
}

/**
 * ขั้นที่ 1: แนะนำตามหมวดหมู่ (Cold Start)
 * คืนค่าหนังสือยอดนิยมจากหมวดหมู่ที่ผู้ใช้เลือก
 */
async function getCategoryBasedRecommendations(
  userCategoryIds: Set<number>,
  excludeBookIds: Set<number>,
  limit: number
): Promise<Array<{ bookId: number; reason: string }>> {
  if (userCategoryIds.size === 0) {
    return [];
  }

  const categoryArray = Array.from(userCategoryIds);
  const excludeArray = Array.from(excludeBookIds);

  // DEBUG: Log query parameters
  console.log("[RECOMMEND DEBUG] Category-based query parameters:", {
    categoryIds: categoryArray,
    excludeBookIds: excludeArray,
    limit,
  });

  let queryText: string;
  let queryParams: any[];

  if (excludeArray.length > 0) {
    queryText = `
      SELECT DISTINCT b.id
      FROM books b
      INNER JOIN book_categories bc ON bc.book_id = b.id
      LEFT JOIN reviews r ON r.book_id = b.id
      LEFT JOIN favorites f ON f.book_id = b.id
      WHERE bc.category_id = ANY($1::int[])
        AND b.id != ALL($2::int[])
      GROUP BY b.id
      ORDER BY
        (
          COALESCE(COUNT(DISTINCT f.user_id), 0) * 3 +
          COALESCE(COUNT(DISTINCT r.id), 0) * 2 +
          COALESCE(AVG(r.rating), 0)
        ) DESC,
        b.created_at DESC
      LIMIT $3
    `;
    queryParams = [categoryArray, excludeArray, limit];
  } else {
    queryText = `
      SELECT DISTINCT b.id
      FROM books b
      INNER JOIN book_categories bc ON bc.book_id = b.id
      LEFT JOIN reviews r ON r.book_id = b.id
      LEFT JOIN favorites f ON f.book_id = b.id
      WHERE bc.category_id = ANY($1::int[])
      GROUP BY b.id
      ORDER BY
        (
          COALESCE(COUNT(DISTINCT f.user_id), 0) * 3 +
          COALESCE(COUNT(DISTINCT r.id), 0) * 2 +
          COALESCE(AVG(r.rating), 0)
        ) DESC,
        b.created_at DESC
      LIMIT $2
    `;
    queryParams = [categoryArray, limit];
  }


  const result = await query(queryText, queryParams);

  // DEBUG: Log query results and verify books have categories
  const bookIds = result.rows.map((r: any) => Number(r.id));
  console.log("[RECOMMEND DEBUG] Category-based query results:", {
    rowsReturned: result.rows.length,
    bookIds: bookIds,
    categoryIds: categoryArray,
  });

  // DEBUG: If no results, check if there are any books in these categories at all
  if (bookIds.length === 0) {
    const checkQuery = await query(
      `SELECT COUNT(DISTINCT b.id) as book_count 
       FROM books b 
       INNER JOIN book_categories bc ON bc.book_id = b.id 
       WHERE bc.category_id = ANY($1::int[])`,
      [categoryArray]
    );
    const totalBooksInCategories = Number(checkQuery.rows[0]?.book_count || 0);
    console.log("[RECOMMEND DEBUG] No books found in category-based query. Checking if books exist in these categories:", {
      categoryIds: categoryArray,
      totalBooksInCategories,
      excludeBookIds: excludeArray,
      excludeCount: excludeArray.length,
    });
  }

  return result.rows.map((row: any) => ({
    bookId: Number(row.id),
    reason: "from_your_categories",
  }));
}

/**
 * ขั้นที่ 2: Controlled Random
 * หนังสือสุ่มจากหมวดหมู่ผู้ใช้ โดยไม่รวมที่ถูกใจ/รีวิวแล้ว
 */
async function getControlledRandomRecommendations(
  userCategoryIds: Set<number>,
  excludeBookIds: Set<number>,
  limit: number
): Promise<Array<{ bookId: number; reason: string }>> {
  if (userCategoryIds.size === 0) {
    return [];
  }

  const categoryArray = Array.from(userCategoryIds);
  const placeholders = categoryArray.map((_, i) => `$${i + 1}`).join(", ");
  const excludeArray = Array.from(excludeBookIds);
  const excludePlaceholders =
    excludeArray.length > 0
      ? excludeArray.map((_, i) => `$${categoryArray.length + i + 1}`).join(", ")
      : "";

  const excludeCondition = excludeArray.length > 0
    ? `AND b.id NOT IN (${excludePlaceholders})`
    : "";

  const params = [...categoryArray, ...excludeArray];

  // ดึง candidates (PostgreSQL รองรับ TABLESAMPLE สำหรับ random แต่ง่ายกว่า: ดึงมากกว่าแล้ว randomize ใน JS)
  const result = await query(
    `
    SELECT DISTINCT b.id
    FROM books b
    INNER JOIN book_categories bc ON bc.book_id = b.id
    WHERE bc.category_id IN (${placeholders})
      ${excludeCondition}
    LIMIT $${params.length + 1}
    `,
    [...params, limit * 3] // ดึง candidates มากกว่าเพื่อ randomize ใน JS
  );

  // สุ่มและเอาแค่ limit
  const bookIds = result.rows.map((row: any) => Number(row.id));
  const shuffled = bookIds.sort(() => Math.random() - 0.5);

  return shuffled.slice(0, limit).map((bookId: number) => ({
    bookId,
    reason: "discovery",
  }));
}

/**
 * Fallback: หนังสือสุ่มเมื่อผู้ใช้ไม่มีพฤติกรรมและไม่มีหมวดหมู่
 * คืนค่าหนังสือยอดนิยมเรียงตาม rating_avg DESC, reviews_count DESC
 */
async function getRandomRecommendations(
  excludeBookIds: Set<number>,
  limit: number
): Promise<Array<{ bookId: number; reason: string }>> {
  const excludeArray = Array.from(excludeBookIds);
  
  // จัดการ exclude array ที่ว่าง - ใช้ parameterized ANY() พร้อม empty array หรือข้าม condition
  const excludeCondition = excludeArray.length > 0
    ? `AND b.id NOT IN (${excludeArray.map((_, i) => `$${i + 1}`).join(", ")})`
    : "";

  const params = excludeArray.length > 0 ? excludeArray : [];

  const result = await query(
    `
    SELECT b.id
    FROM books b
    LEFT JOIN reviews r ON r.book_id = b.id
    WHERE 1=1
      ${excludeCondition}
    GROUP BY b.id
    ORDER BY
      COALESCE(AVG(r.rating), 0) DESC NULLS LAST,
      COUNT(r.id) DESC,
      b.id DESC
    LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  return result.rows.map((row: any) => ({
    bookId: Number(row.id),
    reason: "popular_books",
  }));
}

/**
 * ดึงหนังสือยอดนิยมจากหมวดหมู่ที่ผู้ใช้เลือก (fallback แรกสำหรับผู้ใช้ที่มีหมวดหมู่)
 * ใช้ popularity score: (favorites_count * 3) + (reviews_count * 2) + avg_rating
 * แต่กรองเฉพาะหนังสือในหมวดหมู่ที่ผู้ใช้เลือก
 */
async function getPopularInCategories(
  userCategoryIds: Set<number>,
  excludeBookIds: Set<number>,
  limit: number
): Promise<Array<{ bookId: number; reason: string }>> {
  if (userCategoryIds.size === 0) {
    return [];
  }

  const categoryArray = Array.from(userCategoryIds);
  const excludeArray = Array.from(excludeBookIds);
  
  const excludeCondition = excludeArray.length > 0
    ? `AND b.id NOT IN (${excludeArray.map((_, i) => `$${categoryArray.length + i + 1}`).join(", ")})`
    : "";

  const params = [...categoryArray, ...excludeArray];

  const result = await query(
    `
    SELECT DISTINCT b.id
    FROM books b
    INNER JOIN book_categories bc ON bc.book_id = b.id
    LEFT JOIN reviews r ON r.book_id = b.id
    LEFT JOIN favorites f ON f.book_id = b.id
    WHERE bc.category_id = ANY($1::int[])
      ${excludeCondition}
    GROUP BY b.id
    ORDER BY
      (
        COALESCE(COUNT(DISTINCT f.user_id), 0) * 3 +
        COALESCE(COUNT(DISTINCT r.id), 0) * 2 +
        COALESCE(AVG(r.rating), 0)
      ) DESC,
      b.created_at DESC
    LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  console.log("[RECOMMEND DEBUG] Popular in categories fallback results:", {
    categoryIds: categoryArray,
    rowsReturned: result.rows.length,
    bookIds: result.rows.map((r: any) => Number(r.id)),
  });

  return result.rows.map((row: any) => ({
    bookId: Number(row.id),
    reason: "popular_in_your_categories",
  }));
}

/**
 * ดึงหนังสือยอดนิยมจากทุกหมวดหมู่ (fallback สุดท้าย - ใช้เมื่อไม่มีหมวดหมู่หรือไม่มีหนังสือในหมวดหมู่)
 * ใช้ popularity score: (favorites_count * 3) + (reviews_count * 2) + avg_rating
 */
async function getPopularAll(
  excludeBookIds: Set<number>,
  limit: number
): Promise<Array<{ bookId: number; reason: string }>> {
  const excludeArray = Array.from(excludeBookIds);
  const excludeCondition = excludeArray.length > 0
    ? `AND b.id NOT IN (${excludeArray.map((_, i) => `$${i + 1}`).join(", ")})`
    : "";

  const params = excludeArray.length > 0 ? excludeArray : [];

  const result = await query(
    `
    SELECT DISTINCT b.id
    FROM books b
    LEFT JOIN reviews r ON r.book_id = b.id
    LEFT JOIN favorites f ON f.book_id = b.id
    WHERE 1=1
      ${excludeCondition}
    GROUP BY b.id
    ORDER BY
      (
        COALESCE(COUNT(DISTINCT f.user_id), 0) * 3 +
        COALESCE(COUNT(DISTINCT r.id), 0) * 2 +
        COALESCE(AVG(r.rating), 0)
      ) DESC,
      b.created_at DESC
    LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  return result.rows.map((row: any) => ({
    bookId: Number(row.id),
    reason: "popular_all_books",
  }));
}

/**
 * ดึงหนังสือล่าสุด (fallback ที่รับประกันเมื่อ popular คืนค่าว่าง)
 * คืนค่าหนังสือเรียงตาม created_at DESC
 */
async function getLatestBooks(
  excludeBookIds: Set<number>,
  limit: number
): Promise<Array<{ bookId: number; reason: string }>> {
  const excludeArray = Array.from(excludeBookIds);
  const excludeCondition = excludeArray.length > 0
    ? `AND b.id NOT IN (${excludeArray.map((_, i) => `$${i + 1}`).join(", ")})`
    : "";

  const params = excludeArray.length > 0 ? excludeArray : [];

  const result = await query(
    `
    SELECT b.id
    FROM books b
    WHERE 1=1
      ${excludeCondition}
    ORDER BY b.created_at DESC, b.id DESC
    LIMIT $${params.length + 1}
    `,
    [...params, limit]
  );

  return result.rows.map((row: any) => ({
    bookId: Number(row.id),
    reason: "latest_books",
  }));
}

/**
 * ขั้นที่ 3: แนะนำตามพฤติกรรมโดยใช้ TF-IDF + Cosine Similarity
 */
async function getBehaviorBasedRecommendations(
  userId: number,
  userFavorites: Set<number>,
  userReviews: Map<number, number>,
  excludeBookIds: Set<number>,
  limit: number
): Promise<Array<{ bookId: number; similarity: number; reason: string }>> {
  // สร้าง user profile vector จาก favorites และ reviews
  let tfIdfResult;
  try {
    tfIdfResult = await getTfIdfVectors();
  } catch (err) {
    console.error("[getBehaviorBasedRecommendations] Error getting TF-IDF vectors:", err);
    return []; 
  }

  if (!tfIdfResult || !tfIdfResult.vectorsByBookId) {
    console.warn("[getBehaviorBasedRecommendations] TF-IDF result is invalid");
    return [];
  }

  const userVector: SparseVector = new Map();

  // เพิ่มหนังสือที่ถูกใจด้วย weight 1.0 (ข้ามถ้าไม่มี vector)
  for (const bookId of userFavorites) {
    const bookVector = tfIdfResult.vectorsByBookId.get(bookId);
    if (bookVector && bookVector.size > 0) {
      for (const [term, value] of bookVector.entries()) {
        userVector.set(term, (userVector.get(term) || 0) + value * 1.0);
      }
    }
  }

  // เพิ่มหนังสือที่ให้คะแนนด้วย weight = rating/5 (ข้ามถ้าไม่มี vector)
  for (const [bookId, rating] of userReviews.entries()) {
    const weight = rating / 5.0;
    const bookVector = tfIdfResult.vectorsByBookId.get(bookId);
    if (bookVector && bookVector.size > 0) {
      for (const [term, value] of bookVector.entries()) {
        userVector.set(term, (userVector.get(term) || 0) + value * weight);
      }
    }
  }

  if (userVector.size === 0) {
    // User profile ว่าง - อาจเกิดขึ้นถ้าหนังสือที่ถูกใจ/รีวิวไม่มี TF-IDF vectors
    // ไม่เป็นไร คืนค่าว่างและให้ caller fallback ไปใช้ category-based
    return [];
  }

  // Find similar books
  const similarBooks = findSimilarBooks(
    userVector,
    tfIdfResult.vectorsByBookId,
    excludeBookIds,
    limit * 2 // ดึงมากกว่าเพื่อ tie-breaking
  );

  // ใช้ tie-breakers และเรียงลำดับ
  const booksWithMetadata = await fetchBooksWithMetadata(
    similarBooks.map((s) => s.bookId)
  );

  const scored = similarBooks
    .map((item) => {
      const book = booksWithMetadata.get(item.bookId);
      if (!book) return null;

      return {
        bookId: item.bookId,
        similarity: item.similarity,
        ratingAvg: book.rating_avg || 0,
        favoritesCount: book.favorites_count || 0,
        createdAt: 0, 
        reason: userFavorites.has(item.bookId)
          ? "because_you_favorited"
          : userReviews.has(item.bookId)
          ? "because_you_rated_high"
          : "similar_to_your_preferences",
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // เรียงตาม similarity แล้วตาม tie-breakers
  scored.sort((a, b) => {
    // Primary: similarity
    if (Math.abs(a.similarity - b.similarity) > 0.001) {
      return b.similarity - a.similarity;
    }
    // Tie-breaker 1: rating_avg
    if (Math.abs(a.ratingAvg - b.ratingAvg) > 0.01) {
      return b.ratingAvg - a.ratingAvg;
    }
    // Tie-breaker 2: favorites_count
    return b.favoritesCount - a.favoritesCount;
  });

  return scored.slice(0, limit).map((item) => ({
    bookId: item.bookId,
    similarity: item.similarity,
    reason: item.reason,
  }));
}


export async function getPersonalizedRecommendations(
  userId: number,
  limit: number = 20,
  behaviorRatio: number = 0.7
): Promise<BookWithMetadata[]> {

  const [userFavorites, userReviews, userCategories] = await Promise.all([
    fetchUserFavorites(userId),
    fetchUserReviews(userId),
    fetchUserCategories(userId),
  ]);

  // DEBUG: Always log user data (not just in non-production)
  const hasBehavior = userFavorites.size > 0 || userReviews.size > 0;
  const hasCategories = userCategories.size > 0;
  console.log("[RECOMMEND DEBUG] User data loaded:", {
    userId,
    limit,
    behaviorRatio,
    userCategoriesCount: userCategories.size,
    userCategoryIds: Array.from(userCategories),
    favoritesCount: userFavorites.size,
    reviewsCount: userReviews.size,
    hasBehavior,
    hasCategories,
  });

  const excludeBookIds = new Set<number>();
  for (const bookId of userFavorites) {
    excludeBookIds.add(bookId);
  }

  const results: Array<{
    bookId: number;
    similarity?: number;
    reason: string;
  }> = [];
  const usedBookIds = new Set<number>();

  if (hasBehavior) {
    console.log("[RECOMMEND DEBUG] Using behavior-based recommendation method (user has favorites or reviews)");
    const behaviorLimit = Math.ceil(limit * behaviorRatio);
    const discoveryLimit = limit - behaviorLimit;

    let behaviorResults: Array<{ bookId: number; similarity: number; reason: string }> = [];
    try {
      behaviorResults = await getBehaviorBasedRecommendations(
        userId,
        userFavorites,
        userReviews,
        excludeBookIds,
        behaviorLimit
      );
      console.log("[RECOMMEND DEBUG] Behavior-based results:", {
        userId,
        behaviorResultsCount: behaviorResults.length,
        behaviorBookIds: behaviorResults.map(r => r.bookId),
      });
    } catch (err) {
      console.error("[getPersonalizedRecommendations] Error in behavior-based recommendations:", err);
      // Fallback: ถ้า behavior-based ล้มเหลว ดำเนินต่อด้วยผลลัพธ์ว่าง (จะใช้ discovery)
    }

    for (const item of behaviorResults) {
      if (!usedBookIds.has(item.bookId)) {
        results.push(item);
        usedBookIds.add(item.bookId);
      }
    }

    if (hasCategories && results.length < limit) {
      console.log("[RECOMMEND DEBUG] Adding category-based discovery results (user has categories)");
      const remaining = limit - results.length;
      const discoveryLimitToUse = behaviorResults.length === 0 ? limit : Math.min(discoveryLimit, remaining);
      try {
        const discoveryResults = await getCategoryBasedRecommendations(
          userCategories,
          new Set([...excludeBookIds, ...usedBookIds]),
          discoveryLimitToUse
        );

        console.log("[RECOMMEND DEBUG] Discovery (with behavior) results:", {
          userId,
          discoveryCount: discoveryResults.length,
          discoveryBookIds: discoveryResults.map(r => r.bookId),
          userCategoryIds: Array.from(userCategories),
        });

        for (const item of discoveryResults) {
          if (!usedBookIds.has(item.bookId)) {
            results.push({ ...item, similarity: undefined });
            usedBookIds.add(item.bookId);
          }
        }
      } catch (err) {
        console.error("[getPersonalizedRecommendations] Error in category-based recommendations:", err);
      }
    }

    // FALLBACK ที่รับประกัน: ถ้า behavior + discovery คืนค่า 0 ผลลัพธ์
    // ถ้าผู้ใช้มีหมวดหมู่ ให้ลอง popular ในหมวดหมู่ก่อน แล้วค่อยใช้ popular all
    if (results.length === 0) {
      console.log("[RECOMMEND DEBUG] Behavior + Discovery returned 0 results, trying category-based fallback first");
      if (hasCategories) {
        try {
          const popularInCategoriesResults = await getPopularInCategories(userCategories, excludeBookIds, limit);
          if (popularInCategoriesResults.length > 0) {
            console.log("[RECOMMEND DEBUG] Found popular books in user categories, using them");
            for (const item of popularInCategoriesResults) {
              if (!usedBookIds.has(item.bookId)) {
                results.push({ ...item, similarity: undefined });
                usedBookIds.add(item.bookId);
              }
            }
          }
        } catch (categoryFallbackErr) {
          console.error("[getPersonalizedRecommendations] Error in popular_in_categories fallback:", categoryFallbackErr);
        }
      }
      
      // ถ้ายังไม่มีผลลัพธ์ ให้ใช้ popular all เป็น fallback สุดท้าย
      if (results.length === 0) {
        console.log("[RECOMMEND DEBUG] No category-based fallback results, using global popular_all fallback");
        try {
          const popularResults = await getPopularAll(excludeBookIds, limit);
          for (const item of popularResults) {
            if (!usedBookIds.has(item.bookId)) {
              results.push({ ...item, similarity: undefined });
              usedBookIds.add(item.bookId);
            }
          }
        } catch (fallbackErr) {
          console.error("[getPersonalizedRecommendations] Error in popular_all fallback (behavior path):", fallbackErr);
        }
      }
    }
  } else {
    // COLD START: User has no behavior (no favorites, no reviews)
    if (hasCategories) {
      console.log("[RECOMMEND DEBUG] COLD START: Using category-based recommendation method (user has categories, no behavior)");
      
      // CRITICAL: For cold start users, we MUST use category-based recommendations
      // Try multiple category-based methods before falling back to global popular books
      
      let hadCategoryBasedResults = false;
      let categoryBasedAttempts = 0;
      
      try {
        // Stage 1: Popular books from user's categories
        categoryBasedAttempts++;
        const stage1Results = await getCategoryBasedRecommendations(
          userCategories,
          excludeBookIds,
          limit
        );

        console.log("[RECOMMEND DEBUG] Stage 1 (Category-based) results:", {
          userId,
          stage1Count: stage1Results.length,
          stage1BookIds: stage1Results.map(r => r.bookId),
          categoryIds: Array.from(userCategories),
        });

        if (stage1Results.length > 0) {
          hadCategoryBasedResults = true;
        }

        for (const item of stage1Results) {
          if (!usedBookIds.has(item.bookId)) {
            results.push({ ...item, similarity: undefined });
            usedBookIds.add(item.bookId);
          }
        }

        // Stage 2: Fill remaining slots with controlled random from user's categories
        if (results.length < limit) {
          const remaining = limit - results.length;
          categoryBasedAttempts++;
          const stage2Results = await getControlledRandomRecommendations(
            userCategories,
            new Set([...excludeBookIds, ...usedBookIds]),
            remaining
          );

          console.log("[RECOMMEND DEBUG] Stage 2 (Controlled Random) results:", {
            userId,
            stage2Count: stage2Results.length,
            stage2BookIds: stage2Results.map(r => r.bookId),
          });

          if (stage2Results.length > 0) {
            hadCategoryBasedResults = true;
          }

          for (const item of stage2Results) {
            if (!usedBookIds.has(item.bookId)) {
              results.push({ ...item, similarity: undefined });
              usedBookIds.add(item.bookId);
            }
          }
        }

        // Stage 3: Fill remaining slots with popular books IN user's categories
        if (results.length < limit) {
          const remaining = limit - results.length;
          categoryBasedAttempts++;
          console.log("[RECOMMEND DEBUG] Stage 1+2 returned insufficient results, filling with popular books in user categories");
          try {
            const popularInCategoriesResults = await getPopularInCategories(
              userCategories,
              new Set([...excludeBookIds, ...usedBookIds]),
              remaining
            );
            if (popularInCategoriesResults.length > 0) {
              hadCategoryBasedResults = true;
              console.log("[RECOMMEND DEBUG] Popular in categories fallback added:", {
                addedCount: popularInCategoriesResults.length,
                bookIds: popularInCategoriesResults.map(r => r.bookId),
              });
              for (const item of popularInCategoriesResults) {
                if (!usedBookIds.has(item.bookId) && results.length < limit) {
                  results.push({ ...item, similarity: undefined });
                  usedBookIds.add(item.bookId);
                }
              }
            }
          } catch (categoryFallbackErr) {
            console.error("[getPersonalizedRecommendations] Error in popular_in_categories fallback:", categoryFallbackErr);
          }
        }

        // CRITICAL: Only use global popular books if ALL category-based attempts returned 0 results
        // This ensures cold start users ALWAYS get category-based recommendations when possible
        if (results.length === 0) {
          console.log("[RECOMMEND DEBUG] All category-based attempts returned 0 results. Checking if books exist in categories...");
          
          // Double-check: Verify books actually exist in user's categories
          const checkQuery = await query(
            `SELECT COUNT(DISTINCT b.id) as book_count 
             FROM books b 
             INNER JOIN book_categories bc ON bc.book_id = b.id 
             WHERE bc.category_id = ANY($1::int[])`,
            [Array.from(userCategories)]
          );
          const totalBooksInCategories = Number(checkQuery.rows[0]?.book_count || 0);
          
          console.log("[RECOMMEND DEBUG] Category check:", {
            categoryIds: Array.from(userCategories),
            totalBooksInCategories,
            categoryBasedAttempts,
            hadCategoryBasedResults,
          });
          
          // Only fall back to global popular books if NO books exist in user's categories
          if (totalBooksInCategories === 0) {
            console.log("[RECOMMEND DEBUG] No books exist in user's categories, using global popular_all fallback as last resort");
            try {
              const popularResults = await getPopularAll(excludeBookIds, limit);
              for (const item of popularResults) {
                if (!usedBookIds.has(item.bookId)) {
                  results.push({ ...item, similarity: undefined });
                  usedBookIds.add(item.bookId);
                }
              }
            } catch (fallbackErr) {
              console.error("[getPersonalizedRecommendations] Error in popular_all fallback:", fallbackErr);
            }
          } else {
            // Books exist in categories but queries returned 0 - this shouldn't happen
            // Try one more time with a simpler query
            console.warn("[RECOMMEND DEBUG] Books exist in categories but queries returned 0. Retrying with simpler query...");
            try {
              const retryResults = await getCategoryBasedRecommendations(
                userCategories,
                new Set(), // Don't exclude anything on retry
                limit
              );
              if (retryResults.length > 0) {
                console.log("[RECOMMEND DEBUG] Retry successful, found books:", retryResults.length);
                for (const item of retryResults) {
                  if (!usedBookIds.has(item.bookId)) {
                    results.push({ ...item, similarity: undefined });
                    usedBookIds.add(item.bookId);
                  }
                }
              }
            } catch (retryErr) {
              console.error("[getPersonalizedRecommendations] Error in retry query:", retryErr);
            }
          }
        } else {
          console.log("[RECOMMEND DEBUG] Category-based recommendations successful:", {
            totalResults: results.length,
            hadCategoryBasedResults,
          });
        }
      } catch (err) {
        console.error("[getPersonalizedRecommendations] Error in category-based recommendations:", err);
        // CRITICAL: For cold start users, we MUST try category-based fallbacks before global fallback
        if (results.length === 0) {
          console.log("[RECOMMEND DEBUG] Error in category-based recommendations, trying category-based fallbacks...");
          
          // Try popular books in categories first
          try {
            const popularInCategoriesResults = await getPopularInCategories(userCategories, excludeBookIds, limit);
            if (popularInCategoriesResults.length > 0) {
              console.log("[RECOMMEND DEBUG] Error occurred, using popular_in_categories fallback");
              for (const item of popularInCategoriesResults) {
                if (!usedBookIds.has(item.bookId)) {
                  results.push({ ...item, similarity: undefined });
                  usedBookIds.add(item.bookId);
                }
              }
            }
          } catch (categoryFallbackErr) {
            console.error("[getPersonalizedRecommendations] Error in popular_in_categories fallback after error:", categoryFallbackErr);
          }
          
          // Only use global popular all if category-based fallbacks also failed
          if (results.length === 0) {
            console.log("[RECOMMEND DEBUG] All category-based fallbacks failed, using global popular_all as last resort");
            try {
              const popularResults = await getPopularAll(excludeBookIds, limit);
              for (const item of popularResults) {
                if (!usedBookIds.has(item.bookId)) {
                  results.push({ ...item, similarity: undefined });
                  usedBookIds.add(item.bookId);
                }
              }
            } catch (fallbackErr) {
              console.error("[getPersonalizedRecommendations] Error in popular_all fallback after error:", fallbackErr);
            }
          }
        }
      }
    } else {
      console.log("[RECOMMEND DEBUG] Using random fallback (user has no categories, no behavior)");
      
      try {
        const randomResults = await getRandomRecommendations(excludeBookIds, limit);
        console.log("[RECOMMEND DEBUG] Fallback B (Random Popular) results:", {
          userId,
          randomCount: randomResults.length,
          randomBookIds: randomResults.map(r => r.bookId),
        });
        for (const item of randomResults) {
          if (!usedBookIds.has(item.bookId)) {
            results.push({ ...item, similarity: undefined });
            usedBookIds.add(item.bookId);
          }
        }
      } catch (err) {
        console.error("[getPersonalizedRecommendations] Error in random recommendations:", err);
        // ดำเนินต่อด้วยผลลัพธ์ว่าง (จะ fallback ไปใช้ fallback ที่รับประกันด้านล่าง)
      }
    }
  }

  // ดึง metadata หนังสือเต็มรูปแบบ
  const bookIds = results.map((r) => r.bookId);
  let booksMap = new Map<number, BookWithMetadata>();
  
  // ดึงเฉพาะเมื่อมี book ID (fetchBooksWithMetadata จัดการ empty arrays)
  if (bookIds.length > 0) {
    try {
      booksMap = await fetchBooksWithMetadata(bookIds);
    } catch (err) {
      console.error("[getPersonalizedRecommendations] Error fetching book metadata:", err);
      // ดำเนินต่อด้วย empty map - จะได้ rankedBooks ว่างแต่ไม่ crash
    }
  }

  // รวมผลลัพธ์กับ metadata (รักษาลำดับการเรียงเดิม)
  const rankedBooks: BookWithMetadata[] = [];
  // ติดตามผลลัพธ์ไหนมาจาก category-based (สำหรับ post-processing fallback)
  const categoryBasedBookIds = new Set<number>();
  for (const item of results) {
    const book = booksMap.get(item.bookId);
    if (book) {
      rankedBooks.push({
        ...book,
        similarity: item.similarity,
        reason: item.reason,
      });
      // ติดตามว่ามาจากการแนะนำ category-based หรือไม่
      if (item.reason === "from_your_categories" || item.reason === "discovery" || item.reason === "popular_in_your_categories") {
        categoryBasedBookIds.add(item.bookId);
      }
    }
  }

  // DEBUG: Log pre-processed results
  console.log("[RECOMMEND DEBUG] Pre-processed rankedBooks:", {
    userId,
    rankedBooksCount: rankedBooks.length,
    categoryBasedCount: categoryBasedBookIds.size,
    allBookIds: rankedBooks.map(b => b.id),
  });

  // ใช้ series deduplication และ next volume preference (post-processing)
  // ครอบด้วย try-catch เพื่อให้แน่ใจว่า post-processing จะไม่ crash endpoint
  try {
    // ดึงหนังสือที่ผู้ใช้เห็นและความคืบหน้าซีรีส์
    const { seenBookIds, seriesMaxVolume } = await getSeenAndSeriesProgress(userId);
    
    // ดึง next volume candidates (ค่าเริ่มต้นเป็น empty Set ถ้าล้มเหลว)
    let nextVolumeBookIds = new Set<number>();
    try {
      nextVolumeBookIds = await getNextVolumeCandidates(seriesMaxVolume, seenBookIds);
    } catch (err) {
      console.error("[getPersonalizedRecommendations] Error getting next volume candidates:", err);
      // ดำเนินต่อด้วย empty set
    }
    
    // ดึง metadata สำหรับหนังสือ next volume ที่ยังไม่อยู่ใน rankedBooks
    // เพื่อให้แน่ใจว่าเราสามารถแนะนำ next volume ได้แม้จะไม่อยู่ในการเรียงลำดับเดิม
    const existingBookIds = new Set((rankedBooks || []).map(b => b.id));
    const missingNextVolumeIds = Array.from(nextVolumeBookIds).filter(id => !existingBookIds.has(id));
    
    if (missingNextVolumeIds.length > 0) {
      try {
        const missingNextVolumeBooks = await fetchBooksWithMetadata(missingNextVolumeIds);
        // สร้าง array ของหนังสือ next volume ด้วยความสำคัญสูง (similarity = 1.0 สำหรับ rule-based insertion)
        // จะถูกเลือกก่อนในขั้นแรกของ applySeriesDedupeAndNextVolumeRule
        const nextVolumeBooks: BookWithMetadata[] = [];
        for (const bookId of missingNextVolumeIds) {
          const book = missingNextVolumeBooks.get(bookId);
          if (book) {
            nextVolumeBooks.push({
              ...book,
              similarity: 1.0, // ความสำคัญสูงสำหรับการแนะนำ next volume แบบ rule-based
              reason: "next_volume_in_series",
            });
          }
        }
        // เพิ่มหนังสือ next volume ไปที่ต้น rankedBooks (แทรกที่จุดเริ่มต้น)
        if (nextVolumeBooks.length > 0) {
          rankedBooks.unshift(...nextVolumeBooks);
        }
      } catch (err) {
        console.error("[getPersonalizedRecommendations] Error fetching next volume metadata:", err);
        // ดำเนินต่อโดยไม่ inject next volume
      }
    }
    
    // ใช้ post-processing: series dedupe + next volume preference
    // ให้แน่ใจว่า rankedBooks ไม่ใช่ null/undefined
    const safeRankedBooks = rankedBooks || [];
    const afterSeriesResults = applySeriesDedupeAndNextVolumeRule(
      safeRankedBooks,
      nextVolumeBookIds ?? new Set<number>(),
      seenBookIds ?? new Set<number>(),
      limit
    );

    // ใช้ top-K category diversity (post-process หลังจาก series dedupe)
    // CRITICAL: Skip category diversity for cold start users to preserve category-based results
    // Diversity filtering is only useful for users with behavior who need balanced recommendations
    let finalResults = afterSeriesResults;
    
    // Only apply category diversity for users with behavior (favorites/reviews)
    // Cold start users (hasCategories && !hasBehavior) should get all category-based results preserved
    if (hasBehavior) {
      try {
        // ดึง category ID สำหรับหนังสือที่ผ่าน series dedupe แล้ว
        const bookIdsForCategoryCheck = afterSeriesResults.map(b => b.id);
        const categoryIdsByBookId = await fetchCategoryIdsByBookIds(bookIdsForCategoryCheck);

        // ใช้ top-K category diversity (จำกัดเฉพาะใน top 10) - only for users with behavior
        finalResults = applyTopKCategoryDiversity({
          ranked: afterSeriesResults,
          categoryIdsByBookId,
          seenBookIds: seenBookIds ?? new Set<number>(),
          limit,
          topK: DEFAULT_TOP_K,
          maxPerCategoryInTopK: DEFAULT_MAX_PER_CATEGORY_IN_TOP_K,
        });
        console.log("[RECOMMEND DEBUG] Applied category diversity (user has behavior)");
      } catch (err) {
        console.error("[getPersonalizedRecommendations] Error applying category diversity:", err);
        // ดำเนินต่อด้วย afterSeriesResults ถ้า category diversity ล้มเหลว (graceful degradation)
        finalResults = afterSeriesResults;
      }
    } else {
      // Cold start users: Skip diversity filtering to preserve all category-based results
      console.log("[RECOMMEND DEBUG] Skipping category diversity for cold start user (preserving all category-based results)");
    }

    // DEBUG: Log post-processing results
    console.log("[RECOMMEND DEBUG] Post-processing results:", {
      userId,
      beforePostProcess: rankedBooks.length,
      afterSeriesDedup: afterSeriesResults.length,
      afterCategoryDiversity: finalResults.length,
      hadCategoryBasedResults: categoryBasedBookIds.size > 0,
    });

    // FALLBACK ที่รับประกัน: ถ้า post-processing ลดผลลัพธ์เหลือ 0
    // CRITICAL: For cold start users (hasCategories && !hasBehavior), preserve category-based results
    if (finalResults.length === 0) {
      console.log("[RECOMMEND DEBUG] Post-processing returned 0 results, checking for revert");
      
      // CRITICAL: If we have category-based results, ALWAYS revert to them for cold start users
      // This ensures cold start users get category-based recommendations even if post-processing filters them out
      if (categoryBasedBookIds.size > 0 && rankedBooks.length > 0) {
        console.log("[RECOMMEND DEBUG] Reverting to pre-processed category-based results (post-processing removed all)", {
          originalCount: rankedBooks.length,
          categoryBasedCount: categoryBasedBookIds.size,
          isColdStart: !hasBehavior && hasCategories,
        });
        
        // For cold start users, prioritize category-based books
        const categoryBasedBooks = rankedBooks.filter(b => categoryBasedBookIds.has(b.id));
        if (categoryBasedBooks.length > 0) {
          // Use category-based books, but apply minimal post-processing (just limit, no aggressive filtering)
          finalResults = categoryBasedBooks.slice(0, limit);
          console.log("[RECOMMEND DEBUG] Using category-based books after post-processing removed all:", {
            count: finalResults.length,
            bookIds: finalResults.map(b => b.id),
          });
        } else {
          // Fallback to all pre-processed results if category filtering somehow removed everything
          finalResults = rankedBooks.slice(0, limit);
        }
      } else if (rankedBooks.length > 0) {
        // Have some results but not category-based - use them
        console.log("[RECOMMEND DEBUG] Reverting to pre-processed results (not category-based)");
        finalResults = rankedBooks.slice(0, limit);
      } else {
        // No pre-processed results - use fallback
        console.log("[RECOMMEND DEBUG] No pre-processed results, using fallback");
        try {
          // CRITICAL: For cold start users, try category-based fallback FIRST
          if (hasCategories && !hasBehavior) {
            console.log("[RECOMMEND DEBUG] Cold start user: trying category-based fallback first");
            const popularInCategoriesResults = await getPopularInCategories(userCategories, excludeBookIds, limit);
            if (popularInCategoriesResults.length > 0) {
              console.log("[RECOMMEND DEBUG] Using popular_in_categories fallback in post-processing for cold start user");
              const popularBookIds = popularInCategoriesResults.map(r => r.bookId);
              const popularBooksMap = await fetchBooksWithMetadata(popularBookIds);
              finalResults = Array.from(popularBooksMap.values()).slice(0, limit);
            }
          } else if (hasCategories) {
            // User has categories but also has behavior - still try category fallback
            const popularInCategoriesResults = await getPopularInCategories(userCategories, excludeBookIds, limit);
            if (popularInCategoriesResults.length > 0) {
              console.log("[RECOMMEND DEBUG] Using popular_in_categories fallback in post-processing");
              const popularBookIds = popularInCategoriesResults.map(r => r.bookId);
              const popularBooksMap = await fetchBooksWithMetadata(popularBookIds);
              finalResults = Array.from(popularBooksMap.values()).slice(0, limit);
            }
          }
          
          // Only use global popular all if category-based fallback failed
          if (finalResults.length === 0) {
            const popularResults = await getPopularAll(excludeBookIds, limit);
            if (popularResults.length > 0) {
              console.log("[RECOMMEND DEBUG] Using global popular_all fallback in post-processing");
              const popularBookIds = popularResults.map(r => r.bookId);
              const popularBooksMap = await fetchBooksWithMetadata(popularBookIds);
              finalResults = Array.from(popularBooksMap.values()).slice(0, limit);
            } else {
              // Last resort: latest books
              const latestResults = await getLatestBooks(excludeBookIds, limit);
              if (latestResults.length > 0) {
                const latestBookIds = latestResults.map(r => r.bookId);
                const latestBooksMap = await fetchBooksWithMetadata(latestBookIds);
                finalResults = Array.from(latestBooksMap.values()).slice(0, limit);
              }
            }
          }
        } catch (fallbackErr) {
          console.error("[getPersonalizedRecommendations] Error in guaranteed fallback:", fallbackErr);
        }
      }
    }

    // DEBUG: Log final results with all book IDs
    console.log("[RECOMMEND DEBUG] Final recommended book IDs:", {
      userId,
      finalCount: finalResults.length,
      finalBookIds: finalResults.map(b => b.id),
      firstBookId: finalResults[0]?.id || null,
      recommendationMethod: hasBehavior ? "behavior-based" : hasCategories ? "category-based" : "random-fallback",
    });

    return finalResults;
  } catch (err) {
    console.error("[getPersonalizedRecommendations] Error in post-processing:", err);
    if (err instanceof Error) {
      console.error("[getPersonalizedRecommendations] Post-processing stack:", err.stack);
    }
    // คืนค่าอะไรก็ตามที่มีอยู่แล้ว (rankedBooks) แทนที่จะ crash
    return rankedBooks || [];
  }
}

/**
 * หาหนังสือที่คล้ายกับหนังสือที่กำหนดโดยใช้ TF-IDF + Cosine Similarity
 */
export async function getSimilarBooks(
  bookId: number,
  limit: number = 10
): Promise<Array<BookWithMetadata & { similarity: number }>> {
  const tfIdfResult = await getTfIdfVectors();
  const targetVector = tfIdfResult.vectorsByBookId.get(bookId);

  if (!targetVector || targetVector.size === 0) {
    return [];
  }

  // Find similar books
  const similarBooks = findSimilarBooks(
    targetVector,
    tfIdfResult.vectorsByBookId,
    new Set([bookId]), // ไม่รวมหนังสือเป้าหมายเอง
    limit
  );

  // ดึง metadata เต็มรูปแบบ
  const bookIds = similarBooks.map((s) => s.bookId);
  const booksMap = await fetchBooksWithMetadata(bookIds);

  // รวมผลลัพธ์กับ tie-breakers
  const results: Array<BookWithMetadata & { similarity: number }> = [];

  for (const item of similarBooks) {
    const book = booksMap.get(item.bookId);
    if (book) {
      const resultItem: any = {
        ...book,
        similarity: item.similarity,
      };
      // รวม created_at สำหรับ tie-breaking (เข้าถึงผ่าน any เพื่อหลีกเลี่ยง type error)
      if ((book as any).created_at) {
        resultItem.created_at = (book as any).created_at;
      }
      results.push(resultItem);
    }
  }

  // ใช้ tie-breakers: similarity desc แล้ว rating_avg desc แล้ว favorites_count desc แล้ว created_at desc
  results.sort((a, b) => {
    // Primary: similarity
    if (Math.abs(a.similarity - b.similarity) > 0.001) {
      return b.similarity - a.similarity;
    }
    // Tie-breaker 1: rating_avg
    const ratingA = a.rating_avg || 0;
    const ratingB = b.rating_avg || 0;
    if (Math.abs(ratingA - ratingB) > 0.01) {
      return ratingB - ratingA;
    }
    // Tie-breaker 2: favorites_count
    const favsA = a.favorites_count || 0;
    const favsB = b.favorites_count || 0;
    if (favsA !== favsB) {
      return favsB - favsA;
    }
    // Tie-breaker 3: created_at (ใหม่ก่อน)
    const createdAtA = (a as any).created_at ? new Date((a as any).created_at).getTime() : 0;
    const createdAtB = (b as any).created_at ? new Date((b as any).created_at).getTime() : 0;
    return createdAtB - createdAtA;
  });

  return results;
}

// ================== DEBUG HELPERS ==================

/**
 * ดึงหนังสือพร้อมหมวดหมู่และสถิติ (สำหรับ debug)
 */
export async function getBookWithCategoriesAndStats(
  bookId: number
): Promise<BookWithMetadata | null> {
  const result = await query(
    `
    SELECT
      b.id,
      b.title,
      b.author,
      b.publisher,
      b.description,
      b.description_tfidf,
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
    GROUP BY b.id, b.title, b.author, b.publisher, b.description, b.description_tfidf, b.cover_image, b.buy_link
    `,
    [bookId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: Number(row.id),
    title: row.title || "",
    author: row.author,
    publisher: row.publisher,
    description: row.description,
    description_tfidf: row.description_tfidf ?? null,
    cover_image: row.cover_image,
    buy_link: row.buy_link,
    categories: Array.isArray(row.categories) ? row.categories : [],
    rating_avg: Number(row.rating_avg) || 0,
    reviews_count: Number(row.reviews_count) || 0,
    favorites_count: Number(row.favorites_count) || 0,
  };
}

/**
 * หาหนังสือที่คล้ายกันโดยใช้ vector (สำหรับ debug - ใช้ cache ใหม่)
 */
export async function getSimilarBooksByVector(
  bookId: number,
  limit: number
): Promise<Array<BookWithMetadata & { similarity: number }>> {
  return getSimilarBooks(bookId, limit);
}

/**
 * ดึง terms จำนวน N อันดับแรกสำหรับหนังสือ (สำหรับ debug)
 * คืนค่า terms เรียงตาม TF-IDF score จากมากไปน้อย
 */
export async function getTopTermsForBook(
  bookId: number,
  n: number
): Promise<Array<{ term: string; score: number }>> {
  const tfIdfResult = await getTfIdfVectors();
  const vector = tfIdfResult.vectorsByBookId.get(bookId);

  if (!vector || vector.size === 0) {
    return [];
  }

  // แปลงเป็น array และเรียงตาม score จากมากไปน้อย
  const terms = Array.from(vector.entries())
    .map(([term, score]) => ({ term, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);

  return terms;
}
