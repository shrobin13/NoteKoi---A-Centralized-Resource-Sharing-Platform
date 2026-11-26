import "dotenv/config";
import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

/**
 * Integration tests must never touch the development database, so DATABASE_URL
 * is replaced with TEST_DATABASE_URL for the whole test run. The access token
 * secret is required from S1-B1; tests get a throwaway one when the real value
 * is not in the environment.
 */
const TEST_JWT_SECRET = process.env.JWT_SECRET?.trim() || "notekoi-test-secret-not-for-production-use";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      JWT_SECRET: TEST_JWT_SECRET,
      RATE_LIMIT_DISABLED: "true",
      ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {}),
    },
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
