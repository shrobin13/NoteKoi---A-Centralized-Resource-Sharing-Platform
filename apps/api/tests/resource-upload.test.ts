import { createHash } from "node:crypto";
import cookieParser from "cookie-parser";
import express, { type Application } from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { globalErrorHandler } from "../src/middleware/globalErrorHandler.js";
import { notFound } from "../src/middleware/notFound.js";
import { singleFile } from "../src/middleware/upload.js";

/**
 * S3-B3 — uploading a resource: multipart → SHA-256 de-duplication →
 * `PhysicalFile` → `Resource` + `ResourceVersion` v1 (+ grants for PERMITTED).
 *
 * The file owns its academic fixtures and its users, so it never depends on the
 * order of the other test files. Files land in the LOCAL driver's storage
 * directory (tests never run in production).
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
const emailOf = (kind: string): string => `resource-${kind}-${runId}@test.local`;

const api = () => request(app);

interface Fixtures {
  collegeId: string;
  departmentId: string;
  otherDepartmentId: string;
  sessionId: string;
  courseId: string;
  otherCourseId: string;
}

let fixtures: Fixtures;

let studentCookie = "";
let crCookie = "";
let teacherCookie = "";
let subAdminCookie = "";
let pendingCookie = "";

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

const signUp = async (payload: Record<string, unknown>): Promise<SignedUp> => {
  const email = String(payload.email);
  const registered = await api().post("/api/v1/auth/register").send({ password: PASSWORD, ...payload });

  expect(registered.status).toBe(201);

  const verified = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });

  expect(verified.status).toBe(200);

  const loggedIn = await api().post("/api/v1/auth/login").send({ email, password: PASSWORD });

  expect(loggedIn.status).toBe(200);

  return {
    userId: String(registered.body.data.userId),
    cookie: cookieFrom(loggedIn.headers["set-cookie"]),
  };
};

const signUpStudent = (kind: string, regNo: string): Promise<SignedUp> =>
  signUp({
    role: "STUDENT",
    name: `Resource ${kind}`,
    email: emailOf(kind),
    collegeId: fixtures.collegeId,
    departmentId: fixtures.departmentId,
    sessionId: fixtures.sessionId,
    regNo,
  });

/** Test-only shortcut for "the CR verified this student" (S2-B4 owns the real flow). */
const approveStudent = (userId: string) =>
  prisma.studentProfile.update({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });

const approveTeacher = (userId: string) =>
  prisma.teacherProfile.update({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });

const fields = (overrides: Record<string, string> = {}): Record<string, string> => ({
  title: `Lecture notes ${runId}`,
  description: "Chapter 1 to 3",
  tags: "sorting,arrays",
  resourceType: "NOTES",
  courseId: fixtures.courseId,
  ...overrides,
});

interface UploadFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/** Unique bytes per run, so a re-run never collides with the previous one. */
const pdfFile = (suffix = "default"): UploadFile => ({
  buffer: Buffer.from(`%PDF-1.4 NoteKoi ${runId} ${suffix}`, "utf8"),
  filename: "notes.pdf",
  contentType: "application/pdf",
});

const upload = (cookie: string, overrides: Record<string, string> = {}, file: UploadFile = pdfFile()) =>
  api()
    .post("/api/v1/resources")
    .set("Cookie", cookie)
    .field(fields(overrides))
    .attach("file", file.buffer, { filename: file.filename, contentType: file.contentType });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Resource College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Resource CSE ${runId}` } });
  const otherDepartment = await prisma.department.create({ data: { name: `Resource EEE ${runId}` } });

  await prisma.collegeDepartment.create({
    data: { collegeId: college.id, departmentId: department.id },
  });

  const session = await prisma.session.create({
    data: { departmentId: department.id, name: `Resource Session ${runId}` },
  });

  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Data Structures ${runId}`, semester: 3 },
  });
  const otherCourse = await prisma.course.create({
    data: { departmentId: otherDepartment.id, name: `Circuits ${runId}`, semester: 3 },
  });

  fixtures = {
    collegeId: college.id,
    departmentId: department.id,
    otherDepartmentId: otherDepartment.id,
    sessionId: session.id,
    courseId: course.id,
    otherCourseId: otherCourse.id,
  };

  const student = await signUpStudent("student", `REG-res-${runId}`);
  await approveStudent(student.userId);
  studentCookie = student.cookie;

  const cr = await signUpStudent("cr", `REG-res-cr-${runId}`);
  await approveStudent(cr.userId);
  await prisma.userRole.create({
    data: {
      userId: cr.userId,
      role: "CR",
      scope: "DEPARTMENT_SESSION",
      collegeId: fixtures.collegeId,
      departmentId: fixtures.departmentId,
      sessionId: fixtures.sessionId,
      appointmentType: "STANDARD",
    },
  });
  crCookie = cr.cookie;

  const teacher = await signUp({
    role: "TEACHER",
    name: "Resource Teacher",
    email: emailOf("teacher"),
    collegeId: fixtures.collegeId,
    departmentIds: [fixtures.departmentId],
  });
  await approveTeacher(teacher.userId);
  teacherCookie = teacher.cookie;

  const subAdmin = await signUp({
    role: "TEACHER",
    name: "Resource Sub Admin",
    email: emailOf("sub-admin"),
    collegeId: fixtures.collegeId,
    departmentIds: [fixtures.departmentId],
  });
  await approveTeacher(subAdmin.userId);
  await prisma.userRole.create({
    data: {
      userId: subAdmin.userId,
      role: "SUB_ADMIN",
      scope: "COLLEGE",
      collegeId: fixtures.collegeId,
      appointmentType: "STANDARD",
    },
  });
  subAdminCookie = subAdmin.cookie;

  const pending = await signUpStudent("pending", `REG-res-pending-${runId}`);
  pendingCookie = pending.cookie;
});

/** Just enough app to prove the size cap without a 50 MB body. */
const probeApp = (): Application => {
  const probe = express();
  probe.use(express.json());
  probe.use(cookieParser());
  probe.post("/upload", singleFile("file", 32), (req, res) => {
    res.json({ size: req.file?.size ?? 0 });
  });
  probe.use(notFound);
  probe.use(globalErrorHandler);

  return probe;
};

describeWithDatabase("resources: upload (S3-B3)", () => {
  it("stores the file once and creates the resource with version 1", async () => {
    const file = pdfFile("happy");
    const response = await upload(studentCookie, {}, file);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      uploaderType: "STUDENT",
      audience: "COLLEGE",
      state: "PENDING",
      resourceType: "NOTES",
      tags: ["sorting", "arrays"],
      sessionId: fixtures.sessionId,
      courseId: fixtures.courseId,
      deduplicated: false,
    });
    expect(response.body.data.versions).toHaveLength(1);
    expect(response.body.data.versions[0]).toMatchObject({
      versionNo: 1,
      state: "PENDING",
      mimeType: "application/pdf",
      sizeBytes: file.buffer.length,
    });
    expect(response.body.data.currentVersionId).toBe(response.body.data.versions[0].id);

    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id: response.body.data.id },
      select: {
        sessionId: true,
        collegeId: true,
        departmentId: true,
        versions: {
          select: {
            versionNo: true,
            state: true,
            physicalFile: { select: { contentHash: true, sizeBytes: true } },
          },
        },
      },
    });

    expect(stored.sessionId).toBe(fixtures.sessionId);
    expect(stored.collegeId).toBe(fixtures.collegeId);
    expect(stored.departmentId).toBe(fixtures.departmentId);
    expect(stored.versions).toHaveLength(1);
    expect(stored.versions[0]?.physicalFile?.contentHash).toBe(
      createHash("sha256").update(file.buffer).digest("hex"),
    );
    expect(Number(stored.versions[0]?.physicalFile?.sizeBytes)).toBe(file.buffer.length);
  });

  it("reuses the PhysicalFile when the same bytes are uploaded again", async () => {
    const file = pdfFile("duplicate");
    const first = await upload(teacherCookie, { title: "Dedup one" }, file);
    const second = await upload(teacherCookie, { title: "Dedup two" }, file);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.deduplicated).toBe(false);
    expect(second.body.data.deduplicated).toBe(true);

    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const physicalFiles = await prisma.physicalFile.findMany({
      where: { contentHash: hash },
      select: { id: true },
    });
    const versions = await prisma.resourceVersion.findMany({
      where: { resourceId: { in: [first.body.data.id, second.body.data.id] } },
      select: { physicalFileId: true },
    });

    expect(physicalFiles).toHaveLength(1);
    expect(versions).toHaveLength(2);
    expect(new Set(versions.map((version) => version.physicalFileId)).size).toBe(1);
    expect(versions[0]?.physicalFileId).toBe(physicalFiles[0]?.id);
  });

  it("applies the per-role audience and state defaults", async () => {
    const teacher = await upload(teacherCookie, { title: "Teacher default" }, pdfFile("teacher-default"));
    const cr = await upload(crCookie, { title: "CR default" }, pdfFile("cr-default"));

    expect(teacher.status).toBe(201);
    expect(teacher.body.data).toMatchObject({
      uploaderType: "TEACHER",
      audience: "PRIVATE",
      state: "APPROVED",
      sessionId: null,
    });
    expect(teacher.body.data.versions[0].state).toBe("APPROVED");

    expect(cr.status).toBe(201);
    expect(cr.body.data).toMatchObject({
      uploaderType: "STUDENT",
      audience: "COLLEGE",
      // A CR upload bypasses the moderation queue (A.4).
      state: "APPROVED",
    });

    const subAdmin = await upload(subAdminCookie, { title: "Sub Admin default" }, pdfFile("sub-admin-default"));
    expect(subAdmin.status).toBe(201);
    expect(subAdmin.body.data).toMatchObject({
      uploaderType: "TEACHER",
      audience: "PRIVATE",
      state: "APPROVED",
      sessionId: null,
    });
    expect(subAdmin.body.data.versions[0].state).toBe("APPROVED");
  });

  it("records a grant row for every batch of a PERMITTED upload", async () => {
    const response = await upload(
      teacherCookie,
      { title: "Permitted deck", audience: "PERMITTED", sessionIds: fixtures.sessionId },
      pdfFile("permitted"),
    );

    expect(response.status).toBe(201);
    expect(response.body.data.audience).toBe("PERMITTED");
    expect(response.body.data.grants).toEqual([
      { sessionId: fixtures.sessionId, sessionName: `Resource Session ${runId}` },
    ]);
    expect(await prisma.resourceBatchGrant.count({ where: { resourceId: response.body.data.id } })).toBe(1);
  });
});

describeWithDatabase("resources: upload guards (S3-B3)", () => {
  it("rejects a guest with 401", async () => {
    const file = pdfFile("guest");
    const response = await api()
      .post("/api/v1/resources")
      .field(fields())
      .attach("file", file.buffer, { filename: file.filename, contentType: file.contentType });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("NOT_AUTHENTICATED");
  });

  it("rejects an unverified profile with 403", async () => {
    const response = await upload(pendingCookie, { title: "Pending upload" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PROFILE_NOT_ACTIVE");
  });

  it("stops a student from publishing to the platform", async () => {
    const response = await upload(studentCookie, { title: "Public notes", audience: "PLATFORM" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("AUDIENCE_NOT_ALLOWED");
  });

  it("stops a student from picking a course of another department", async () => {
    const response = await upload(studentCookie, {
      title: "Wrong course",
      courseId: fixtures.otherCourseId,
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_COURSE");
  });

  it("requires a course for teacher uploads", async () => {
    const response = await upload(teacherCookie, { title: "Missing course", courseId: "" }, pdfFile("missing-course"));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.errors).toContainEqual(expect.objectContaining({ path: "courseId" }));
  });

  it("requires at least one batch for a PERMITTED upload", async () => {
    const response = await upload(teacherCookie, {
      title: "Permitted without a batch",
      audience: "PERMITTED",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(response.body.errors).toContainEqual(
      expect.objectContaining({ path: "sessionIds" }),
    );
  });

  it("rejects a file type that is not on the allow-list", async () => {
    const response = await upload(studentCookie, { title: "Archive" }, {
      buffer: Buffer.from("PK", "utf8"),
      filename: "notes.zip",
      contentType: "application/zip",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects an upload without a file", async () => {
    const response = await api()
      .post("/api/v1/resources")
      .set("Cookie", studentCookie)
      .field(fields({ title: "No file attached" }));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("FILE_REQUIRED");
  });

  it("enforces the size cap in the multipart parser", async () => {
    const tooBig = await request(probeApp())
      .post("/upload")
      .attach("file", pdfFile("oversized").buffer, {
        filename: "big.pdf",
        contentType: "application/pdf",
      });
    const small = await request(probeApp())
      .post("/upload")
      .attach("file", Buffer.from("%PDF-1.4 tiny", "utf8"), {
        filename: "tiny.pdf",
        contentType: "application/pdf",
      });

    expect(tooBig.status).toBe(400);
    expect(tooBig.body.code).toBe("FILE_TOO_LARGE");
    expect(small.status).toBe(200);
    expect(small.body.size).toBe(13);
  });
});

