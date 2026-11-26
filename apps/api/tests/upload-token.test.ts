import cookieParser from "cookie-parser";
import express, { type Application } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { config } from "../src/config/index.js";
import { prisma } from "../src/lib/prisma.js";
import { globalErrorHandler } from "../src/middleware/globalErrorHandler.js";
import { notFound } from "../src/middleware/notFound.js";
import { checkUploadAuth } from "../src/middleware/uploadAuth.js";

/**
 * S3-B8 / D21 — the upload token flow end to end:
 * `POST /auth/upload-token` with a session → a short-lived bearer that only the
 * upload guard accepts, and that a normal route rejects.
 *
 * This file owns its fixtures (its own college/department/session/student) so it
 * never depends on the order of `tests/auth.test.ts`.
 */

const mailBox = vi.hoisted(() => ({ sent: [] as { to: string; code: string }[] }));

vi.mock("../src/lib/mailer.js", () => ({
  sendOtpEmail: async (input: { to: string; code: string }) => {
    mailBox.sent.push(input);
  },
}));

const lastCodeFor = (to: string): string => {
  const mail = [...mailBox.sent].reverse().find((entry) => entry.to === to);

  if (!mail) throw new Error(`No email was captured for ${to}`);

  return mail.code;
};

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10_000)}`;
const PASSWORD = "Pass1234!";
const EMAIL = `upload-token-${runId}@test.local`;

const api = () => request(app);

let userId = "";
let accessToken = "";
let authCookie = "";
let uploadToken = "";

/** The smallest app that uses the upload guard, so the token can be probed. */
const probeApp = (): Application => {
  const probe = express();
  probe.use(express.json());
  probe.use(cookieParser());
  probe.post("/probe", checkUploadAuth, (req, res) => {
    res.json({ userId: req.auth?.userId, viaUploadToken: Boolean(req.uploadToken) });
  });
  probe.use(notFound);
  probe.use(globalErrorHandler);

  return probe;
};

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Upload Token College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Upload Token Dept ${runId}` } });

  await prisma.collegeDepartment.create({ data: { collegeId: college.id, departmentId: department.id } });

  const session = await prisma.session.create({
    data: { departmentId: department.id, name: `Upload Token Session ${runId}` },
  });

  const registered = await api()
    .post("/api/v1/auth/register")
    .send({
      role: "STUDENT",
      name: "Upload Token Student",
      email: EMAIL,
      password: PASSWORD,
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: `REG-upload-${runId}`,
    });

  expect(registered.status).toBe(201);
  userId = String(registered.body.data.userId);

  const verified = await api().post("/api/v1/auth/verify-email").send({ email: EMAIL, code: lastCodeFor(EMAIL) });

  expect(verified.status).toBe(200);

  const loggedIn = await api().post("/api/v1/auth/login").send({ email: EMAIL, password: PASSWORD });

  expect(loggedIn.status).toBe(200);

  accessToken = loggedIn.body.data.token as string;

  const cookies = loggedIn.headers["set-cookie"] as unknown as string[];
  const cookie = cookies.find((value) => value.startsWith("accessToken="));

  authCookie = (cookie as string).split(";")[0] as string;
});

describeWithDatabase("auth: upload token (S3-B8)", () => {
  it("requires a signed-in user", async () => {
    const response = await api().post("/api/v1/auth/upload-token");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("NOT_AUTHENTICATED");
  });

  it("issues a short-lived bearer to a signed-in user", async () => {
    const response = await api().post("/api/v1/auth/upload-token").set("Cookie", authCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ tokenType: "Bearer" });
    expect(response.body.data.expiresInSeconds).toBe(config.storage.uploadTokenTtlSeconds);

    uploadToken = response.body.data.token as string;

    expect(uploadToken).toEqual(expect.any(String));
  });

  it("is not accepted as a session by a normal route", async () => {
    const response = await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${uploadToken}`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_TOKEN");
  });

  it("is accepted by the upload guard instead of a session", async () => {
    const response = await request(probeApp())
      .post("/probe")
      .set("Authorization", `Bearer ${uploadToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId, viaUploadToken: true });
  });

  it("still lets the upload route accept a normal session", async () => {
    const response = await request(probeApp()).post("/probe").set("Cookie", authCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId, viaUploadToken: false });
  });

  it("rejects a bearer that is neither a session nor an upload token", async () => {
    const response = await request(probeApp()).post("/probe").set("Authorization", "Bearer not-a-jwt");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_TOKEN");
  });

  it("keeps the session usable while the upload token exists", async () => {
    const response = await api().get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.email).toBe(EMAIL);
  });
});
