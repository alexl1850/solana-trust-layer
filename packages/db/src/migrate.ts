import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const applied = new Set(
    (await client.query<{ filename: string }>("select filename from schema_migrations")).rows.map(
      (r) => r.filename,
    ),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`Applying migration: ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }

  console.log(`Migrations up to date (${files.length} total).`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
