import { randomUUID } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config/index.js";
import { AppError } from "../utils/AppError.js";

/**
 * S3-B8 / D21 — large uploads must not travel through a serverless function's
 * 4.5 MB body limit, so the browser asks for a **short-lived, upload-scoped**
 * token and posts the file straight to the API.
 *
 * The token is signed with the session secret but carries `scope: "upload"`,
 * which `verifyAccessToken` rejects: it can only ever open `POST /resources`
 * (`/resources/:id/versions`), never a normal read or write.
 */

export const UPLOAD_TOKEN_SCOPE = "upload";

export interface SignedUploadToken {
  token: string;
  /** Unix seconds. */
  expiresAt: number;
  ttlSeconds: number;
}

export interface UploadTokenClaims {
  userId: string;
  jti: string;
  expiresAt: number;
}

const secret = (): string => {
  if (!config.jwt.secret) {
    throw new AppError(503, "Authentication is not configured on this server", "SERVER_MISCONFIGURED");
  }

  return config.jwt.secret;
};

export const signUploadToken = (userId: string): SignedUploadToken => {
  const jti = randomUUID();
  const ttlSeconds = config.storage.uploadTokenTtlSeconds;

  const token = jwt.sign({ scope: UPLOAD_TOKEN_SCOPE }, secret(), {
    algorithm: "HS256",
    subject: userId,
    jwtid: jti,
    expiresIn: ttlSeconds,
  });

  const decoded = jwt.decode(token);

  if (typeof decoded === "string" || decoded === null || typeof decoded.exp !== "number") {
    throw new AppError(500, "Failed to sign the upload token", "TOKEN_SIGN_FAILED");
  }

  return { token, expiresAt: decoded.exp, ttlSeconds };
};

/** Throws `401 INVALID_UPLOAD_TOKEN` unless this is a live upload token. */
export const verifyUploadToken = (token: string): UploadTokenClaims => {
  let decoded: string | JwtPayload;

  try {
    decoded = jwt.verify(token, secret(), { algorithms: ["HS256"] });
  } catch {
    throw AppError.unauthorized("This upload link has expired. Request a new one.", "INVALID_UPLOAD_TOKEN");
  }

  if (
    typeof decoded === "string" ||
    decoded.scope !== UPLOAD_TOKEN_SCOPE ||
    typeof decoded.sub !== "string" ||
    typeof decoded.jti !== "string" ||
    typeof decoded.exp !== "number"
  ) {
    throw AppError.unauthorized("This upload link has expired. Request a new one.", "INVALID_UPLOAD_TOKEN");
  }

  return { userId: decoded.sub, jti: decoded.jti, expiresAt: decoded.exp };
};

/** Cheap pre-check so middleware can tell an upload token from a session token. */
export const looksLikeUploadToken = (token: string): boolean => {
  const decoded = jwt.decode(token);

  return typeof decoded === "object" && decoded !== null && decoded.scope === UPLOAD_TOKEN_SCOPE;
};
