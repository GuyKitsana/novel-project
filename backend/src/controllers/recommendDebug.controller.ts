import { Request, Response } from "express";
import {
  getBookWithCategoriesAndStats,
  getSimilarBooksByVector,
  getTopTermsForBook,
  getTfIdfVectors,
  resetTfIdfCacheForDebug,
} from "../services/recommend.service";
import { buildBookDocument } from "../utils/tfidf";

/**
 * GET /api/recommend/debug/book/:bookId
 * Debug endpoint to inspect TF-IDF + Cosine Similarity results
 * 
 * SAFETY: Only enabled in non-production environments
 */
export const getBookDebugInfo = async (req: Request, res: Response) => {
  try {
    // Safety guard: block in production
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ message: "Not found" });
    }

    // Reset TF-IDF cache to ensure fresh rebuild with latest tokenization logic
    // (only in non-production, for testing tokenization changes)
    resetTfIdfCacheForDebug();

    const bookId = Number(req.params.bookId);
    const limit = Number(req.query.limit) || 10;
    const terms = Number(req.query.terms) || 20;

    if (Number.isNaN(bookId) || bookId <= 0) {
      return res.status(400).json({ message: "Invalid book id" });
    }

    // Fetch target book
    const targetBook = await getBookWithCategoriesAndStats(bookId);
    if (!targetBook) {
      return res.status(404).json({ message: "Book not found" });
    }

    // Build docText (same as recommendation uses)
    // Prefer description_tfidf for recommendation, fallback to description
    const docText = buildBookDocument({
      id: targetBook.id,
      title: targetBook.title,
      description: targetBook.description || null,
      description_tfidf: targetBook.description_tfidf ?? null,
      categories: targetBook.categories,
    });

    // Get top terms
    const topTerms = await getTopTermsForBook(bookId, terms);

    // Get similar books
    const similarBooks = await getSimilarBooksByVector(bookId, limit);

    // Get TF-IDF vectors for keyword overlap calculation
    const tfIdfResult = await getTfIdfVectors();
    const targetVector = tfIdfResult.vectorsByBookId.get(bookId);

    // Calculate metrics
    const targetCategories = new Set(targetBook.categories.map((c) => c.toLowerCase()));

    // Category hit rate
    let matchedCategories = 0;
    const similarBooksWithOverlap = similarBooks.map((book) => {
      const bookCategories = new Set(
        (book.categories || []).map((c) => c.toLowerCase())
      );
      const sharedCategories = Array.from(targetCategories).filter((cat) =>
        bookCategories.has(cat)
      );
      const sharedCount = sharedCategories.length;

      if (sharedCount > 0) {
        matchedCategories++;
      }

      // Keyword overlap: get top 10 terms from target (excluding category names)
      const categoryNamesLower = Array.from(targetCategories);
      const targetTopTerms = topTerms
        .filter((t) => !categoryNamesLower.includes(t.term.toLowerCase()))
        .slice(0, 10)
        .map((t) => t.term.toLowerCase());
      const targetTopSet = new Set(targetTopTerms);

      // Get similar book's top 10 terms
      const similarVector = tfIdfResult.vectorsByBookId.get(book.id);
      let overlapTerms = 0;
      if (similarVector) {
        const similarTopTerms = Array.from(similarVector.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([term]) => term.toLowerCase());
        const similarTopSet = new Set(similarTopTerms);

        // Count overlap
        overlapTerms = Array.from(targetTopSet).filter((term) =>
          similarTopSet.has(term)
        ).length;
      }

      return {
        id: book.id,
        title: book.title,
        categories: book.categories || [],
        rating_avg: book.rating_avg || 0,
        reviews_count: book.reviews_count || 0,
        favorites_count: book.favorites_count || 0,
        similarity: book.similarity || 0,
        series_id: book.series_id ?? null,
        volume_no: book.volume_no ?? null,
        shared_categories: sharedCount,
        overlap_terms: overlapTerms,
      };
    });

    // Calculate keyword overlap average
    const keywordOverlapAvg =
      similarBooksWithOverlap.length > 0
        ? similarBooksWithOverlap.reduce((sum, b) => sum + b.overlap_terms, 0) /
          similarBooksWithOverlap.length
        : 0;

    // Response
    return res.json({
      target: {
        id: targetBook.id,
        title: targetBook.title,
        categories: targetBook.categories || [],
        rating_avg: targetBook.rating_avg || 0,
        reviews_count: targetBook.reviews_count || 0,
        favorites_count: targetBook.favorites_count || 0,
      },
      docTextPreview: docText.length > 250 ? docText.substring(0, 250) + "..." : docText,
      topTerms,
      items: similarBooksWithOverlap,
      metrics: {
        category_hit_rate: {
          matched: matchedCategories,
          total: similarBooksWithOverlap.length,
          rate:
            similarBooksWithOverlap.length > 0
              ? matchedCategories / similarBooksWithOverlap.length
              : 0,
        },
        keyword_overlap_avg: keywordOverlapAvg,
      },
    });
  } catch (err: any) {
    console.error("[getBookDebugInfo] Error:", err);
    if (process.env.NODE_ENV === "development") {
      console.error("[getBookDebugInfo] Error details:", err.message, err.stack);
    }
    return res.status(500).json({ message: "Internal server error" });
  }
};