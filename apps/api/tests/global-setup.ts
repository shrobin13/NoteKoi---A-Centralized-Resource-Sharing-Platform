import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const apiRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * Brings the test database up to date before any test runs.
 * Skipped (with a warning) when TEST_DATABASE_URL is not filled in yet, so the
 * DB-free unit tests still run.
 */
export default function globalSetup(): void {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

  if (!testDatabaseUrl) {
    console.warn("[vitest] TEST_DATABASE_URL is not set — DB-backed tests are skipped.");
    return;
  }

  if (testDatabaseUrl === process.env.DATABASE_URL?.trim()) {
    throw new Error("[vitest] TEST_DATABASE_URL must differ from DATABASE_URL.");
  }

  const databaseName = new URL(testDatabaseUrl).pathname.split("/").filter(Boolean).at(-1);
  if (!databaseName || !decodeURIComponent(databaseName).endsWith("_test")) {
    throw new Error("[vitest] TEST_DATABASE_URL must point to a database whose name ends in _test.");
  }

  console.log("[vitest] applying migrations to the test database");
  execSync("npx prisma migrate deploy", {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
  });
}
