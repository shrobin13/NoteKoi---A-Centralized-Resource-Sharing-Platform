import { createHash, createSign } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { StorageProvider } from "../../generated/prisma/enums.js";
import { config } from "../config/index.js";

/**
 * S3-B2 — the one place that talks to a file host.
 *
 * Google Drive is the production provider (A.12: nothing is stored in
 * PostgreSQL). Development and tests fall back to the `LOCAL` driver, which
 * writes into the git-ignored `apps/api/storage/` directory; production refuses
 * to boot with that driver (see `config`), so the fallback can never ship.
 *
 * Everything the rest of the API needs is in this module: store, stream back,
 * delete, and the SHA-256 used for de-duplication (`PhysicalFile.contentHash`).
 */

export interface StoredObject {
  provider: StorageProvider;
  /** Drive file id, or the `PhysicalFile` id that names the local file. */
  fileId: string;
  folderId: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
}

export interface StoreInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  /** Local driver: the `PhysicalFile` id that names the file on disk. */
  fileId: string;
  /** Drive: sub-folder to upload into (defaults to the root folder). */
  folderId?: string | null;
}

export interface StoredFileRef {
  storageProvider: StorageProvider;
  driveFileId: string | null;
  /** Local driver only — the `PhysicalFile` id, i.e. the file name on disk. */
  id: string;
}

export const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

export const storageDriver = (): "GOOGLE_DRIVE" | "LOCAL" =>
  config.isProduction || config.storage.driver === "google-drive" ? "GOOGLE_DRIVE" : "LOCAL";

/** The local driver's directory is created on first use, never committed. */
export const localPathOf = (fileId: string): string => path.join(config.storage.localDir, fileId);

const localFile = async (fileId: string): Promise<string> => {
  await mkdir(config.storage.localDir, { recursive: true });

  return localPathOf(fileId);
};

// ── Google Drive (service account, JWT bearer flow) ───────────────────────────

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const serviceAccount = (): ServiceAccount => {
  if (!config.drive.serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  }

  const parsed: unknown = JSON.parse(config.drive.serviceAccountJson);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as ServiceAccount).client_email !== "string" ||
    typeof (parsed as ServiceAccount).private_key !== "string"
  ) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must contain client_email and private_key");
  }

  return parsed as ServiceAccount;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

const base64url = (value: string | Buffer): string => Buffer.from(value).toString("base64url");

const accessToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;

  const account = serviceAccount();
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/drive.file",
      aud: tokenUri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(account.private_key, "base64url");
  const assertion = `${header}.${claim}.${signature}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token request failed (${response.status})`);
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };

  if (!payload.access_token) throw new Error("Google OAuth token response did not include a token");

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };

  return cachedToken.value;
};

const driveFetch = async (pathAndQuery: string, init: RequestInit = {}): Promise<Response> => {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);

  return fetch(`${config.drive.apiBaseUrl}/${pathAndQuery}`, { ...init, headers });
};

const driveUpload = async (input: StoreInput): Promise<StoredObject> => {
  const folderId = input.folderId ?? config.drive.rootFolderId;
  const metadata = JSON.stringify({
    name: input.fileName,
    parents: folderId ? [folderId] : undefined,
  });
  const boundary = `notekoi-${Date.now().toString(36)}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\ncontent-type: ${input.mimeType}\r\n\r\n`,
    ),
    input.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await driveFetch(
    "files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );

  if (!response.ok) {
    throw new Error(`Google Drive upload failed (${response.status})`);
  }

  const created = (await response.json()) as {
    id?: string;
    webViewLink?: string;
    webContentLink?: string;
  };

  if (!created.id) throw new Error("Google Drive upload response did not include a file id");

  return {
    provider: "GOOGLE_DRIVE",
    fileId: created.id,
    folderId: folderId ?? null,
    webViewLink: created.webViewLink ?? null,
    webContentLink: created.webContentLink ?? null,
  };
};

// ── The storage API the rest of the codebase uses ─────────────────────────────

/** Stores a validated buffer and returns the columns `PhysicalFile` needs. */
export const storeFile = async (input: StoreInput): Promise<StoredObject> => {
  if (storageDriver() === "GOOGLE_DRIVE") return driveUpload(input);

  await writeFile(await localFile(input.fileId), input.buffer);

  return {
    provider: "LOCAL",
    fileId: input.fileId,
    folderId: null,
    webViewLink: null,
    webContentLink: null,
  };
};

/**
 * Streams a stored file back. Downloads are always proxied through the API, so a
 * Drive link never reaches the browser (D18: the file host stays private).
 */
export const openStoredFile = async (file: StoredFileRef): Promise<Readable> => {
  if (file.storageProvider === "GOOGLE_DRIVE") {
    if (!file.driveFileId) throw new Error("PhysicalFile is missing its Drive file id");

    const response = await driveFetch(`files/${file.driveFileId}?alt=media&supportsAllDrives=true`);

    if (!response.ok || !response.body) {
      throw new Error(`Google Drive download failed (${response.status})`);
    }

    return Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
  }

  return createReadStream(localPathOf(file.id));
};

/** Removes the stored bytes (used when a rejected/replaced version is purged). */
export const removeStoredFile = async (file: StoredFileRef): Promise<void> => {
  if (file.storageProvider === "GOOGLE_DRIVE") {
    if (!file.driveFileId) return;

    const response = await driveFetch(`files/${file.driveFileId}?supportsAllDrives=true`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Drive delete failed (${response.status})`);
    }

    return;
  }

  await rm(localPathOf(file.id), { force: true });
};
