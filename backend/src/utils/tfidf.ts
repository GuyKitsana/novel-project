
export type SparseVector = Map<string, number>;

export interface BookDocument {
  id: number;
  title: string;
  description?: string | null;
  description_tfidf?: string | null;
  categories: string[];
}

export interface TfIdfResult {
  vectorsByBookId: Map<number, SparseVector>;
  idf: Map<string, number>;
  vocabulary: string[];
}


export function buildDocTokens(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Thai stopwords ที่ขยาย - กรองคำบรรยาย/คำเติม (exact match เท่านั้น)
  const STOP = new Set([
    // คำเชื่อม/บุพบทที่พบบ่อย
    "และ", "กับ", "ใน", "ของ", "ที่", "เป็น", "ไป", "มา", "ให้", "ได้", "จาก",
    "คือ", "ซึ่ง", "เมื่อ", "แล้ว", "เพื่อ", "โดย", "อย่าง", "มาก", "ที่สุด",
    // คำบรรยาย/คำเติม (รวมวลี)
    "หลังจาก", "หลังจากเล่ม", "จบลง", "จบลงที่", "จบ", "ที่", "เล่ม", "พวกเขา",
    "ต้อง", "ในที่สุด", "เหลือ", "ต่าง", "คน", "บางคน", "ที่เหลือ", "คนละทาง",
    "ต่างคนต่าง", "ด้วย", "กัน"
  ]);


  let normalized = text
    .normalize("NFC")
    .toLowerCase();

  normalized = normalized.replace(/[^\p{L}\p{M}\p{N}\s]+/gu, " ");

  normalized = normalized.replace(/\s+/g, " ").trim();

  const rawTokens = normalized.match(/[\p{L}\p{M}]+|[\p{N}]+/gu) ?? [];

  const tokens: string[] = [];

  for (const rawToken of rawTokens) {
    if (rawToken.length === 0) continue;

    if (rawToken.length > 20) continue;

    if (/^\d+$/.test(rawToken)) continue;

    const hasThai = /[\p{Script=Thai}]/u.test(rawToken);

    const hasDigits = /\d/.test(rawToken);
    if (hasDigits) {

      if (hasThai || !/^[a-z0-9]+$/i.test(rawToken)) {
        continue;
      }
    }

    if (hasThai) {
      if (rawToken.length < 2) continue;
    } else {
      if (rawToken.length < 3) continue;
    }

    if (STOP.has(rawToken)) continue;

    tokens.push(rawToken);
  }

  return tokens;
}

export function buildBookDocument(book: BookDocument): string {
  const parts: string[] = [];
  
  const textForTfIdf =
    (book.description_tfidf && book.description_tfidf.trim() !== "")
      ? book.description_tfidf
      : (book.description ?? "");
  if (textForTfIdf) parts.push(textForTfIdf);
  
  if (book.categories && book.categories.length > 0) {
    const catsText = book.categories.join(" ");
    parts.push(catsText);
    parts.push(catsText);
  }
  
  return parts.join(" ");
}

function computeTermFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  const totalTerms = tokens.length;

  if (totalTerms === 0) {
    return tf;
  }

  const termCounts = new Map<string, number>();
  for (const token of tokens) {
    termCounts.set(token, (termCounts.get(token) || 0) + 1);
  }

  for (const [term, count] of termCounts.entries()) {
    tf.set(term, count / totalTerms);
  }

  return tf;
}


function computeDocumentFrequency(
  documents: Array<{ id: number; tokens: string[] }>
): Map<string, number> {
  const df = new Map<string, number>();

  for (const doc of documents) {
    const uniqueTerms = new Set(doc.tokens);
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  return df;
}


function computeIdf(
  df: Map<string, number>,
  totalDocuments: number
): Map<string, number> {
  const idf = new Map<string, number>();

  for (const [term, dfValue] of df.entries()) {
    const idfValue = Math.log((totalDocuments + 1) / (dfValue + 1)) + 1;
    idf.set(term, idfValue);
  }

  return idf;
}


export function computeTfIdfVectors(
  books: BookDocument[]
): TfIdfResult {
  if (books.length === 0) {
    return {
      vectorsByBookId: new Map(),
      idf: new Map(),
      vocabulary: [],
    };
  }

  const documents = books.map((book) => {
    const docText = buildBookDocument(book);
    const tokens = buildDocTokens(docText);
    return { id: book.id, tokens };
  });

  const tfMaps = documents.map((doc) => computeTermFrequency(doc.tokens));

  const df = computeDocumentFrequency(documents);

  const idf = computeIdf(df, documents.length);

  const vectorsByBookId = new Map<number, SparseVector>();

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const tfMap = tfMaps[i];
    const vector = new Map<string, number>();

    for (const [term, tfValue] of tfMap.entries()) {
      const idfValue = idf.get(term) || 0;
      const tfidfValue = tfValue * idfValue;
      
      if (tfidfValue > 0) {
        vector.set(term, tfidfValue);
      }
    }

    vectorsByBookId.set(doc.id, vector);
  }

  const vocabulary = Array.from(idf.keys()).sort();

  return {
    vectorsByBookId,
    idf,
    vocabulary,
  };
}
