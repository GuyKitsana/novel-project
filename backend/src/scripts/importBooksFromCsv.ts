import * as fs from "fs";
import * as path from "path";
import * as csv from "csv-parser";
import * as dotenv from "dotenv";
import { query } from "../db";

dotenv.config();

type CsvRow = {
  title: string;
  author: string;
  description: string;
  categories: string; // pipe separated codes, e.g. "fantasy|action_adventure"
  publisher: string;
  cover_image: string;
  buy_link: string;
};

// Use process.cwd() for better compatibility across platforms and compiled code
const filePath = path.join(process.cwd(), "data", "books.csv");

async function readCsv(file: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];

    if (!fs.existsSync(file)) {
      return reject(new Error(`CSV file not found at: ${file}`));
    }

    fs.createReadStream(file)
      .pipe(csv())
      .on("data", (data: any) => {
        rows.push(data as CsvRow);
      })
      .on("end", () => resolve(rows))
      .on("error", (err: any) => reject(err));
  });
}

async function importBooksFromCsv() {
  console.log("=== CSV Import: Books ===");
  console.log(`Reading file: ${filePath}`);

  try {
    const rows = await readCsv(filePath);
    console.log(`Found ${rows.length} rows in CSV`);

    let importedCount = 0;

    for (const row of rows) {
      const title = row.title?.trim();
      if (!title) {
        console.warn("Skip row without title:", row);
        continue;
      }

      const author = row.author?.trim() || null;
      const description = row.description?.trim() || null;
      const publisher = row.publisher?.trim() || null;
      const coverImage = row.cover_image?.trim() || null;
      const buyLink = row.buy_link?.trim() || null;

      // 1) Insert into books
      const bookResult = await query(
        `
        INSERT INTO books (title, author, description, publisher, cover_image, buy_link)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
        `,
        [title, author, description, publisher, coverImage, buyLink]
      );

      const bookId = (bookResult as any).rows[0].id;

      // 2) Handle categories (pipe-separated by code)
      const rawCategories = row.categories || "";
      const codes = rawCategories
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (codes.length > 0) {
        for (const code of codes) {
          const catRes = await query(
            `SELECT id FROM categories WHERE code = $1`,
            [code]
          );

          if ((catRes as any).rowCount === 0) {
            console.warn(
              `Category code not found "${code}" (book: "${title}")`
            );
            continue;
          }

          const categoryId = (catRes as any).rows[0].id;

          await query(
            `
            INSERT INTO book_categories (book_id, category_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            `,
            [bookId, categoryId]
          );
        }
      }

      importedCount += 1;
    }

    console.log(`Imported ${importedCount} books from CSV`);
    console.log("=== CSV Import: Completed ===");
  } catch (error) {
    console.error("Import failed:", error);
    process.exitCode = 1;
  } finally {
    // Optional: close DB pool if needed
    // await pool.end();
  }
}

// Run when executed directly
void importBooksFromCsv().catch((err) => {
  console.error("Unexpected error in importBooksFromCsv:", err);
  process.exitCode = 1;
  process.exit(1);
});


