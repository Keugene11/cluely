import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = neon(url);
  const statements = fs
    .readFileSync(path.join(process.cwd(), "src/db/schema.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--")) // strip comment lines first
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement);
    console.log("OK", statement.split("\n")[0].slice(0, 70));
  }
  console.log(`\nApplied ${statements.length} statements to Neon.`);
}

main();
