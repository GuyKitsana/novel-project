import * as fs from "fs";
import * as path from "path";
import * as csv from "csv-parser";

type CsvRow = {
  title: string;
  author: string;
  description: string;
  categories: string; // e.g. "fantasy|action_adventure"
  publisher: string;
  cover_image: string;
  buy_link: string;
};

type JsonBook = {
  title: string;
  author: string;
  description: string;
  categories: string[];
  publisher: string;
  cover_image: string;
  store_url: string;
};

// Use process.cwd() for better compatibility across platforms and compiled code
const inputPath = path.join(process.cwd(), "data", "Books.csv");
const outputPath = path.join(process.cwd(), "data", "books.json");

async function readCsv(file: string): Promise<CsvRow[]> {
  return new Promise((resolve, reject) => {
    const rows: CsvRow[] = [];

    if (!fs.existsSync(file)) {
      return reject(new Error(`CSV file not found at: ${file}`));
    }

    fs.createReadStream(file, { encoding: "utf8" })
      .pipe(csv())
      .on("data", (data: any) => {
        rows.push(data as CsvRow);
      })
      .on("end", () => resolve(rows))
      .on("error", (err: any) => reject(err));
  });
}

function normalizeString(value: any): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function transformRow(row: CsvRow): JsonBook {
  const title = normalizeString(row.title);
  const author = normalizeString(row.author);
  const description = normalizeString(row.description);
  const publisher = normalizeString(row.publisher);
  const coverImage = normalizeString(row.cover_image);
  const buyLink = normalizeString(row.buy_link);

  const rawCategories = normalizeString(row.categories);
  const categories =
    rawCategories.length === 0
      ? []
      : rawCategories
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);

  return {
    title,
    author,
    description,
    categories,
    publisher,
    cover_image: coverImage,
    store_url: buyLink,
  };
}

async function csvToJson() {
  console.log("=== CSV → JSON: Books ===");
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}`);

  try {
    const rows = await readCsv(inputPath);
    console.log(`Read ${rows.length} rows from CSV`);

    const jsonBooks: JsonBook[] = rows.map(transformRow);

    fs.writeFileSync(outputPath, JSON.stringify(jsonBooks, null, 2), {
      encoding: "utf8",
    });

    console.log(`Wrote ${jsonBooks.length} rows to JSON`);
    console.log("=== CSV → JSON: Completed ===");
  } catch (error) {
    console.error("CSV → JSON conversion failed:", error);
    process.exitCode = 1;
  }
}

void csvToJson().catch((err) => {
  console.error("Unexpected error in csvToJson:", err);
  process.exitCode = 1;
  process.exit(1);
});


