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
const emailOf = (kind: string): string => `deletion-${kind}-${runId}@test.local`;
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
  student: SignedUp;
  peer: SignedUp;
  cr: SignedUp;
  otherCr: SignedUp;
  teacher: SignedUp;
  otherTeacher: SignedUp;
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

  const college = await prisma.college.create({ data: { name: `Deletion College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Deletion CSE ${runId}` } });
  await prisma.collegeDepartment.create({ data: { collegeId: college.id, departmentId: department.id } });
  const session = await prisma.session.create({ data: { departmentId: department.id, name: `Deletion Batch A ${runId}` } });
  const otherSession = await prisma.session.create({ data: { departmentId: department.id, name: `Deletion Batch B ${runId}` } });
  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Deletion Course ${runId}`, semester: 7 },
  });

  fixtures = {
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    otherSessionId: otherSession.id,
    courseId: course.id,
    student: { userId: "", cookie: "" },
    peer: { userId: "", cookie: "" },
    cr: { userId: "", cookie: "" },
    otherCr: { userId: "", cookie: "" },
    teacher: { userId: "", cookie: "" },
    otherTeacher: { userId: "", cookie: "" },
  };

  const seedStudent = async (kind: string, sessionId: string): Promise<SignedUp> => {
    const user = await signUp({
      role: "STUDENT",
      name: `Deletion ${kind}`,
      email: emailOf(kind),
      collegeId: college.id,
      departmentId: department.id,
      sessionId,
      regNo: `REG-del-${kind}-${runId}`,
    });
    await activateStudent(user.userId);
    return user;
  };

  fixtures.student = await seedStudent("student", session.id);
  fixtures.peer = await seedStudent("peer", session.id);
  fixtures.cr = await seedStudent("cr", session.id);
  fixtures.otherCr = await seedStudent("other-cr", otherSession.id);
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
    name: "Deletion Teacher",
    email: emailOf("teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.teacher.userId);
  fixtures.otherTeacher = await signUp({
    role: "TEACHER",
    name: "Other Deletion Teacher",
    email: emailOf("other-teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.otherTeacher.userId);
});

const uploadStudentResource = async (title: string): Promise<string> => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", fixtures.student.cookie)
    .field({ title, resourceType: "NOTES", courseId: fixtures.courseId })
    .attach("file", Buffer.from(`%PDF-1.4 ${runId} ${title}`, "utf8"), {
      filename: "student-notes.pdf",
      contentType: "application/pdf",
    });
  expect(response.status).toBe(201);
  return String(response.body.data.id);
};

const uploadTeacherPrivate = async (title: string): Promise<string> => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", fixtures.teacher.cookie)
    .field({ title, resourceType: "NOTES", courseId: fixtures.courseId })
    .attach("file", Buffer.from(`%PDF-1.4 ${runId} ${title}`, "utf8"), {
      filename: "teacher-notes.pdf",
      contentType: "application/pdf",
    });
  expect(response.status).toBe(201);
  return String(response.body.data.id);
};

const approveStudentResource = async (id: string): Promise<void> => {
  const opened = await api().post(`/api/v1/moderation/resources/${id}/open`).set("Cookie", fixtures.cr.cookie);
  expect(opened.status).toBe(200);
  const approved = await api().post(`/api/v1/moderation/resources/${id}/approve`).set("Cookie", fixtures.cr.cookie);
  expect(approved.status).toBe(200);
};

describeWithDatabase("deletions (S5-B2)", () => {
  it("lets a student cancel a PENDING upload and flag an IN_REVIEW upload", async () => {
    const pendingId = await uploadStudentResource(`Cancel pending ${runId}`);
    const canceled = await api()
      .post(`/api/v1/deletions/resources/${pendingId}`)
      .set("Cookie", fixtures.student.cookie)
      .send({});
    expect(canceled.status).toBe(200);
    expect(canceled.body.data).toMatchObject({ resourceId: pendingId, action: "CANCELED", state: "DELETED" });

    const inReviewId = await uploadStudentResource(`Flag in review ${runId}`);
    const opened = await api().post(`/api/v1/moderation/resources/${inReviewId}/open`).set("Cookie", fixtures.cr.cookie);
    expect(opened.status).toBe(200);
    const flagged = await api()
      .post(`/api/v1/deletions/resources/${inReviewId}`)
      .set("Cookie", fixtures.student.cookie)
      .send({});
    expect(flagged.status).toBe(200);
    expect(flagged.body.data).toMatchObject({ resourceId: inReviewId, action: "FLAGGED", state: "IN_REVIEW" });
    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id: inReviewId },
      select: { state: true, deletionFlaggedById: true, deletionFlaggedAt: true },
    });
    expect(stored).toMatchObject({ state: "IN_REVIEW", deletionFlaggedById: fixtures.student.userId });
    expect(stored.deletionFlaggedAt).toBeInstanceOf(Date);
  });

  it("creates a DeletionRequest for an APPROVED student resource and notifies on approval", async () => {
    const resourceId = await uploadStudentResource(`Request deletion ${runId}`);
    await approveStudentResource(resourceId);
    const filed = await api()
      .post(`/api/v1/deletions/resources/${resourceId}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ reason: "I uploaded the wrong revision and need it removed." });
    expect(filed.status).toBe(201);
    expect(filed.body.data).toMatchObject({ action: "REQUESTED", state: "APPROVED" });

    const queue = await api().get("/api/v1/deletions/requests").set("Cookie", fixtures.cr.cookie);
    expect(queue.status).toBe(200);
    expect(queue.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: filed.body.data.requestId })]));

    const approved = await api()
      .post(`/api/v1/deletions/requests/${filed.body.data.requestId}/approve`)
      .set("Cookie", fixtures.cr.cookie);
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe("APPROVED");
    expect(await prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, select: { state: true } })).toMatchObject({ state: "DELETED" });

    const notifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.student.cookie);
    expect(notifications.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "DELETION_APPROVED",
          payload: expect.objectContaining({ resourceId, resourceTitle: `Request deletion ${runId}` }),
        }),
      ]),
    );
  });

  it("notifies the uploader when a CR denies an approved-resource deletion request", async () => {
    const resourceId = await uploadStudentResource(`Deny deletion ${runId}`);
    await approveStudentResource(resourceId);
    const filed = await api()
      .post(`/api/v1/deletions/resources/${resourceId}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ reason: "Please remove this because the course changed." });
    expect(filed.status).toBe(201);

    const denied = await api()
      .post(`/api/v1/deletions/requests/${filed.body.data.requestId}/deny`)
      .set("Cookie", fixtures.cr.cookie);
    expect(denied.status).toBe(200);
    expect(denied.body.data.status).toBe("DENIED");
    expect(await prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, select: { state: true } })).toMatchObject({ state: "APPROVED" });

    const notifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.student.cookie);
    expect(notifications.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "DELETION_DENIED", payload: expect.objectContaining({ resourceId }) }),
      ]),
    );
  });

  it("lets a CR directly delete their own upload and fans RESOURCE_DELETED out to the batch", async () => {
    const response = await api()
      .post("/api/v1/resources")
      .set("Cookie", fixtures.cr.cookie)
      .field({ title: `CR self delete ${runId}`, resourceType: "NOTES", courseId: fixtures.courseId })
      .attach("file", Buffer.from(`%PDF-1.4 CR ${runId}`, "utf8"), { filename: "cr.pdf", contentType: "application/pdf" });
    expect(response.status).toBe(201);

    const deleted = await api()
      .post(`/api/v1/deletions/resources/${response.body.data.id}`)
      .set("Cookie", fixtures.cr.cookie)
      .send({});
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.action).toBe("DELETED");

    const peerNotifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.peer.cookie);
    expect(peerNotifications.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "RESOURCE_DELETED", payload: expect.objectContaining({ resourceId: response.body.data.id }) }),
      ]),
    );
    const crNotifications = await api().get("/api/v1/notifications").set("Cookie", fixtures.cr.cookie);
    expect(crNotifications.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "RESOURCE_DELETED", payload: expect.objectContaining({ resourceId: response.body.data.id }) })]),
    );
  });

  it("lets a teacher delete silently with an audit row", async () => {
    const resourceId = await uploadTeacherPrivate(`Teacher delete ${runId}`);
    const deleted = await api()
      .post(`/api/v1/deletions/resources/${resourceId}`)
      .set("Cookie", fixtures.teacher.cookie)
      .send({});
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.action).toBe("DELETED");
    expect(await prisma.auditLog.count({ where: { action: "TEACHER_RESOURCE_DELETED", targetId: resourceId } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: fixtures.teacher.userId } })).toBe(0);
  });

  it("requires authentication, rejects invalid reasons, and hides out-of-scope requests", async () => {
    const resourceId = await uploadStudentResource(`Deletion guards ${runId}`);
    await approveStudentResource(resourceId);
    const guest = await api().post(`/api/v1/deletions/resources/${resourceId}`).send({});
    expect(guest.status).toBe(401);

    const badReason = await api()
      .post(`/api/v1/deletions/resources/${resourceId}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ reason: "short" });
    expect(badReason.status).toBe(400);

    const filed = await api()
      .post(`/api/v1/deletions/resources/${resourceId}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ reason: "A valid deletion reason for scope testing." });
    expect(filed.status).toBe(201);

    const otherBatch = await api()
      .post(`/api/v1/deletions/requests/${filed.body.data.requestId}/approve`)
      .set("Cookie", fixtures.otherCr.cookie);
    expect(otherBatch.status).toBe(404);
    expect(otherBatch.body.code).toBe("DELETION_REQUEST_NOT_FOUND");

    const studentQueue = await api().get("/api/v1/deletions/requests").set("Cookie", fixtures.student.cookie);
    expect(studentQueue.status).toBe(403);
  });
});