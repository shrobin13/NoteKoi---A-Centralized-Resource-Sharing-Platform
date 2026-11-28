import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { hashPassword } from "../src/lib/hash.js";
import { prisma } from "../src/lib/prisma.js";

const mailBox = vi.hoisted(() => ({ sent: [] as { to: string; code: string }[] }));
vi.mock("../src/lib/mailer.js", () => ({
  sendOtpEmail: async (input: { to: string; code: string }) => mailBox.sent.push(input),
}));

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10_000)}`;
const password = "Pass1234!";
const emailOf = (kind: string): string => `admin-${kind}-${runId}@test.local`;
const api = () => request(app);

interface Fixtures {
  platformAdminCookie: string;
  subAdminCookie: string;
  studentCookie: string;
  resourceId: string;
  collegeId: string;
  departmentId: string;
  courseId: string;
  platformAdminId: string;
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

const signUpLogin = async (payload: Record<string, unknown>): Promise<{ userId: string; cookie: string }> => {
  const email = String(payload.email);
  const registered = await api().post("/api/v1/auth/register").send({ password, ...payload });
  expect(registered.status).toBe(201);
  const verified = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });
  expect(verified.status).toBe(200);
  const loggedIn = await api().post("/api/v1/auth/login").send({ email, password });
  expect(loggedIn.status).toBe(200);
  return { userId: String(registered.body.data.userId), cookie: cookieFrom(loggedIn.headers["set-cookie"]) };
};

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const passwordHash = await hashPassword(password);
  const college = await prisma.college.create({ data: { name: `Admin College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Admin CSE ${runId}` } });
  await prisma.collegeDepartment.create({ data: { collegeId: college.id, departmentId: department.id } });
  const session = await prisma.session.create({ data: { departmentId: department.id, name: `Admin Batch ${runId}` } });
  const course = await prisma.course.create({ data: { departmentId: department.id, name: `Admin Course ${runId}`, semester: 9 } });

  const platformAdmin = await prisma.user.create({
    data: {
      email: emailOf("platform-admin"),
      name: "Admin Platform",
      passwordHash,
      type: "PLATFORM_ADMIN",
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.userRole.create({
    data: { userId: platformAdmin.id, role: "PLATFORM_ADMIN", scope: "PLATFORM", appointmentType: "STANDARD" },
  });
  const platformLogin = await api().post("/api/v1/auth/login").send({ email: emailOf("platform-admin"), password });
  expect(platformLogin.status).toBe(200);

  const subAdmin = await signUpLogin({
    role: "TEACHER",
    name: "Admin Sub Admin",
    email: emailOf("sub-admin"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await prisma.teacherProfile.update({ where: { userId: subAdmin.userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });
  await prisma.userRole.create({
    data: { userId: subAdmin.userId, role: "SUB_ADMIN", scope: "COLLEGE", collegeId: college.id, appointmentType: "STANDARD" },
  });

  const student = await signUpLogin({
    role: "STUDENT",
    name: "Admin Student",
    email: emailOf("student"),
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    regNo: `REG-admin-${runId}`,
  });
  await prisma.studentProfile.update({ where: { userId: student.userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });

  const physical = await prisma.physicalFile.create({
    data: {
      id: crypto.randomUUID(),
      contentHash: `admin-${runId}`,
      sizeBytes: 12n,
      mimeType: "application/pdf",
      storageProvider: "LOCAL",
    },
  });
  const resource = await prisma.resource.create({
    data: {
      uploaderId: student.userId,
      uploaderType: "STUDENT",
      collegeId: college.id,
      departmentId: department.id,
      courseId: course.id,
      sessionId: session.id,
      title: `Admin target ${runId}`,
      description: "Original description",
      resourceType: "NOTES",
      audience: "COLLEGE",
      state: "APPROVED",
    },
    select: { id: true },
  });
  const version = await prisma.resourceVersion.create({
    data: { resourceId: resource.id, versionNo: 1, physicalFileId: physical.id, state: "APPROVED", uploadedById: student.userId },
  });
  await prisma.resource.update({ where: { id: resource.id }, data: { currentVersionId: version.id } });

  fixtures = {
    platformAdminCookie: cookieFrom(platformLogin.headers["set-cookie"]),
    subAdminCookie: subAdmin.cookie,
    studentCookie: student.cookie,
    resourceId: resource.id,
    collegeId: college.id,
    departmentId: department.id,
    courseId: course.id,
    platformAdminId: platformAdmin.id,
  };
});

describeWithDatabase("admin governance (S5-B4)", () => {
  it("updates and soft-deletes a resource with mandatory justification and audit rows", async () => {
    const updated = await api()
      .patch(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .set("Cookie", fixtures.platformAdminCookie)
      .send({
        justification: "Legal review requires correcting this resource's metadata.",
        title: `Platform corrected ${runId}`,
        audience: "PLATFORM",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.action).toBe("RESOURCE_UPDATED");
    expect(updated.body.data.resource).toMatchObject({ title: `Platform corrected ${runId}`, audience: "PLATFORM", state: "APPROVED" });

    const deleted = await api()
      .delete(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .set("Cookie", fixtures.platformAdminCookie)
      .send({ justification: "A legal takedown requires this resource to be removed." });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.action).toBe("RESOURCE_SOFT_DELETED");

    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id: fixtures.resourceId },
      select: { state: true, deletedAt: true, deletedById: true, title: true },
    });
    expect(stored).toMatchObject({ state: "DELETED", deletedById: fixtures.platformAdminId, title: `Platform corrected ${runId}` });
    expect(stored.deletedAt).toBeInstanceOf(Date);

    const audit = await api().get("/api/v1/admin/audit-logs").set("Cookie", fixtures.platformAdminCookie);
    expect(audit.status).toBe(200);
    expect(audit.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "PLATFORM_RESOURCE_OVERRIDE", justification: "Legal review requires correcting this resource's metadata." }),
      expect.objectContaining({ action: "PLATFORM_RESOURCE_SOFT_DELETE", targetId: fixtures.resourceId }),
    ]));
  });

  it("rejects missing justification and bad override fields", async () => {
    const missing = await api()
      .patch(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .set("Cookie", fixtures.platformAdminCookie)
      .send({ title: "No justification" });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("VALIDATION_ERROR");

    const unknownField = await api()
      .patch(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .set("Cookie", fixtures.platformAdminCookie)
      .send({ justification: "A sufficiently long override justification.", unsupportedField: true });
    expect(unknownField.status).toBe(400);
  });

  it("requires authentication", async () => {
    const response = await api()
      .patch(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .send({ justification: "A sufficiently long override justification.", title: "Guest override" });
    expect(response.status).toBe(401);
  });

  it("rejects wrong roles", async () => {
    const student = await api()
      .patch(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .set("Cookie", fixtures.studentCookie)
      .send({ justification: "A sufficiently long override justification.", title: "Student override" });
    expect(student.status).toBe(403);
    expect(student.body.code).toBe("FORBIDDEN_ROLE");
  });

  it("does not grant platform-admin scope to a Sub Admin", async () => {
    const update = await api()
      .patch(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .set("Cookie", fixtures.subAdminCookie)
      .send({ justification: "A sufficiently long override justification.", title: "Sub Admin override" });
    expect(update.status).toBe(403);

    const audit = await api().get("/api/v1/admin/audit-logs").set("Cookie", fixtures.subAdminCookie);
    expect(audit.status).toBe(403);

    const repeatedDelete = await api()
      .delete(`/api/v1/admin/resources/${fixtures.resourceId}`)
      .set("Cookie", fixtures.subAdminCookie)
      .send({ justification: "A sufficiently long override justification." });
    expect(repeatedDelete.status).toBe(403);
  });
});
