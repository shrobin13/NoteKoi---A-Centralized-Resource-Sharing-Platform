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
const emailOf = (kind: string): string => `publish-${kind}-${runId}@test.local`;
const api = () => request(app);

interface SignedUp {
  userId: string;
  cookie: string;
}

interface Fixtures {
  collegeId: string;
  departmentId: string;
  otherDepartmentId: string;
  sessionId: string;
  otherSessionId: string;
  otherDepartmentSessionId: string;
  courseId: string;
  teacher: SignedUp;
  otherTeacher: SignedUp;
  studentA: SignedUp;
  studentB: SignedUp;
  studentOtherSession: SignedUp;
  studentInactive: SignedUp;
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
  prisma.teacherProfile.update({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });

const activateStudent = (userId: string) =>
  prisma.studentProfile.update({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Publish College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Publish CSE ${runId}` } });
  const otherDepartment = await prisma.department.create({ data: { name: `Publish EEE ${runId}` } });
  await prisma.collegeDepartment.createMany({
    data: [
      { collegeId: college.id, departmentId: department.id },
      { collegeId: college.id, departmentId: otherDepartment.id },
    ],
  });
  const session = await prisma.session.create({ data: { departmentId: department.id, name: `Publish Batch A ${runId}` } });
  const otherSession = await prisma.session.create({ data: { departmentId: department.id, name: `Publish Batch B ${runId}` } });
  const otherDepartmentSession = await prisma.session.create({
    data: { departmentId: otherDepartment.id, name: `Publish Other Batch ${runId}` },
  });
  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Publish Course ${runId}`, semester: 4 },
  });
  await prisma.course.create({
    data: { departmentId: otherDepartment.id, name: `Other Publish Course ${runId}`, semester: 4 },
  });

  fixtures = {
    collegeId: college.id,
    departmentId: department.id,
    otherDepartmentId: otherDepartment.id,
    sessionId: session.id,
    otherSessionId: otherSession.id,
    otherDepartmentSessionId: otherDepartmentSession.id,
    courseId: course.id,
    teacher: { userId: "", cookie: "" },
    otherTeacher: { userId: "", cookie: "" },
    studentA: { userId: "", cookie: "" },
    studentB: { userId: "", cookie: "" },
    studentOtherSession: { userId: "", cookie: "" },
    studentInactive: { userId: "", cookie: "" },
  };

  fixtures.teacher = await signUp({
    role: "TEACHER",
    name: "Publish Teacher",
    email: emailOf("teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.teacher.userId);
  fixtures.otherTeacher = await signUp({
    role: "TEACHER",
    name: "Other Publish Teacher",
    email: emailOf("other-teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.otherTeacher.userId);

  const seedStudent = async (kind: string, sessionId: string): Promise<SignedUp> =>
    signUp({
      role: "STUDENT",
      name: `Publish ${kind}`,
      email: emailOf(kind),
      collegeId: college.id,
      departmentId: department.id,
      sessionId,
      regNo: `REG-pub-${kind}-${runId}`,
    });

  fixtures.studentA = await seedStudent("student-a", session.id);
  await activateStudent(fixtures.studentA.userId);
  fixtures.studentB = await seedStudent("student-b", session.id);
  await activateStudent(fixtures.studentB.userId);
  fixtures.studentOtherSession = await seedStudent("student-other", otherSession.id);
  await activateStudent(fixtures.studentOtherSession.userId);
  fixtures.studentInactive = await seedStudent("student-inactive", session.id);
});

const uploadPrivateResource = async (cookie: string, title: string) => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", cookie)
    .field({ title, resourceType: "NOTES", courseId: fixtures.courseId })
    .attach("file", Buffer.from(`%PDF-1.4 ${runId} ${title}`, "utf8"), {
      filename: "private-notes.pdf",
      contentType: "application/pdf",
    });
  expect(response.status).toBe(201);
  return String(response.body.data.id);
};

describeWithDatabase("resources: publish teacher files (S4-B3)", () => {
  it("publishes PERMITTED with grants and notifies only active students in granted sessions", async () => {
    const resourceId = await uploadPrivateResource(fixtures.teacher.cookie, `Permitted publish ${runId}`);
    const published = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ audience: "PERMITTED", sessionIds: [fixtures.sessionId] });

    expect(published.status).toBe(200);
    expect(published.body.data).toMatchObject({ audience: "PERMITTED", state: "APPROVED" });
    expect(published.body.data.grants).toEqual([
      { sessionId: fixtures.sessionId, sessionName: `Publish Batch A ${runId}` },
    ]);
    expect(await prisma.resourceBatchGrant.count({ where: { resourceId } })).toBe(1);

    for (const student of [fixtures.studentA, fixtures.studentB]) {
      const notifications = await api().get("/api/v1/notifications").set("Cookie", student.cookie);
      expect(notifications.status).toBe(200);
      expect(notifications.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "RESOURCE_SHARED",
            payload: expect.objectContaining({ resourceId, sessionName: `Publish Batch A ${runId}` }),
          }),
        ]),
      );
    }

    const outsiderNotifications = await api()
      .get("/api/v1/notifications")
      .set("Cookie", fixtures.studentOtherSession.cookie);
    expect(outsiderNotifications.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ resourceId }) })]),
    );
    const inactiveNotifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.studentInactive.cookie);
    expect(inactiveNotifications.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ resourceId }) })]),
    );

    const visibleToRecipient = await api()
      .get(`/api/v1/resources?courseId=${fixtures.courseId}`)
      .set("Cookie", fixtures.studentA.cookie);
    const visibleToOtherSession = await api()
      .get(`/api/v1/resources?courseId=${fixtures.courseId}`)
      .set("Cookie", fixtures.studentOtherSession.cookie);
    expect(visibleToRecipient.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: resourceId })]));
    expect(visibleToOtherSession.body.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: resourceId })]));
  });

  it("publishes PLATFORM without creating session grants or shared notifications", async () => {
    const resourceId = await uploadPrivateResource(fixtures.teacher.cookie, `Platform publish ${runId}`);
    const response = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ audience: "PLATFORM" });

    expect(response.status).toBe(200);
    expect(response.body.data.audience).toBe("PLATFORM");
    expect(await prisma.resourceBatchGrant.count({ where: { resourceId } })).toBe(0);

    const guestList = await api().get(`/api/v1/resources?courseId=${fixtures.courseId}`);
    expect(guestList.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: resourceId })]));
    const notifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.studentA.cookie);
    expect(notifications.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ payload: expect.objectContaining({ resourceId }) })]),
    );
  });

  it("rejects malformed or out-of-department batch grants without changing the audience", async () => {
    const resourceId = await uploadPrivateResource(fixtures.teacher.cookie, `Invalid publish ${runId}`);
    const missingSessions = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ audience: "PERMITTED" });
    expect(missingSessions.status).toBe(400);

    const wrongDepartment = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ audience: "PERMITTED", sessionIds: [fixtures.otherDepartmentSessionId] });
    expect(wrongDepartment.status).toBe(400);
    expect(wrongDepartment.body.code).toBe("INVALID_SESSIONS");

    const unchanged = await prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, select: { audience: true } });
    expect(unchanged.audience).toBe("PRIVATE");
  });

  it("requires authentication, teacher role, and ownership", async () => {
    const resourceId = await uploadPrivateResource(fixtures.teacher.cookie, `Guarded publish ${runId}`);
    const guest = await api().post(`/api/v1/resources/${resourceId}/publish`).send({ audience: "PLATFORM" });
    expect(guest.status).toBe(401);

    const wrongRole = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.studentA.cookie)
      .send({ audience: "PLATFORM" });
    expect(wrongRole.status).toBe(403);
    expect(wrongRole.body.code).toBe("FORBIDDEN_ROLE");

    const wrongOwner = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.otherTeacher.cookie)
      .send({ audience: "PLATFORM" });
    expect(wrongOwner.status).toBe(404);
    expect(wrongOwner.body.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("only publishes PRIVATE resources once", async () => {
    const resourceId = await uploadPrivateResource(fixtures.teacher.cookie, `Publish once ${runId}`);
    const first = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ audience: "PLATFORM" });
    expect(first.status).toBe(200);

    const second = await api()
      .post(`/api/v1/resources/${resourceId}/publish`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({ audience: "PLATFORM" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("RESOURCE_NOT_PRIVATE");
  });
});