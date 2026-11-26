import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { config } from "../config/index.js";
import { AppError } from "../utils/AppError.js";
import { verifyAccessToken } from "./jwt.js";
import { looksLikeUploadToken, signUploadToken, UPLOAD_TOKEN_SCOPE, verifyUploadToken } from "./uploadToken.js";

/**
 * S3-B8 / D21 — the upload token exists so the browser can post a file straight
 * to the API without the gateway's body limit. The one thing that must never
 * happen is an upload token being accepted as a session, so that is asserted
 * first.
 */

const expectUnauthorized = (fn: () => unknown, code: string): void => {
  let thrown: unknown;

  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(AppError);
  expect((thrown as AppError).statusCode).toBe(401);
  expect((thrown as AppError).code).toBe(code);
};

const expiredUploadToken = (): string =>
  jwt.sign({ scope: UPLOAD_TOKEN_SCOPE }, String(config.jwt.secret), {
    algorithm: "HS256",
    subject: "user-1",
    jwtid: "expired-jti",
    expiresIn: -60,
  });

describe("upload token", () => {
  it("round-trips the user id and reports the configured lifetime", () => {
    const signed = signUploadToken("user-1");
    const claims = verifyUploadToken(signed.token);

    expect(claims.userId).toBe("user-1");
    expect(claims.expiresAt).toBe(signed.expiresAt);
    expect(signed.ttlSeconds).toBe(config.storage.uploadTokenTtlSeconds);
  });

  it("is never accepted as a session token", () => {
    expectUnauthorized(() => verifyAccessToken(signUploadToken("user-1").token), "INVALID_TOKEN");
  });

  it("never accepts a session token as an upload token", () => {
    const session = jwt.sign({}, String(config.jwt.secret), {
      algorithm: "HS256",
      subject: "user-1",
      jwtid: "session-jti",
      expiresIn: "1h",
    });

    expectUnauthorized(() => verifyUploadToken(session), "INVALID_UPLOAD_TOKEN");
  });

  it("rejects an expired token", () => {
    expectUnauthorized(() => verifyUploadToken(expiredUploadToken()), "INVALID_UPLOAD_TOKEN");
  });

  it("rejects a token signed with another secret", () => {
    const forged = jwt.sign({ scope: UPLOAD_TOKEN_SCOPE }, "x".repeat(64), {
      algorithm: "HS256",
      subject: "user-1",
      jwtid: "forged-jti",
      expiresIn: "5m",
    });

    expectUnauthorized(() => verifyUploadToken(forged), "INVALID_UPLOAD_TOKEN");
  });

  it("rejects anything that is not a JWT", () => {
    expectUnauthorized(() => verifyUploadToken("not-a-token"), "INVALID_UPLOAD_TOKEN");
  });

  it("lets the middleware tell an upload token from a session token", () => {
    const session = jwt.sign({}, String(config.jwt.secret), {
      algorithm: "HS256",
      subject: "user-1",
      jwtid: "session-jti",
      expiresIn: "1h",
    });

    expect(looksLikeUploadToken(signUploadToken("user-1").token)).toBe(true);
    expect(looksLikeUploadToken(session)).toBe(false);
    expect(looksLikeUploadToken("not-a-token")).toBe(false);
  });
});
