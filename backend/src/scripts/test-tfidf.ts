import { computeTfIdfVectors } from "../utils/tfidf";
import { cosineSimilarity } from "../utils/similarity";

/**
 * Manual TF-IDF + Cosine Similarity Test
 * Run with: npx ts-node src/scripts/test-tfidf.ts
 */

// Mock books (NO DATABASE)
const books = [
  {
    id: 1,
    title: "จอมมารต่างโลก",
    description: "แฟนตาซี เวทมนตร์ ต่างโลก มอนสเตอร์",
    categories: ["Fantasy"],
  },
  {
    id: 2,
    title: "ผู้กล้าแห่งเวทมนตร์",
    description: "แฟนตาซี เวทมนตร์ ผู้กล้า จอมมาร",
    categories: ["Fantasy"],
  },
  {
    id: 3,
    title: "รักในรั้วมหาลัย",
    description: "โรแมนติก ความรัก วัยรุ่น มหาวิทยาลัย",
    categories: ["Romance"],
  },
  {
    id: 4,
    title: "สาวน้อยกับมังกร",
    description: "แฟนตาซี มังกร ความรัก ผจญภัย",
    categories: ["Fantasy", "Romance"],
  },
];

// Compute TF-IDF
const { vectorsByBookId } = computeTfIdfVectors(books);

console.log("\n==============================");
console.log("🔎 TOP TF-IDF KEYWORDS PER BOOK");
console.log("==============================");

for (const book of books) {
  const vec = vectorsByBookId.get(book.id);
  if (!vec) continue;

  // Sort by TF-IDF score, but prioritize full words (longer tokens) when scores are close
  const topTerms = [...vec.entries()]
    .sort((a, b) => {
      // Primary: TF-IDF score
      if (Math.abs(b[1] - a[1]) > 0.01) {
        return b[1] - a[1];
      }
      // Secondary: prefer longer tokens (full words over bigrams)
      return b[0].length - a[0].length;
    })
    .slice(0, 10);

  console.log(`\n📘 Book ${book.id}: ${book.title}`);
  console.log(`   Total tokens in vector: ${vec.size}`);
  
  // Show top 6 full-word tokens first, then others
  const fullWords = topTerms.filter(([term]) => term.length >= 3).slice(0, 6);
  const bigrams = topTerms.filter(([term]) => term.length === 2).slice(0, 3);
  
  console.log(`   Full words (length >= 3):`);
  for (const [term, score] of fullWords) {
    console.log(`     ${term}: ${score.toFixed(4)}`);
  }
  if (bigrams.length > 0) {
    console.log(`   Bigrams (sample):`);
    for (const [term, score] of bigrams) {
      console.log(`     ${term}: ${score.toFixed(4)}`);
    }
  }
}

console.log("\n==============================");
console.log("📐 COSINE SIMILARITY MATRIX");
console.log("==============================");

for (const a of books) {
  for (const b of books) {
    if (a.id >= b.id) continue; // Only show each pair once

    const vecA = vectorsByBookId.get(a.id);
    const vecB = vectorsByBookId.get(b.id);
    
    if (!vecA || !vecB) continue;

    const sim = cosineSimilarity(vecA, vecB);

    console.log(
      `sim(Book ${a.id} ↔ Book ${b.id}) = ${sim.toFixed(4)}`
    );
  }
}

console.log("\n✅ EXPECTED RESULT:");
console.log("- Book 1 & 2 similarity should be HIGH");
console.log("- Book 1 & 3 similarity should be LOW");
console.log("- Book 4 should be in-between (Fantasy + Romance)");
