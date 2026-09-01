import { config } from "dotenv";
import { Pool } from "pg";

config();

const slug = "my-cute-little-one-317bc66c";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const found = await pool.query(
  `SELECT id, title, slug FROM "Book" WHERE slug = $1 OR id = $1`,
  [slug]
);
console.log(JSON.stringify(found.rows, null, 2));

if (found.rows.length === 0) {
  console.error("Book not found");
  await pool.end();
  process.exit(1);
}

const id = found.rows[0].id;
const del = await pool.query(`DELETE FROM "Book" WHERE id = $1 RETURNING id, title, slug`, [
  id,
]);
console.log("deleted", JSON.stringify(del.rows[0]));
await pool.end();
