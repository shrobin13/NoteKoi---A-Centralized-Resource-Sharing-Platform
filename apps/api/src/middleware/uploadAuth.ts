import type { RequestHandler } from "express";
import { looksLikeUploadToken, verifyUploadToken } from "../lib/uploadToken.js";
import { bearerToken, loadAuthUserById, resolveAuthUser } from "./checkAuth.js";

/**
 * S3-B8 — the route guard for the endpoints that accept a file body.
 *
 * Accepts either a normal session (cookie / bearer) or the short-lived token
 * from `POST /auth/upload-token`, because a large upload must bypass the
 * gateway's 4.5 MB body limit and therefore goes straight to the API
 * (`Authorization: Bearer <upload token>`, D21).
 *
 * Only the upload token's *scope* decides which path runs: a session token can
 * never widen an upload token's reach, and the upload token can never reach a
 * non-upload route because `verifyAccessToken` rejects the `scope` claim.
 */
export const checkUploadAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = bearerToken(req);

    if (token && looksLikeUploadToken(token)) {
      const claims = verifyUploadToken(token);
      const identity = await loadAuthUserById(claims.userId);

      req.auth = { ...identity, jti: claims.jti, tokenExpiresAt: claims.expiresAt };
      req.uploadToken = { jti: claims.jti, expiresAt: claims.expiresAt };

      next();

      return;
    }

    req.auth = await resolveAuthUser(req);

    next();
  } catch (error) {
    next(error);
  }
};
