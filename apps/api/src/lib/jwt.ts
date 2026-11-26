import { randomUUID } from "node:crypto";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { Response } from "express";
import { config } from "../config/index.js";
import { AppError } from "../utils/AppError.js";
import { ensureRedis, redis } from "./redis.js";

/** httpOnly cookie that carries the access token in the browser (D20). */
export const ACCESS_TOKEN_COOKIE = "accessToken";

/** The token holds only the identity; roles/scope are loaded from the DB per request. */
export interface AccessTokenClaims {
  sub: string;
  jti: string;
  /** Unix seconds. */
  exp: number;
}

export interface SignedAccessToken {
  token: string;
  jti: string;
  /** Unix seconds, same value as the token's `exp`. */
  expiresAt: number;
  ttlSeconds: number;
}

const secret = (): string => {
  const value = config.jwt.secret;

  if (!value) {
    // config already refuses to boot without it; this keeps the type narrow.
    throw new AppError(503, "Authentication is not configured on this server", "SERVER_MISCONFIGURED");
  }

  return value;
};

const expiresIn = (): SignOptions["expiresIn"] => config.jwt.expiresIn as SignOptions["expiresIn"];

/** Signs a 2 h (configurable) HS256 access token with a fresh `jti`. */
export const signAccessToken = (userId: string): SignedAccessToken => {
  const jti = randomUUID();

  const token = jwt.sign({}, secret(), {
    algorithm: "HS256",
    subject: userId,
    jwtid: jti,
    expiresIn: expiresIn(),
  });

  const decoded = jwt.decode(token);

  if (typeof decoded === "string" || decoded === null || typeof decoded.exp !== "number") {
    throw new AppError(500, "Failed to sign the access token", "TOKEN_SIGN_FAILED");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  return { token, jti, expiresAt: decoded.exp, ttlSeconds: Math.max(decoded.exp - nowSeconds, 0) };
};

/** Verifies signature + expiry; throws `401 INVALID_TOKEN` on any problem. */
export const verifyAccessToken = (token: string): AccessTokenClaims => {
  let decoded: string | JwtPayload;

  try {
    decoded = jwt.verify(token, secret(), { algorithms: ["HS256"] });
  } catch {
    throw AppError.unauthorized("Your session is invalid or has expired", "INVALID_TOKEN");
  }

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.jti !== "string" ||
    typeof decoded.exp !== "number"
  ) {
    throw AppError.unauthorized("Your session is invalid or has expired", "INVALID_TOKEN");
  }

  // D21: short-lived upload tokens are signed with the same secret but are not
  // sessions — they must never authenticate anything except the upload route.
  if (typeof decoded.scope === "string") {
    throw AppError.unauthorized("Your session is invalid or has expired", "INVALID_TOKEN");
  }

  return { sub: decoded.sub, jti: decoded.jti, exp: decoded.exp };
};

/** Writes the httpOnly auth cookie (SameSite=Lax, Secure in production). */
export const setAuthCookie = (
  res: Response,
  signed: Pick<SignedAccessToken, "token" | "ttlSeconds">,
): void => {
  res.cookie(ACCESS_TOKEN_COOKIE, signed.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: signed.ttlSeconds * 1000,
  });
};

export const clearAuthCookie = (res: Response): void => {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
  });
};

// ---------------------------------------------------------------------------
// JWT denylist (D8): logout stores `deny:{jti}` for the token's remaining life.
// Redis is required for the check, so an outage fails closed.
// ---------------------------------------------------------------------------

const DENY_PREFIX = "deny:";

const denyUnavailable = (error: unknown): AppError => {
  console.error(`[jwt] denylist unavailable: ${(error as Error).message}`);

  return AppError.serviceUnavailable(
    "Sessions cannot be validated right now. Please try again in a moment.",
    "DEPENDENCY_UNAVAILABLE",
  );
};

export const denyAccessToken = async (jti: string, ttlSeconds: number): Promise<void> => {
  if (ttlSeconds <= 0) return;

  try {
    await ensureRedis();
    await redis.set(`${DENY_PREFIX}${jti}`, "1", "EX", ttlSeconds);
  } catch (error) {
    throw denyUnavailable(error);
  }
};

export const isAccessTokenDenied = async (jti: string): Promise<boolean> => {
  try {
    await ensureRedis();

    return (await redis.exists(`${DENY_PREFIX}${jti}`)) === 1;
  } catch (error) {
    throw denyUnavailable(error);
  }
};
