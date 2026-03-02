
import { SparseVector } from "./tfidf";


function dotProduct(vecA: SparseVector, vecB: SparseVector): number {
  let sum = 0;

  const smaller = vecA.size <= vecB.size ? vecA : vecB;
  const larger = vecA.size <= vecB.size ? vecB : vecA;

  for (const [term, valueA] of smaller.entries()) {
    const valueB = larger.get(term);
    if (valueB !== undefined) {
      sum += valueA * valueB;
    }
  }

  return sum;
}

function norm(vector: SparseVector): number {
  let sumSquares = 0;

  for (const value of vector.values()) {
    sumSquares += value * value;
  }

  return Math.sqrt(sumSquares);
}


export function cosineSimilarity(
  vecA: SparseVector,
  vecB: SparseVector
): number {

  if (vecA.size === 0 || vecB.size === 0) {
    return 0;
  }

  const dot = dotProduct(vecA, vecB);
  const normA = norm(vecA);
  const normB = norm(vecB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (normA * normB);
}


export function findSimilarBooks(
  targetVector: SparseVector,
  candidateVectors: Map<number, SparseVector>,
  excludeBookIds: Set<number> = new Set(),
  limit: number = 10
): Array<{ bookId: number; similarity: number }> {
  const results: Array<{ bookId: number; similarity: number }> = [];

  for (const [bookId, candidateVector] of candidateVectors.entries()) {
    if (excludeBookIds.has(bookId)) {
      continue;
    }

    const similarity = cosineSimilarity(targetVector, candidateVector);
    results.push({ bookId, similarity });
  }

  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, limit);
}
