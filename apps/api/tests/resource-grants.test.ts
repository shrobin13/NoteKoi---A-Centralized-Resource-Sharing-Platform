import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mailBox = vi.hoisted(() => ({ sent: [] as { to: string; code: string }[] }));

vi.mock("../src/lib/mailer.js", () => ({
  sendOtpEmail: async (input: { to: string; code: string }) => {
    mailBox.sent.push(input);
  },
}));

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10_000)}`;
const password = "Pass1234!";
const emailOf = (kind: string): string => `grants-${kind}-${runId}@test.local`;
const api = () => request(app);

interface SignedUp {
  userId: string;
  cookie: string;
}

interface Fixtures {
  collegeId: string;
  departmentId: string;
  sessionA: string;
  sessionB: string;
  otherDepartmentSession: string;
  courseId: string;
  teacher: SignedUp;
  otherTeacher: SignedUp;
  studentA: SignedUp;
  studentB: SignedUp;
  studentOther: SignedUp;
}

let fixtures: Fixtures;

const cookieFrom = (setCookie: unknown): string => {
  const cookies = (setCookie ?? []) as string[];
  const cookie = cookies.find((value) => value.startsWith("accessToken="));
  if (!cookie) throw new Error("The login response did not set the accessToken cookie");
  return cookie.split(";")[0] as string;
};

const lastCodeFor = (email: string): string => {
  const mail = [...mailBox.sent].reverse().find((entry) => entry.to === email);
  if (!mail) throw new Error(`No email was captured for ${email}`);
  return mail.code;
};

const signUp = async (payload: Record<string, unknown>): Promise<SignedUp> => {
  const email = String(payload.email);
  const registered = await api().post("/api/v1/auth/register").send({ password, ...payload });
  expect(registered.status).toBe(201);
  const verified = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });
  expect(verified.status).toBe(200);
  const loggedIn = await api().post("/api/v1/auth/login").send({ email, password });
  expect(loggedIn.status).toBe(200);
  return { userId: String(registered.body.data.userId), cookie: cookieFrom(loggedIn.headers["set-cookie"]) };
};

const activateTeacher = (userId: string) =>
  prisma.teacherProfile.update({ where: { userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });

const activateStudent = (userId: string) =>
  prisma.studentProfile.update({ where: { userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Grant College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Grant CSE ${runId}` } });
  const otherDepartment = await prisma.department.create({ data: { name: `Grant EEE ${runId}` } });
  await prisma.collegeDepartment.createMany({
    data: [
      { collegeId: college.id, departmentId: department.id },
      { collegeId: college.id, departmentId: otherDepartment.id },
    ],
  });
  const sessionA = await prisma.session.create({ data: { departmentId: department.id, name: `Grant Batch A ${runId}` } });
  const sessionB = await prisma.session.create({ data: { departmentId: department.id, name: `Grant Batch B ${runId}` } });
  const otherDepartmentSession = await prisma.session.create({
    data: { departmentId: otherDepartment.id, name: `Grant Other Batch ${runId}` },
  });
  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Grant Course ${runId}`, semester: 5 },
  });

  fixtures = {
    collegeId: college.id,
    departmentId: department.id,
    sessionA: sessionA.id,
    sessionB: sessionB.id,
    otherDepartmentSession: otherDepartmentSession.id,
    courseId: course.id,
    teacher: { userId: "", cookie: "" },
    otherTeacher: { userId: "", cookie: "" },
    studentA: { userId: "", cookie: "" },
    studentB: { userId: "", cookie: "" },
    studentOther: { userId: "", cookie: "" },
  };

  fixtures.teacher = await signUp({
    role: "TEACHER",
    name: "Grant Teacher",
    email: emailOf("teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.teacher.userId);
  fixtures.otherTeacher = await signUp({
    role: "TEACHER",
    name: "Grant Other Teacher",
    email: emailOf("other-teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.otherTeacher.userId);

  const student = async (kind: string, sessionId: string): Promise<SignedUp> => {
    const user = await signUp({
      role: "STUDENT",
      name: `Grant ${kind}`,
      email: emailOf(kind),
      collegeId: college.id,
      departmentId: department.id,
      sessionId,
      regNo: `REG-grant-${kind}-${runId}`,
    });
    await activateStudent(user.userId);
    return user;
  };

  fixtures.studentA = await student("student-a", sessionA.id);
  fixtures.studentB = await student("student-b", sessionB.id);
  fixtures.studentOther = await student("student-other", sessionA.id);
});

const uploadPrivate = async (title: string): Promise<string> => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", fixtures.teacher.cookie)
    .field({ title, resourceType: "NOTES", courseId: fixtures.courseId })
    .attach("file", Buffer.from(`%PDF-1.4 ${runId} ${title}`, "utf8"), {
      filename: "grant-notes.pdf",
      contentType: "application/pdf",
    });
  expect(response.status).toBe(201);
  return String(response.body.data.id);
};

const publishTo = async (resourceId: string, sessionIds: string[]) =>
  api()
    .post(`/api/v1/resources/${resourceId}/publish`)
    .set("Cookie", fixtures.teacher.cookie)
    .send({ audience: "PERMITTED", sessionIds });

describeWithDatabase("resources: later batch grants (S4-B4)", () => {
  it("adds new batches idempotently and notifies only the newly added active batch", async () => {
    const resourceId = await uploadPrivate(`Add grants ${runId}`);
    const published = await publishTo(resourceId, [fixtures.sessionA]);
    expect(published.status).toBe(200);

    const added = await api()
      .post(`/api/v1/resources/${resourceId}/grants`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ sessionIds: [fixtures.sessionB] });
    expect(added.status).toBe(200);
    expect(added.body.data.audience).toBe("PERMITTED");
    expect(added.body.data.grants.map((grant: { sessionId: string }) => grant.sessionId).sort()).toEqual(
      [fixtures.sessionA, fixtures.sessionB].sort(),
    );

    const sessionBNotifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.studentB.cookie);
    expect(sessionBNotifications.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "RESOURCE_SHARED",
          payload: expect.objectContaining({ resourceId, sessionName: `Grant Batch B ${runId}` }),
        }),
      ]),
    );
    const originalBatchNotifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.studentA.cookie);
    expect(originalBatchNotifications.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ resourceId }) })]),
    );
    expect(
      originalBatchNotifications.body.data.filter(
        (notification: { type: string; payload: { resourceId?: string } }) =>
          notification.type === "RESOURCE_SHARED" && notification.payload.resourceId === resourceId,
      ),
    ).toHaveLength(1);

    const duplicate = await api()
      .post(`/api/v1/resources/${resourceId}/grants`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ sessionIds: [fixtures.sessionB] });
    expect(duplicate.status).toBe(200);
    expect(await prisma.resourceBatchGrant.count({ where: { resourceId } })).toBe(2);
    const notificationsAfterDuplicate = await api().get("/api/v1/notifications").set("Cookie", fixtures.studentB.cookie);
    expect(
      notificationsAfterDuplicate.body.data.filter(
        (notification: { type: string; payload: { resourceId?: string } }) =>
          notification.type === "RESOURCE_SHARED" && notification.payload.resourceId === resourceId,
      ),
    ).toHaveLength(1);
  });

  it("keeps PERMITTED until the final grant is revoked, then returns PRIVATE", async () => {
    const resourceId = await uploadPrivate(`Revoke grants ${runId}`);
    const published = await publishTo(resourceId, [fixtures.sessionA, fixtures.sessionB]);
    expect(published.status).toBe(200);

    const firstRevoke = await api()
      .delete(`/api/v1/resources/${resourceId}/grants/${fixtures.sessionA}`)
      .set("Cookie", fixtures.teacher.cookie);
    expect(firstRevoke.status).toBe(200);
    expect(firstRevoke.body.data).toMatchObject({ audience: "PERMITTED", grants: [{ sessionId: fixtures.sessionB }] });

    const finalRevoke = await api()
      .delete(`/api/v1/resources/${resourceId}/grants/${fixtures.sessionB}`)
      .set("Cookie", fixtures.teacher.cookie);
    expect(finalRevoke.status).toBe(200);
    expect(finalRevoke.body.data).toMatchObject({ audience: "PRIVATE", grants: [] });
    expect(await prisma.resourceBatchGrant.count({ where: { resourceId } })).toBe(0);

    const studentList = await api()
      .get(`/api/v1/resources?courseId=${fixtures.courseId}`)
      .set("Cookie", fixtures.studentA.cookie);
    expect(studentList.body.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: resourceId })]));
  });

  it("rejects malformed, unauthorized, non-owner, and out-of-scope grant requests", async () => {
    const resourceId = await uploadPrivate(`Guard grants ${runId}`);
    await publishTo(resourceId, [fixtures.sessionA]);

    const guest = await api().post(`/api/v1/resources/${resourceId}/grants`).send({ sessionIds: [fixtures.sessionB] });
    expect(guest.status).toBe(401);

    const malformed = await api()
      .post(`/api/v1/resources/${resourceId}/grants`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ sessionIds: [] });
    expect(malformed.status).toBe(400);

    const otherScope = await api()
      .post(`/api/v1/resources/${resourceId}/grants`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ sessionIds: [fixtures.otherDepartmentSession] });
    expect(otherScope.status).toBe(400);
    expect(otherScope.body.code).toBe("INVALID_SESSIONS");

    const wrongOwner = await api()
      .delete(`/api/v1/resources/${resourceId}/grants/${fixtures.sessionA}`)
      .set("Cookie", fixtures.otherTeacher.cookie);
    expect(wrongOwner.status).toBe(404);
    expect(wrongOwner.body.code).toBe("RESOURCE_NOT_FOUND");

    const missingGrant = await api()
      .delete(`/api/v1/resources/${resourceId}/grants/${fixtures.sessionB}`)
      .set("Cookie", fixtures.teacher.cookie);
    expect(missingGrant.status).toBe(404);
    expect(missingGrant.body.code).toBe("RESOURCE_GRANT_NOT_FOUND");
  });
});