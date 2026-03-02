import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { query } from "../db";

dotenv.config();

type JsonBook = {
  title: string;
  author?: string;
  description?: string;
  categories?: string | string[];
  publisher?: string;
  cover_image?: string;
  store_url?: string;
};

// Use process.cwd() for better compatibility across platforms and compiled code
const filePath = path.join(process.cwd(), "data", "books.json");

function normalizeString(value: any): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseCategoryCodes(raw: string | string[] | undefined): string[] {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((c) =>
        normalizeString(c)
          .toLowerCase()
          .replace(/_/g, "-")
      )
      .filter((c) => c.length > 0);
  }

  // string: e.g. "fantasy|action_adventure"
  const str = normalizeString(raw);
  if (!str) return [];

  return str
    .split("|")
    .map((c) =>
      c
        .trim()
        .toLowerCase()
        .replace(/_/g, "-")
    )
    .filter((c) => c.length > 0);
}

async function readJson(file: string): Promise<JsonBook[]> {
  if (!fs.existsSync(file)) {
    throw new Error(`JSON file not found at: ${file}`);
  }

  console.log(`[readJson] Reading JSON from: ${file}`);

  const raw = fs.readFileSync(file, { encoding: "utf8" });
  const data = JSON.parse(raw);

  // รองรับทั้ง array ตรง ๆ หรือ { books: [...] }
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as any).books)
    ? (data as any).books
    : null;

  if (!arr) {
    throw new Error("books.json must contain a JSON array (optionally under 'books' key)");
  }

  console.log(`[readJson] Parsed JSON length: ${arr.length}`);
  if (arr.length > 0) {
    console.log("[readJson] First row sample:", arr[0]);
  }

  return arr as JsonBook[];
}

async function importBooksFromJson() {
  console.log("=== JSON Import: Books ===");
  console.log(`Reading file: ${filePath}`);

  try {
    // 1) ตรวจสอบการเชื่อมต่อฐานข้อมูล
    try {
      await query("SELECT 1");
      console.log("DB connection OK");
    } catch (dbErr) {
      console.error("DB connection failed:", dbErr);
      process.exitCode = 1;
      return;
    }

    // 2) โหลดไฟล์ JSON
    const books = await readJson(filePath);
    console.log(`Found ${books.length} books in JSON`);

    let importedCount = 0;

    for (const rawBook of books) {
      try {
        const title = normalizeString(rawBook.title);
        if (!title) {
          console.warn("[SKIP] Entry without title. Raw entry:", rawBook);
          continue;
        }

        const author = normalizeString(rawBook.author);
        const description = normalizeString(rawBook.description);
        const publisher = normalizeString(rawBook.publisher);
        const coverImage = normalizeString(rawBook.cover_image);
        const storeUrl = normalizeString(rawBook.store_url);

        console.log(`\n--- Inserting book: "${title}" ---`);

        // 1) Insert into books
        const bookResult = await query(
          `
          INSERT INTO books (title, author, description, publisher, cover_image, buy_link)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
          `,
          [
            title,
            author || null,
            description || null,
            publisher || null,
            coverImage || null,
            storeUrl || null,
          ]
        );

        const bookId = (bookResult as any).rows[0].id as number;
        console.log(`Inserted book with id=${bookId}`);

        // 2) Handle categories via categories.code
        const codes = parseCategoryCodes(rawBook.categories);
        console.log(
          codes.length
            ? `Parsed category codes for "${title}": ${codes.join(", ")}`
            : `No categories for "${title}"`
        );

        if (codes.length > 0) {
          for (const code of codes) {
            console.log(`Looking up category code "${code}" for "${title}"`);

            const catRes = await query(
              `SELECT id FROM categories WHERE LOWER(REPLACE(code, '_', '-')) = $1`,
              [code]
            );

            if ((catRes as any).rowCount === 0) {
              console.warn(
                `[WARN] Category code not found after normalization "${code}" (book: "${title}")`
              );
              continue;
            }

            const categoryId = (catRes as any).rows[0].id as number;
            console.log(
              `Resolved category code "${code}" -> category_id=${categoryId}`
            );

            await query(
              `
              INSERT INTO book_categories (book_id, category_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
              `,
              [bookId, categoryId]
            );

            console.log(
              `Inserted relation book_id=${bookId}, category_id=${categoryId}`
            );
          }
        }

        importedCount += 1;
      } catch (bookErr) {
        console.error("[ERROR] Importing book entry failed. Raw entry:", rawBook);
        console.error(bookErr);
      }
    }

    console.log(`Imported ${importedCount} books from JSON`);
    console.log("=== JSON Import: Completed ===");
  } catch (error) {
    console.error("JSON import failed:", error);
    process.exitCode = 1;
  }
}

void importBooksFromJson().catch((err) => {
  console.error("Unexpected error in importBooksFromJson:", err);
  process.exitCode = 1;
  process.exit(1);
});


