import * as dotenv from "dotenv";
import { pool, query } from "../db";

dotenv.config();

async function fixCoverImagePaths() {
  console.log("=== Fixing books.cover_image paths (/books/ -> /uploads/books/) ===");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // นับจำนวนแถวที่ต้องได้รับผลกระทบก่อน (เฉพาะที่ขึ้นต้นด้วย '/books/')
    const countResult = await client.query(
      `SELECT COUNT(*)::int AS cnt FROM books WHERE cover_image LIKE '/books/%'`
    );
    const toUpdate = countResult.rows[0]?.cnt ?? 0;
    console.log(`Rows with invalid cover_image prefix (/books/): ${toUpdate}`);

    if (toUpdate === 0) {
      console.log("No rows need updating. Nothing to do.");
      await client.query("COMMIT");
      return;
    }

    // อัปเดตเฉพาะแถวที่ cover_image เริ่มต้นด้วย '/books/'
    const updateResult = await client.query(
      `
      UPDATE books
      SET cover_image = REPLACE(cover_image, '/books/', '/uploads/books/')
      WHERE cover_image LIKE '/books/%'
      `,
    );

    console.log(`Updated rows: ${updateResult.rowCount}`);

    await client.query("COMMIT");
    console.log("=== Fix completed and committed ===");
  } catch (err) {
    console.error("Fix failed, rolling back:", err);
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("Rollback failed:", rollbackErr);
    }
  } finally {
    client.release();
  }
}

void fixCoverImagePaths()
  .catch((err) => {
    console.error("Unexpected error in fixCoverImagePaths:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    // ให้โปรเซสปิดตัวลงหลังทำงานเสร็จ
    void pool.end();
  });


