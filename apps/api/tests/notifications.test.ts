import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createNotifications,
  notifyUsers,
} from "../src/module/notification/notification.service.js";

/**
 * S3-B5 — notifications: the read/mark-as-read API plus the fan-out helper that
 * moderation (S3-B6) and the publish/delete flows (Slice 4) call.
 *
 * Fixtures: two students, a teacher and a "pager" student. Rows are written through
 * the helper itself, because that is the only writer production code will use.
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
const emailOf = (kind: string): string => `notify-${kind}-${runId}@test.local`;

const api = () => request(app);

const cookieFrom = (setCookie: unknown): string => {
  const cookies = (setCookie ?? []) as string[];
  const cookie = cookies.find((value) => value.startsWith("accessToken="));

  if (!cookie) throw new Error("The login response did not set the accessToken cookie");

  return cookie.split(";")[0] as string;
};

interface SignedUp {
  userId: string;
  cookie: string;
}

const signUpStudent = async (kind: string, regNo: string): Promise<SignedUp> => {
  const email = emailOf(kind);
  const registered = await api().post("/api/v1/auth/register").send({
    password: PASSWORD,
    role: "STUDENT",
    name: `Notify ${kind}`,
    email,
    collegeId: fixtures.collegeId,
    departmentId: fixtures.departmentId,
    sessionId: fixtures.sessionId,
    regNo,
  });

  expect(registered.status).toBe(201);

  const verified = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });

  expect(verified.status).toBe(200);

  const loggedIn = await api().post("/api/v1/auth/login").send({ email, password: PASSWORD });

  expect(loggedIn.status).toBe(200);

  await prisma.studentProfile.update({
    where: { userId: String(registered.body.data.userId) },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });

  return { userId: String(registered.body.data.userId), cookie: cookieFrom(loggedIn.headers["set-cookie"]) };
};

let fixtures = { collegeId: "", departmentId: "", sessionId: "" };


const people = {
  a: { userId: "", cookie: "" },
  b: { userId: "", cookie: "" },
  pager: { userId: "", cookie: "" },
};

const RESOURCE_A = "22222222-2222-4222-8222-222222222222";
const RESOURCE_B = "33333333-3333-4333-8333-333333333333";

const ownRows = (cookie: string, query: Record<string, string | number> = {}) =>
  api().get("/api/v1/notifications").query(query).set("Cookie", cookie);

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Notify College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Notify CSE ${runId}` } });

  await prisma.collegeDepartment.create({ data: { collegeId: college.id, departmentId: department.id } });

  const session = await prisma.session.create({
    data: { departmentId: department.id, name: `Notify Batch ${runId}` },
  });

  fixtures = { collegeId: college.id, departmentId: department.id, sessionId: session.id };

  people.a = await signUpStudent("a", `NT-A-${runId}`);
  people.b = await signUpStudent("b", `NT-B-${runId}`);
  people.pager = await signUpStudent("pager", `NT-P-${runId}`);

  // Fan-out with a duplicated recipient: one row per user, never two.
  const fannedOut = await notifyUsers(prisma, {
    userIds: [people.a.userId, people.b.userId, people.a.userId],
    type: "RESOURCE_SHARED",
    payload: {
      resourceId: RESOURCE_A,
      resourceTitle: `Shared ${runId}`,
      sessionName: `Notify Batch ${runId}`,
    },
  });

  expect(fannedOut).toBe(2);

  await createNotifications(prisma, [
    {
      userId: people.a.userId,
      type: "RESOURCE_APPROVED",
      payload: { resourceId: RESOURCE_B, resourceTitle: `Approved ${runId}` },
    },
  ]);

  for (const index of [1, 2, 3]) {
    await createNotifications(prisma, [
      {
        userId: people.pager.userId,
        type: "RESOURCE_SHARED",
        payload: { resourceTitle: `Pager ${runId} ${index}` },
      },
    ]);
  }
});

describeWithDatabase("notifications (S3-B5)", () => {
  it("refuses an anonymous caller", async () => {
    const response = await api().get("/api/v1/notifications");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("NOT_AUTHENTICATED");
  });

  it("lists only my rows, newest first, with the unread count", async () => {
    const response = await ownRows(people.a.cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].type).toBe("RESOURCE_APPROVED");
    expect(response.body.data[1].type).toBe("RESOURCE_SHARED");
    expect(response.body.data[1].payload).toMatchObject({
      resourceId: RESOURCE_A,
      sessionName: `Notify Batch ${runId}`,
    });
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 20, total: 2, totalPages: 1, unread: 2 });
  });

  it("filters to unread rows without losing the unread count", async () => {
    const response = await ownRows(people.a.cookie, { unreadOnly: "true" });

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta.unread).toBe(2);
  });

  it("marks one row read and is idempotent on the second call", async () => {
    const newest = ((await ownRows(people.a.cookie)).body.data as { id: string }[])[0] as { id: string };
    const first = await api().post(`/api/v1/notifications/${newest.id}/read`).set("Cookie", people.a.cookie);
    const second = await api().post(`/api/v1/notifications/${newest.id}/read`).set("Cookie", people.a.cookie);

    expect(first.status).toBe(200);
    expect(first.body.data.readAt).toBeTruthy();
    expect(second.status).toBe(200);
    expect(second.body.data.readAt).toBe(first.body.data.readAt);

    const after = await ownRows(people.a.cookie);

    expect(after.body.meta.unread).toBe(1);
  });

  it("refuses to mark someone else's row and leaves it unread", async () => {
    const bRow = await prisma.notification.findFirstOrThrow({
      where: { userId: people.b.userId },
      select: { id: true },
    });

    const response = await api().post(`/api/v1/notifications/${bRow.id}/read`).set("Cookie", people.a.cookie);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe("NOTIFICATION_NOT_FOUND");

    const untouched = await prisma.notification.findUniqueOrThrow({
      where: { id: bRow.id },
      select: { readAt: true },
    });

    expect(untouched.readAt).toBeNull();
  });

  it("marks everything read exactly once", async () => {
    const first = await api().post("/api/v1/notifications/read-all").set("Cookie", people.a.cookie);
    const second = await api().post("/api/v1/notifications/read-all").set("Cookie", people.a.cookie);

    expect(first.status).toBe(200);
    expect(first.body.data.updated).toBe(1);
    expect(second.body.data.updated).toBe(0);
    expect((await ownRows(people.a.cookie)).body.meta.unread).toBe(0);
    expect((await ownRows(people.a.cookie, { unreadOnly: "true" })).body.data).toHaveLength(0);
  });

  it("paginates", async () => {
    const firstPage = await ownRows(people.pager.cookie, { pageSize: 2, page: 1 });
    const secondPage = await ownRows(people.pager.cookie, { pageSize: 2, page: 2 });

    expect(firstPage.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(firstPage.body.data).toHaveLength(2);
    expect(secondPage.body.data).toHaveLength(1);
  });

  it("answers 400 for an invalid page size and an invalid id", async () => {
    const badPage = await ownRows(people.a.cookie, { pageSize: 500 });
    const badId = await api().post("/api/v1/notifications/not-a-uuid/read").set("Cookie", people.a.cookie);

    expect(badPage.status).toBe(400);
    expect(badPage.body.code).toBe("VALIDATION_ERROR");
    expect(badId.status).toBe(400);
    expect(badId.body.code).toBe("VALIDATION_ERROR");
  });

  it("never notifies the actor and skips an empty fan-out", async () => {
    const before = await prisma.notification.count({ where: { userId: people.b.userId } });
    const written = await notifyUsers(prisma, {
      userIds: [people.a.userId, people.a.userId],
      type: "RESOURCE_DELETED",
      payload: { resourceId: RESOURCE_B, reason: "Removed by the CR" },
      excludeUserId: people.a.userId,
    });
    const empty = await createNotifications(prisma, []);

    expect(before).toBe(1);
    expect(written).toBe(0);
    expect(empty).toBe(0);
  });
});
