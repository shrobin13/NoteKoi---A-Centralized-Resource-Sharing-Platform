import { hashPassword } from "../src/lib/hash.js";
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
const emailOf = (kind: string): string => `governance-${kind}-${runId}@test.local`;
const api = () => request(app);

interface SignedUp {
  userId: string;
  cookie: string;
}

interface Fixtures {
  collegeA: string;
  collegeB: string;
  departmentId: string;
  sessionA: string;
  sessionB: string;
  courseId: string;
  student: SignedUp;
  peer: SignedUp;
  cr: SignedUp;
  otherCr: SignedUp;
  teacher: SignedUp;
  subAdmin: SignedUp;
  subAdminB: SignedUp;
  teacherB: SignedUp;
  platformAdmin: SignedUp;
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

const addRole = (input: {
  userId: string;
  role: "CR" | "SUB_ADMIN" | "PLATFORM_ADMIN";
  scope: "DEPARTMENT_SESSION" | "COLLEGE" | "PLATFORM";
  collegeId?: string;
  departmentId?: string;
  sessionId?: string;
}) =>
  prisma.userRole.create({
    data: {
      ...input,
      collegeId: input.collegeId ?? null,
      departmentId: input.departmentId ?? null,
      sessionId: input.sessionId ?? null,
      appointmentType: "STANDARD",
    },
  });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const collegeA = await prisma.college.create({ data: { name: `Governance College A ${runId}` } });
  const collegeB = await prisma.college.create({ data: { name: `Governance College B ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Governance CSE ${runId}` } });
  await prisma.collegeDepartment.createMany({
    data: [
      { collegeId: collegeA.id, departmentId: department.id },
      { collegeId: collegeB.id, departmentId: department.id },
    ],
  });
  const sessionA = await prisma.session.create({ data: { departmentId: department.id, name: `Governance Batch A ${runId}` } });
  const sessionB = await prisma.session.create({ data: { departmentId: department.id, name: `Governance Batch B ${runId}` } });
  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Governance Course ${runId}`, semester: 8 },
  });

  fixtures = {
    collegeA: collegeA.id,
    collegeB: collegeB.id,
    departmentId: department.id,
    sessionA: sessionA.id,
    sessionB: sessionB.id,
    courseId: course.id,
    student: { userId: "", cookie: "" },
    peer: { userId: "", cookie: "" },
    cr: { userId: "", cookie: "" },
    otherCr: { userId: "", cookie: "" },
    teacher: { userId: "", cookie: "" },
    subAdmin: { userId: "", cookie: "" },
    subAdminB: { userId: "", cookie: "" },
    teacherB: { userId: "", cookie: "" },
    platformAdmin: { userId: "", cookie: "" },
  };

  const student = async (kind: string, sessionId: string): Promise<SignedUp> => {
    const user = await signUp({
      role: "STUDENT",
      name: `Governance ${kind}`,
      email: emailOf(kind),
      collegeId: collegeA.id,
      departmentId: department.id,
      sessionId,
      regNo: `REG-gov-${kind}-${runId}`,
    });
    await activateStudent(user.userId);
    return user;
  };

  fixtures.student = await student("student", sessionA.id);
  fixtures.peer = await student("peer", sessionA.id);
  fixtures.cr = await student("cr", sessionA.id);
  fixtures.otherCr = await student("other-cr", sessionB.id);
  await addRole({ userId: fixtures.cr.userId, role: "CR", scope: "DEPARTMENT_SESSION", collegeId: collegeA.id, departmentId: department.id, sessionId: sessionA.id });
  await addRole({ userId: fixtures.otherCr.userId, role: "CR", scope: "DEPARTMENT_SESSION", collegeId: collegeA.id, departmentId: department.id, sessionId: sessionB.id });

  fixtures.teacher = await signUp({ role: "TEACHER", name: "Governance Teacher", email: emailOf("teacher"), collegeId: collegeA.id, departmentIds: [department.id] });
  await activateTeacher(fixtures.teacher.userId);
  fixtures.subAdmin = await signUp({ role: "TEACHER", name: "Governance Sub Admin", email: emailOf("sub-admin"), collegeId: collegeA.id, departmentIds: [department.id] });
  await activateTeacher(fixtures.subAdmin.userId);
  await addRole({ userId: fixtures.subAdmin.userId, role: "SUB_ADMIN", scope: "COLLEGE", collegeId: collegeA.id });
  fixtures.subAdminB = await signUp({ role: "TEACHER", name: "Governance Sub Admin B", email: emailOf("sub-admin-b"), collegeId: collegeB.id, departmentIds: [department.id] });
  await activateTeacher(fixtures.subAdminB.userId);
  await addRole({ userId: fixtures.subAdminB.userId, role: "SUB_ADMIN", scope: "COLLEGE", collegeId: collegeB.id });
  fixtures.teacherB = await signUp({ role: "TEACHER", name: "Governance Teacher B", email: emailOf("teacher-b"), collegeId: collegeB.id, departmentIds: [department.id] });
  await activateTeacher(fixtures.teacherB.userId);

  const adminEmail = emailOf("platform-admin");
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "Governance Platform Admin",
      passwordHash: await hashPassword(password),
      type: "PLATFORM_ADMIN",
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  await addRole({ userId: admin.id, role: "PLATFORM_ADMIN", scope: "PLATFORM" });
  const adminLogin = await api().post("/api/v1/auth/login").send({ email: adminEmail, password });
  expect(adminLogin.status).toBe(200);
  fixtures.platformAdmin = { userId: admin.id, cookie: cookieFrom(adminLogin.headers["set-cookie"]) };
});

const uploadStudentResource = async (cookie: string, title: string) => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", cookie)
    .field({ title, resourceType: "NOTES", courseId: fixtures.courseId })
    .attach("file", Buffer.from(`%PDF-1.4 ${runId} ${title}`, "utf8"), { filename: "student.pdf", contentType: "application/pdf" });
  expect(response.status).toBe(201);
  return String(response.body.data.id);
};

const uploadTeacherResource = async (cookie: string, title: string, audience = "PRIVATE") => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", cookie)
    .field({ title, resourceType: "NOTES", courseId: fixtures.courseId, audience, ...(audience === "PERMITTED" ? { sessionIds: fixtures.sessionA } : {}) })
    .attach("file", Buffer.from(`%PDF-1.4 ${runId} ${title}`, "utf8"), { filename: "teacher.pdf", contentType: "application/pdf" });
  expect(response.status).toBe(201);
  return String(response.body.data.id);
};

const approveStudentResource = async (id: string) => {
  expect((await api().post(`/api/v1/moderation/resources/${id}/open`).set("Cookie", fixtures.cr.cookie)).status).toBe(200);
  expect((await api().post(`/api/v1/moderation/resources/${id}/approve`).set("Cookie", fixtures.cr.cookie)).status).toBe(200);
};

const approveCrOwnedResource = async (id: string) => {
  await prisma.resource.update({ where: { id }, data: { state: "APPROVED" } });
  await prisma.resourceVersion.updateMany({ where: { resourceId: id }, data: { state: "APPROVED" } });
};

describeWithDatabase("governance workflows (S5-B3)", () => {
  it("escalates a CR-scoped report to the Sub Admin for resolution", async () => {
    const resourceId = await uploadStudentResource(fixtures.student.cookie, `Escalated report ${runId}`);
    await approveStudentResource(resourceId);
    const report = await api()
      .post("/api/v1/reports")
      .set("Cookie", fixtures.peer.cookie)
      .send({ resourceId, reason: "The upload contains outdated personal information." });
    expect(report.status).toBe(201);

    const escalation = await api()
      .post("/api/v1/moderation/escalations")
      .set("Cookie", fixtures.cr.cookie)
      .send({ reportId: report.body.data.id, reason: "The report involves a cross-batch privacy concern." });
    expect(escalation.status).toBe(201);
    expect(escalation.body.data).toMatchObject({
      reportId: report.body.data.id,
      assignedTo: { id: fixtures.subAdmin.userId },
      status: "OPEN",
    });

    const queue = await api().get("/api/v1/moderation/escalations").set("Cookie", fixtures.subAdmin.cookie);
    expect(queue.status).toBe(200);
    expect(queue.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: escalation.body.data.id })]));

    const resolved = await api()
      .post(`/api/v1/moderation/escalations/${escalation.body.data.id}/decide`)
      .set("Cookie", fixtures.subAdmin.cookie)
      .send({ decision: "RESOLVED" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe("RESOLVED");
    expect(await prisma.report.findUniqueOrThrow({ where: { id: report.body.data.id }, select: { status: true } })).toMatchObject({ status: "RESOLVED" });
  });

  it("escalates a deletion request and lets the assigned Sub Admin approve it", async () => {
    const resourceId = await uploadStudentResource(fixtures.student.cookie, `Escalated deletion ${runId}`);
    await approveStudentResource(resourceId);
    const requestDeletion = await api()
      .post(`/api/v1/deletions/resources/${resourceId}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ reason: "I uploaded the wrong revision for this course." });
    expect(requestDeletion.status).toBe(201);

    const escalation = await api()
      .post("/api/v1/moderation/escalations")
      .set("Cookie", fixtures.cr.cookie)
      .send({ deletionRequestId: requestDeletion.body.data.requestId, reason: "The request needs college-level review." });
    expect(escalation.status).toBe(201);
    expect(escalation.body.data).toMatchObject({ deletionRequestId: requestDeletion.body.data.requestId, status: "OPEN" });

    const decided = await api()
      .post(`/api/v1/moderation/escalations/${escalation.body.data.id}/decide`)
      .set("Cookie", fixtures.subAdmin.cookie)
      .send({ decision: "APPROVED" });
    expect(decided.status).toBe(200);
    expect(decided.body.data.status).toBe("RESOLVED");
    expect(await prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, select: { state: true } })).toMatchObject({ state: "DELETED" });
  });

  it("allows a CR to promote a scoped student COLLEGE file, but not their own upload", async () => {
    const studentResource = await uploadStudentResource(fixtures.student.cookie, `CR promotion ${runId}`);
    await approveStudentResource(studentResource);
    const otherBatch = await api()
      .post(`/api/v1/resources/${studentResource}/promote`)
      .set("Cookie", fixtures.otherCr.cookie);
    expect(otherBatch.status).toBe(403);

    const promoted = await api()
      .post(`/api/v1/resources/${studentResource}/promote`)
      .set("Cookie", fixtures.cr.cookie);
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.audience).toBe("PLATFORM");
    expect(await prisma.resource.findUniqueOrThrow({
      where: { id: studentResource },
      select: { promotedById: true, promotedAt: true },
    })).toMatchObject({ promotedById: fixtures.cr.userId });
    expect((await prisma.resource.findUniqueOrThrow({ where: { id: studentResource }, select: { promotedAt: true } })).promotedAt).toBeInstanceOf(Date);
    const restored = await api()
      .post(`/api/v1/resources/${studentResource}/revoke-platform`)
      .set("Cookie", fixtures.subAdmin.cookie);
    expect(restored.status).toBe(200);
    expect(restored.body.data.audience).toBe("COLLEGE");

    const ownResource = await uploadStudentResource(fixtures.cr.cookie, `CR own promotion ${runId}`);
    const ownPromote = await api()
      .post(`/api/v1/resources/${ownResource}/promote`)
      .set("Cookie", fixtures.cr.cookie);
    expect(ownPromote.status).toBe(403);
  });

  it("requires authentication and refuses student callers", async () => {
    const resourceId = crypto.randomUUID();
    const guest = await api().post(`/api/v1/resources/${resourceId}/promote`);
    expect(guest.status).toBe(401);

    const student = await api()
      .post(`/api/v1/resources/${resourceId}/promote`)
      .set("Cookie", fixtures.student.cookie);
    expect(student.status).toBe(403);
  });

  it("refuses CR promotion of a teacher file", async () => {
    const teacherResource = await uploadTeacherResource(fixtures.teacher.cookie, `CR teacher promotion ${runId}`, "PERMITTED");
    const refused = await api()
      .post(`/api/v1/resources/${teacherResource}/promote`)
      .set("Cookie", fixtures.cr.cookie);
    expect(refused.status).toBe(403);
  });

  it("returns 409 when a CR tries to promote an already-PLATFORM file", async () => {
    const resourceId = await uploadStudentResource(fixtures.student.cookie, `Already platform ${runId}`);
    await approveStudentResource(resourceId);
    const platformPromotion = await api()
      .post(`/api/v1/resources/${resourceId}/promote`)
      .set("Cookie", fixtures.subAdmin.cookie);
    expect(platformPromotion.status).toBe(200);

    const repeatedPromotion = await api()
      .post(`/api/v1/resources/${resourceId}/promote`)
      .set("Cookie", fixtures.cr.cookie);
    expect(repeatedPromotion.status).toBe(409);

    const restored = await api()
      .post(`/api/v1/resources/${resourceId}/revoke-platform`)
      .set("Cookie", fixtures.subAdmin.cookie);
    expect(restored.status).toBe(200);
  });

  it("lets a CR change an approved file in both directions and audits each change", async () => {
    const resourceId = await uploadStudentResource(fixtures.student.cookie, `Visibility round trip ${runId}`);
    await approveStudentResource(resourceId);

    const platform = await api()
      .patch(`/api/v1/resources/${resourceId}/visibility`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ audience: "PLATFORM" });
    expect(platform.status).toBe(200);
    expect(platform.body.data.audience).toBe("PLATFORM");
    expect(await prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, select: { promotedById: true, promotedAt: true } }))
      .toMatchObject({ promotedById: fixtures.cr.userId, promotedAt: expect.any(Date) });

    const college = await api()
      .patch(`/api/v1/resources/${resourceId}/visibility`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ audience: "COLLEGE" });
    expect(college.status).toBe(200);
    expect(college.body.data.audience).toBe("COLLEGE");
    expect(await prisma.resource.findUniqueOrThrow({ where: { id: resourceId }, select: { promotedById: true, promotedAt: true } }))
      .toEqual({ promotedById: null, promotedAt: null });

    const auditRows = await prisma.auditLog.findMany({
      where: { action: "RESOURCE_VISIBILITY_CHANGED", targetType: "RESOURCE", targetId: resourceId },
      orderBy: { createdAt: "asc" },
      select: { actorId: true, metadata: true },
    });
    expect(auditRows).toHaveLength(2);
    expect(auditRows.map((row) => ({ actorId: row.actorId, ...(row.metadata as Record<string, unknown>) }))).toEqual([
      { actorId: fixtures.cr.userId, previousAudience: "COLLEGE", nextAudience: "PLATFORM" },
      { actorId: fixtures.cr.userId, previousAudience: "PLATFORM", nextAudience: "COLLEGE" },
    ]);
  });

  it("lets a CR change their own approved file visibility", async () => {
    const resourceId = await uploadStudentResource(fixtures.cr.cookie, `CR own visibility ${runId}`);
    await approveCrOwnedResource(resourceId);
    const changed = await api()
      .patch(`/api/v1/resources/${resourceId}/visibility`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ audience: "PLATFORM" });
    expect(changed.status).toBe(200);
    expect(changed.body.data.audience).toBe("PLATFORM");
    const restored = await api()
      .patch(`/api/v1/resources/${resourceId}/visibility`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ audience: "COLLEGE" });
    expect(restored.status).toBe(200);
  });

  it("rejects visibility changes without authentication, from students or other batches", async () => {
    const resourceId = await uploadStudentResource(fixtures.student.cookie, `Visibility scope ${runId}`);
    await approveStudentResource(resourceId);

    const guest = await api().patch(`/api/v1/resources/${resourceId}/visibility`).send({ audience: "PLATFORM" });
    expect(guest.status).toBe(401);
    const student = await api()
      .patch(`/api/v1/resources/${resourceId}/visibility`)
      .set("Cookie", fixtures.peer.cookie)
      .send({ audience: "PLATFORM" });
    expect(student.status).toBe(403);
    const otherBatch = await api()
      .patch(`/api/v1/resources/${resourceId}/visibility`)
      .set("Cookie", fixtures.otherCr.cookie)
      .send({ audience: "PLATFORM" });
    expect(otherBatch.status).toBe(403);
  });

  it("refuses teacher, pending and unchanged visibility values", async () => {
    const teacherResource = await uploadTeacherResource(fixtures.teacher.cookie, `Teacher visibility ${runId}`, "PLATFORM");
    const teacherResult = await api()
      .patch(`/api/v1/resources/${teacherResource}/visibility`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ audience: "COLLEGE" });
    expect(teacherResult.status).toBe(403);

    const pendingResource = await uploadStudentResource(fixtures.student.cookie, `Pending visibility ${runId}`);
    const pendingResult = await api()
      .patch(`/api/v1/resources/${pendingResource}/visibility`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ audience: "PLATFORM" });
    expect(pendingResult.status).toBe(409);

    const approvedResource = await uploadStudentResource(fixtures.student.cookie, `Same visibility ${runId}`);
    await approveStudentResource(approvedResource);
    const sameValue = await api()
      .patch(`/api/v1/resources/${approvedResource}/visibility`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ audience: "COLLEGE" });
    expect(sameValue.status).toBe(409);
  });

  it("lets a Sub Admin promote and revoke a college teacher file, dropping old grants", async () => {
    const teacherResource = await uploadTeacherResource(fixtures.teacher.cookie, `Sub Admin promotion ${runId}`, "PERMITTED");
    const promoted = await api()
      .post(`/api/v1/resources/${teacherResource}/promote`)
      .set("Cookie", fixtures.subAdmin.cookie);
    expect(promoted.status).toBe(200);
    expect(promoted.body.data).toMatchObject({ audience: "PLATFORM", grants: [] });
    expect(await prisma.resourceBatchGrant.count({ where: { resourceId: teacherResource } })).toBe(0);

    const revoked = await api()
      .post(`/api/v1/resources/${teacherResource}/revoke-platform`)
      .set("Cookie", fixtures.subAdmin.cookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.audience).toBe("PRIVATE");

    const wrongCollege = await api()
      .post(`/api/v1/resources/${teacherResource}/revoke-platform`)
      .set("Cookie", fixtures.subAdminB.cookie);
    expect(wrongCollege.status).toBe(404);
  });

  it("allows a Platform Admin to promote and revoke cross-college resources", async () => {
    const teacherResource = await uploadTeacherResource(fixtures.teacherB.cookie, `Platform override ${runId}`);
    const promoted = await api()
      .post(`/api/v1/resources/${teacherResource}/promote`)
      .set("Cookie", fixtures.platformAdmin.cookie);
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.audience).toBe("PLATFORM");

    const revoked = await api()
      .post(`/api/v1/resources/${teacherResource}/revoke-platform`)
      .set("Cookie", fixtures.platformAdmin.cookie);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.audience).toBe("PRIVATE");
  });

  it("rejects missing escalation sources, unauthenticated callers, and wrong decision roles", async () => {
    const badBody = await api()
      .post("/api/v1/moderation/escalations")
      .set("Cookie", fixtures.cr.cookie)
      .send({ reason: "A reason without a source reference." });
    expect(badBody.status).toBe(400);

    const guest = await api().post("/api/v1/moderation/escalations").send({ reportId: crypto.randomUUID(), reason: "A valid length escalation reason." });
    expect(guest.status).toBe(401);

    const student = await api()
      .post("/api/v1/moderation/escalations")
      .set("Cookie", fixtures.student.cookie)
      .send({ reportId: crypto.randomUUID(), reason: "A valid length escalation reason." });
    expect(student.status).toBe(403);
  });
});