import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";
import { runSeed } from "../seed/run.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pgmigrations (
      nome TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const arquivos = readdirSync(__dirname)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const arquivo of arquivos) {
    const { rows } = await pool.query(
      "SELECT 1 FROM pgmigrations WHERE nome = $1",
      [arquivo],
    );
    if (rows.length > 0) continue;

    const sql = readFileSync(join(__dirname, arquivo), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO pgmigrations (nome) VALUES ($1)", [
        arquivo,
      ]);
      await client.query("COMMIT");
      console.log(`[migrate] aplicada: ${arquivo}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

async function main() {
  await runMigrations();
  await runSeed();
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] falhou:", err);
  process.exit(1);
});
