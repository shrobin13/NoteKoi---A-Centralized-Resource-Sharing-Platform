import "dotenv/config";
import path from "node:path";
import { z } from "zod";

/** Treat an empty value in `.env` (`SMTP_HOST=`) as "not configured". */
const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalText = (label: string) =>
  z.preprocess(emptyToUndefined, z.string().trim().min(1, `${label} must not be empty when set`).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(5000),
  WEB_ORIGIN: z.url("WEB_ORIGIN must be a valid URL").default("http://localhost:3000"),

  // PostgreSQL — the developer's local instance (never containerised).
  DATABASE_URL: z.url("DATABASE_URL must be a PostgreSQL connection string"),
  TEST_DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z.url("TEST_DATABASE_URL must be a PostgreSQL connection string").optional(),
  ),

  REDIS_URL: z.url("REDIS_URL must be a valid URL").default("redis://localhost:6379"),

  // Auth (S1-B1): tokens are signed from here on, so the secret is mandatory.
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(32, "JWT_SECRET must be at least 32 characters")),
  JWT_EXPIRES_IN: z.string().trim().min(1).default("2h"),

  // Email (S1-B3). Optional in development/test (the mailer prints the OTP to the
  // console instead); mandatory in production — enforced below.
  SMTP_HOST: optionalText("SMTP_HOST"),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
  SMTP_USER: optionalText("SMTP_USER"),
  SMTP_PASS: optionalText("SMTP_PASS"),
  MAIL_FROM: optionalText("MAIL_FROM"),

  // Google Drive — optional until S3-B3/S3-B9 (upload + download).
  GOOGLE_SERVICE_ACCOUNT_JSON: optionalText("GOOGLE_SERVICE_ACCOUNT_JSON"),
  DRIVE_ROOT_FOLDER_ID: optionalText("DRIVE_ROOT_FOLDER_ID"),
  GOOGLE_DRIVE_API_BASE_URL: z.url().default("https://www.googleapis.com/drive/v3"),

  // File storage (S3-B2). Drive is the only provider in production; the local
  // driver keeps development and tests credential-free (git-ignored directory).
  STORAGE_DRIVER: z.preprocess(emptyToUndefined, z.enum(["google-drive", "local"]).optional()),
  LOCAL_STORAGE_DIR: z.string().trim().min(1).default("storage"),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(200).default(50),
  UPLOAD_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(300),

  // Seed script only (S1-B14). Never used by the running API.
  SEED_PASSWORD: z.preprocess(
    emptyToUndefined,
    z.string().min(8, "SEED_PASSWORD must be at least 8 characters").optional(),
  ),

  // Tests only: keeps scripted integration runs under the per-IP limits.
  RATE_LIMIT_DISABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
}).superRefine((value, ctx) => {
  if (value.NODE_ENV !== "production") return;

  if (value.RATE_LIMIT_DISABLED) {
    ctx.addIssue({
      code: "custom",
      path: ["RATE_LIMIT_DISABLED"],
      message: "RATE_LIMIT_DISABLED must not be true in production",
    });
  }

  const missingSmtp = (["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const).filter(
    (key) => !value[key],
  );

  if (missingSmtp.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: [missingSmtp[0] ?? "SMTP_HOST"],
      message: `${missingSmtp.join(", ")} must be set in production (no console fallback for emails)`,
    });
  }

  if (!value.SEED_PASSWORD) {
    ctx.addIssue({
      code: "custom",
      path: ["SEED_PASSWORD"],
      message: "SEED_PASSWORD must be set in production (the seed script refuses to run without it)",
    });
  }

  if (value.STORAGE_DRIVER === "local") {
    ctx.addIssue({
      code: "custom",
      path: ["STORAGE_DRIVER"],
      message: "STORAGE_DRIVER=local is not allowed in production (files must live in Drive)",
    });
  }

  const missingDrive = (["GOOGLE_SERVICE_ACCOUNT_JSON", "DRIVE_ROOT_FOLDER_ID"] as const).filter(
    (key) => !value[key],
  );

  if (missingDrive.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: [missingDrive[0] ?? "GOOGLE_SERVICE_ACCOUNT_JSON"],
      message: `${missingDrive.join(", ")} must be set in production (there is no local storage fallback)`,
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  const message = `Invalid environment configuration:\n${details}\nFix the values in apps/api/.env (see apps/api/.env.example).`;
  console.error(message);
  throw new Error(message);
}

const env = parsed.data;

const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
const driveConfigured = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.DRIVE_ROOT_FOLDER_ID);

/** Single source of truth for every environment value (never read process.env elsewhere). */
export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  isTest: env.NODE_ENV === "test",
  port: env.PORT,
  webOrigin: env.WEB_ORIGIN,
  databaseUrl: env.DATABASE_URL,
  testDatabaseUrl: env.TEST_DATABASE_URL,
  redisUrl: env.REDIS_URL,
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  smtp: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM,
    isConfigured: smtpConfigured,
  },
  drive: {
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    rootFolderId: env.DRIVE_ROOT_FOLDER_ID,
    apiBaseUrl: env.GOOGLE_DRIVE_API_BASE_URL,
    isConfigured: driveConfigured,
  },
  storage: {
    /** Drive whenever it is configured, unless the developer asks for the local driver. */
    driver: env.STORAGE_DRIVER ?? (driveConfigured ? ("google-drive" as const) : ("local" as const)),
    localDir: path.resolve(env.LOCAL_STORAGE_DIR),
    uploadTokenTtlSeconds: env.UPLOAD_TOKEN_TTL_SECONDS,
  },
  maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,

  /** Dev seed script only (S1-B14). */
  seedPassword: env.SEED_PASSWORD,

  /** Only ever true in tests; config refuses it in production. */
  rateLimitDisabled: env.RATE_LIMIT_DISABLED,
} as const;

export type Config = typeof config;
