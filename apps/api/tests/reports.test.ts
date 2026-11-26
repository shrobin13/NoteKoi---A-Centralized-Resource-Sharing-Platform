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
const emailOf = (kind: string): string => `report-${kind}-${runId}@test.local`;
const api = () => request(app);

interface SignedUp {
  userId: string;
  cookie: string;
}

interface Fixtures {
  collegeId: string;
  departmentId: string;
  sessionId: string;
  otherSessionId: string;
  courseId: string;
  reporter: SignedUp;
  uploader: SignedUp;
  cr: SignedUp;
  otherCr: SignedUp;
  teacher: SignedUp;
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

const activateStudent = (userId: string) =>
  prisma.studentProfile.update({ where: { userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });

const activateTeacher = (userId: string) =>
  prisma.teacherProfile.update({ where: { userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Report College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Report CSE ${runId}` } });
  await prisma.collegeDepartment.create({ data: { collegeId: college.id, departmentId: department.id } });
  const session = await prisma.session.create({ data: { departmentId: department.id, name: `Report Batch A ${runId}` } });
  const otherSession = await prisma.session.create({ data: { departmentId: department.id, name: `Report Batch B ${runId}` } });
  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Report Course ${runId}`, semester: 6 },
  });

  fixtures = {
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    otherSessionId: otherSession.id,
    courseId: course.id,
    reporter: { userId: "", cookie: "" },
    uploader: { userId: "", cookie: "" },
    cr: { userId: "", cookie: "" },
    otherCr: { userId: "", cookie: "" },
    teacher: { userId: "", cookie: "" },
  };

  const student = async (kind: string, sessionId: string): Promise<SignedUp> => {
    const user = await signUp({
      role: "STUDENT",
      name: `Report ${kind}`,
      email: emailOf(kind),
      collegeId: college.id,
      departmentId: department.id,
      sessionId,
      regNo: `REG-report-${kind}-${runId}`,
    });
    await activateStudent(user.userId);
    return user;
  };

  fixtures.reporter = await student("reporter", session.id);
  fixtures.uploader = await student("uploader", session.id);
  fixtures.cr = await student("cr", session.id);
  fixtures.otherCr = await student("other-cr", otherSession.id);
  await prisma.userRole.createMany({
    data: [
      {
        userId: fixtures.cr.userId,
        role: "CR",
        scope: "DEPARTMENT_SESSION",
        collegeId: college.id,
        departmentId: department.id,
        sessionId: session.id,
        appointmentType: "STANDARD",
      },
      {
        userId: fixtures.otherCr.userId,
        role: "CR",
        scope: "DEPARTMENT_SESSION",
        collegeId: college.id,
        departmentId: department.id,
        sessionId: otherSession.id,
        appointmentType: "STANDARD",
      },
    ],
  });

  fixtures.teacher = await signUp({
    role: "TEACHER",
    name: "Report Teacher",
    email: emailOf("teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.teacher.userId);
});

const uploadStudentResource = async (title: string): Promise<string> => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", fixtures.uploader.cookie)
    .field({ title, resourceType: "NOTES", courseId: fixtures.courseId })
    .attach("file", Buffer.from(`%PDF-1.4 ${runId} ${title}`, "utf8"), {
      filename: "reportable.pdf",
      contentType: "application/pdf",
    });
  expect(response.status).toBe(201);
  const id = String(response.body.data.id);
  const opened = await api().post(`/api/v1/moderation/resources/${id}/open`).set("Cookie", fixtures.cr.cookie);
  expect(opened.status).toBe(200);
  const approved = await api().post(`/api/v1/moderation/resources/${id}/approve`).set("Cookie", fixtures.cr.cookie);
  expect(approved.status).toBe(200);
  return id;
};

describeWithDatabase("reports (S5-B1)", () => {
  it("files a report on a visible approved resource and lets its scoped CR resolve it", async () => {
    const resourceId = await uploadStudentResource(`Report target ${runId}`);
    const filed = await api()
      .post("/api/v1/reports")
      .set("Cookie", fixtures.reporter.cookie)
      .send({ resourceId, reason: "The uploaded notes contain private contact details." });

    expect(filed.status).toBe(201);
    expect(filed.body.data).toMatchObject({ resourceId, status: "PENDING", reporter: { id: fixtures.reporter.userId } });

    const queue = await api().get("/api/v1/reports").set("Cookie", fixtures.cr.cookie);
    expect(queue.status).toBe(200);
    expect(queue.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: filed.body.data.id })]));

    const resolved = await api()
      .post(`/api/v1/reports/${filed.body.data.id}/resolve`)
      .set("Cookie", fixtures.cr.cookie);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data).toMatchObject({ status: "RESOLVED", resolvedBy: { id: fixtures.cr.userId } });
  });

  it("allows a scoped moderator to dismiss a pending report", async () => {
    const resourceId = await uploadStudentResource(`Dismiss target ${runId}`);
    const filed = await api()
      .post("/api/v1/reports")
      .set("Cookie", fixtures.reporter.cookie)
      .send({ resourceId, reason: "This copy is an authorized duplicate of the official notes." });
    expect(filed.status).toBe(201);

    const dismissed = await api()
      .post(`/api/v1/reports/${filed.body.data.id}/dismiss`)
      .set("Cookie", fixtures.cr.cookie);
    expect(dismissed.status).toBe(200);
    expect(dismissed.body.data.status).toBe("DISMISSED");
  });

  it("does not allow reports on PRIVATE resources and rejects invalid reasons", async () => {
    const privateResource = await api()
      .post("/api/v1/resources")
      .set("Cookie", fixtures.teacher.cookie)
      .field({ title: `Private report target ${runId}`, resourceType: "NOTES", courseId: fixtures.courseId })
      .attach("file", Buffer.from(`%PDF-1.4 private ${runId}`, "utf8"), {
        filename: "private.pdf",
        contentType: "application/pdf",
      });
    expect(privateResource.status).toBe(201);

    const privateReport = await api()
      .post("/api/v1/reports")
      .set("Cookie", fixtures.reporter.cookie)
      .send({ resourceId: privateResource.body.data.id, reason: "A valid length reason for this report." });
    expect(privateReport.status).toBe(404);
    expect(privateReport.body.code).toBe("RESOURCE_NOT_FOUND");

    const visibleResourceId = await uploadStudentResource(`Bad reason target ${runId}`);
    const badReason = await api()
      .post("/api/v1/reports")
      .set("Cookie", fixtures.reporter.cookie)
      .send({ resourceId: visibleResourceId, reason: "too short" });
    expect(badReason.status).toBe(400);
    expect(badReason.body.code).toBe("VALIDATION_ERROR");
  });

  it("requires authentication to file and a moderation role to open the report queue", async () => {
    const resourceId = await uploadStudentResource(`Authentication target ${runId}`);
    const guest = await api().post("/api/v1/reports").send({ resourceId, reason: "A sufficiently long report reason." });
    expect(guest.status).toBe(401);

    const studentQueue = await api().get("/api/v1/reports").set("Cookie", fixtures.reporter.cookie);
    expect(studentQueue.status).toBe(403);
    expect(studentQueue.body.code).toBe("FORBIDDEN_SCOPE");
  });

  it("hides another batch's report from a CR and rejects repeated decisions", async () => {
    const resourceId = await uploadStudentResource(`Scope target ${runId}`);
    const filed = await api()
      .post("/api/v1/reports")
      .set("Cookie", fixtures.reporter.cookie)
      .send({ resourceId, reason: "A sufficiently long report reason for scope testing." });
    expect(filed.status).toBe(201);

    const otherBatch = await api()
      .post(`/api/v1/reports/${filed.body.data.id}/resolve`)
      .set("Cookie", fixtures.otherCr.cookie);
    expect(otherBatch.status).toBe(404);
    expect(otherBatch.body.code).toBe("REPORT_NOT_FOUND");

    const resolved = await api()
      .post(`/api/v1/reports/${filed.body.data.id}/resolve`)
      .set("Cookie", fixtures.cr.cookie);
    expect(resolved.status).toBe(200);
    const repeated = await api()
      .post(`/api/v1/reports/${filed.body.data.id}/dismiss`)
      .set("Cookie", fixtures.cr.cookie);
    expect(repeated.status).toBe(409);
    expect(repeated.body.code).toBe("REPORT_ALREADY_DECIDED");
  });
});