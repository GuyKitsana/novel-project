/**
 * CLI Script: Check TF-IDF + Cosine Similarity Results for Real Books
 * 
 * QUICK MANUAL CHECK STEPS:
 * 1. Pick a real book ID from your database
 *    - Example: SELECT id, title FROM books LIMIT 5;
 * 2. Run this script:
 *    npx ts-node src/scripts/check-recommend-real.ts 123
 * 3. Interpret the output:
 *    - topTerms: Should show meaningful Thai/English keywords (e.g., "แฟนตาซี", "เวทมนตร์", "fantasy")
 *    - similarity ranking: Higher similarity should correlate with shared categories/keywords
 *    - category_hit_rate: Should be > 0 (ideally 0.5+ if categories exist and are meaningful)
 *    - keyword_overlap_avg: Should be > 0 (shows TF-IDF is finding common terms)
 * 
 * EXPECTED RESULTS:
 * - Books with same categories should have higher similarity
 * - Books with similar descriptions should rank higher
 * - category_hit_rate should be significantly above random baseline (1 / total_categories)
 * - keyword_overlap_avg should show books share meaningful terms
 */

import {
  getBookWithCategoriesAndStats,
  getSimilarBooksByVector,
  getTopTermsForBook,
  getTfIdfVectors,
} from "../services/recommend.service";
import { buildBookDocument } from "../utils/tfidf";

async function checkRecommendReal() {
  // Get bookId from command line args
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: npx ts-node src/scripts/check-recommend-real.ts <bookId>");
    console.error("Example: npx ts-node src/scripts/check-recommend-real.ts 123");
    process.exit(1);
  }

  const bookId = parseInt(args[0], 10);
  if (Number.isNaN(bookId) || bookId <= 0) {
    console.error("Error: bookId must be a positive integer");
    process.exit(1);
  }

  console.log("\n" + "=".repeat(70));
  console.log("🔍 RECOMMENDATION DEBUG: TF-IDF + Cosine Similarity");
  console.log("=".repeat(70));
  console.log(`\n📘 Analyzing Book ID: ${bookId}\n`);

  try {
    // Fetch target book
    const targetBook = await getBookWithCategoriesAndStats(bookId);
    if (!targetBook) {
      console.error(`❌ Book with ID ${bookId} not found in database`);
      process.exit(1);
    }

    console.log("📖 TARGET BOOK:");
    console.log(`   Title: ${targetBook.title}`);
    console.log(`   Categories: ${targetBook.categories.join(", ") || "(none)"}`);
    console.log(
      `   Stats: ⭐ ${targetBook.rating_avg?.toFixed(1) || "0.0"} | 📝 ${
        targetBook.reviews_count || 0
      } reviews | ❤️ ${targetBook.favorites_count || 0} favorites`
    );

    // Build docText (same as recommendation uses)
    // Prefer description_tfidf for recommendation, fallback to description
    const docText = buildBookDocument({
      id: targetBook.id,
      title: targetBook.title,
      description: targetBook.description || null,
      description_tfidf: targetBook.description_tfidf ?? null,
      categories: targetBook.categories,
    });

    console.log(`\n📄 DOCUMENT TEXT (for TF-IDF):`);
    console.log(`   ${docText.length > 200 ? docText.substring(0, 200) + "..." : docText}`);

    // Get top terms
    console.log(`\n🔑 TOP 15 TERMS (by TF-IDF score):`);
    const topTerms = await getTopTermsForBook(bookId, 15);
    if (topTerms.length === 0) {
      console.log("   ⚠️  No terms found (book may not have description/categories)");
    } else {
      topTerms.forEach((item, idx) => {
        console.log(`   ${(idx + 1).toString().padStart(2)}. ${item.term.padEnd(30)} ${item.score.toFixed(4)}`);
      });
    }

    // Get similar books
    console.log(`\n📚 TOP 10 SIMILAR BOOKS:`);
    const similarBooks = await getSimilarBooksByVector(bookId, 10);
    if (similarBooks.length === 0) {
      console.log("   ⚠️  No similar books found");
    } else {
      // Get TF-IDF vectors for keyword overlap
      const tfIdfResult = await getTfIdfVectors();
      const targetVector = tfIdfResult.vectorsByBookId.get(bookId);
      const targetCategories = new Set(targetBook.categories.map((c) => c.toLowerCase()));
      const categoryNamesLower = Array.from(targetCategories);

      // Get top 10 terms from target (excluding category names)
      const targetTopTerms = topTerms
        .filter((t) => !categoryNamesLower.includes(t.term.toLowerCase()))
        .slice(0, 10)
        .map((t) => t.term.toLowerCase());
      const targetTopSet = new Set(targetTopTerms);

      let matchedCategories = 0;
      let totalOverlap = 0;

      similarBooks.forEach((book, idx) => {
        // Calculate shared categories
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

        // Calculate keyword overlap
        const similarVector = tfIdfResult.vectorsByBookId.get(book.id);
        let overlapTerms = 0;
        if (similarVector) {
          const similarTopTerms = Array.from(similarVector.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([term]) => term.toLowerCase());
          const similarTopSet = new Set(similarTopTerms);
          overlapTerms = Array.from(targetTopSet).filter((term) =>
            similarTopSet.has(term)
          ).length;
        }
        totalOverlap += overlapTerms;

        console.log(`\n   ${(idx + 1).toString().padStart(2)}. ${book.title}`);
        console.log(
          `       Similarity: ${book.similarity.toFixed(4)} | Shared Categories: ${sharedCount} | Overlap Terms: ${overlapTerms}`
        );
        console.log(
          `       Categories: ${(book.categories || []).join(", ") || "(none)"}`
        );
        console.log(
          `       ⭐ ${book.rating_avg?.toFixed(1) || "0.0"} | 📝 ${
            book.reviews_count || 0
          } | ❤️ ${book.favorites_count || 0}`
        );
      });

      // Calculate metrics
      const categoryHitRate =
        similarBooks.length > 0 ? matchedCategories / similarBooks.length : 0;
      const keywordOverlapAvg =
        similarBooks.length > 0 ? totalOverlap / similarBooks.length : 0;

      console.log(`\n📊 METRICS:`);
      console.log(
        `   Category Hit Rate: ${matchedCategories}/${similarBooks.length} (${(
          categoryHitRate * 100
        ).toFixed(1)}%)`
      );
      console.log(
        `   Keyword Overlap Avg: ${keywordOverlapAvg.toFixed(2)} terms`
      );

      console.log(`\n✅ INTERPRETATION:`);
      if (categoryHitRate > 0.5) {
        console.log(
          `   ✓ Good category alignment (${(categoryHitRate * 100).toFixed(1)}% share categories)`
        );
      } else if (categoryHitRate > 0) {
        console.log(
          `   ⚠️  Moderate category alignment (${(categoryHitRate * 100).toFixed(1)}% share categories)`
        );
      } else {
        console.log(`   ⚠️  No category overlap (might be TF-IDF based only)`);
      }

      if (keywordOverlapAvg > 2) {
        console.log(
          `   ✓ Strong keyword overlap (avg ${keywordOverlapAvg.toFixed(2)} shared terms)`
        );
      } else if (keywordOverlapAvg > 0) {
        console.log(
          `   ⚠️  Moderate keyword overlap (avg ${keywordOverlapAvg.toFixed(2)} shared terms)`
        );
      } else {
        console.log(`   ⚠️  Low keyword overlap (TF-IDF vectors may be too sparse)`);
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ Analysis complete!");
    console.log("=".repeat(70) + "\n");
  } catch (err: any) {
    console.error("\n❌ Error:", err.message);
    if (process.env.NODE_ENV === "development") {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

// Run the script
checkRecommendReal();