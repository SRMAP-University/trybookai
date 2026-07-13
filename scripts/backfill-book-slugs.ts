import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const n = await db.book.count();
  const sample = await db.book.findMany({
    take: 5,
    select: { id: true, slug: true, isPublic: true, title: true },
    orderBy: { createdAt: "desc" },
  });
  console.log(JSON.stringify({ count: n, sample }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
