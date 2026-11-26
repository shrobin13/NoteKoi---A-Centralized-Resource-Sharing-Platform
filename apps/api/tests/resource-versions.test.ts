import { createHash } from "node:crypto";
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
const emailOf = (kind: string): string => `versions-${kind}-${runId}@test.local`;
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

const signUpStudent = (kind: string, sessionId: string, regNo: string): Promise<SignedUp> =>
  signUp({
    role: "STUDENT",
    name: `Version ${kind}`,
    email: emailOf(kind),
    collegeId: fixtures.collegeId,
    departmentId: fixtures.departmentId,
    sessionId,
    regNo,
  });

const activateStudent = (userId: string) =>
  prisma.studentProfile.update({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });

const activateTeacher = (userId: string) =>
  prisma.teacherProfile.update({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const college = await prisma.college.create({ data: { name: `Versions College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Versions CSE ${runId}` } });
  await prisma.collegeDepartment.create({ data: { collegeId: college.id, departmentId: department.id } });
  const session = await prisma.session.create({ data: { departmentId: department.id, name: `Versions Batch A ${runId}` } });
  const otherSession = await prisma.session.create({ data: { departmentId: department.id, name: `Versions Batch B ${runId}` } });
  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Versions Course ${runId}`, semester: 3 },
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
  };

  fixtures.student = await signUpStudent("student", session.id, `REG-ver-st-${runId}`);
  await activateStudent(fixtures.student.userId);
  fixtures.peer = await signUpStudent("peer", session.id, `REG-ver-peer-${runId}`);
  await activateStudent(fixtures.peer.userId);
  fixtures.cr = await signUpStudent("cr", session.id, `REG-ver-cr-${runId}`);
  await activateStudent(fixtures.cr.userId);
  fixtures.otherCr = await signUpStudent("other-cr", otherSession.id, `REG-ver-other-${runId}`);
  await activateStudent(fixtures.otherCr.userId);

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
    name: "Version Teacher",
    email: emailOf("teacher"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.teacher.userId);
});

const file = (label: string) => ({
  bytes: Buffer.from(`%PDF-1.4 NoteKoi ${runId} ${label}`, "utf8"),
  name: `${label}.pdf`,
});

const createStudentResource = async () => {
  const initial = file(`initial-${Math.random()}`);
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", fixtures.student.cookie)
    .field({
      title: `Versioned notes ${runId}`,
      description: "Initial description",
      tags: "version,notes",
      resourceType: "NOTES",
      courseId: fixtures.courseId,
    })
    .attach("file", initial.bytes, { filename: initial.name, contentType: "application/pdf" });

  expect(response.status).toBe(201);
  return { id: String(response.body.data.id), initial };
};

const approveInitial = async (id: string): Promise<void> => {
  const opened = await api().post(`/api/v1/moderation/resources/${id}/open`).set("Cookie", fixtures.cr.cookie);
  expect(opened.status).toBe(200);
  const approved = await api().post(`/api/v1/moderation/resources/${id}/approve`).set("Cookie", fixtures.cr.cookie);
  expect(approved.status).toBe(200);
};

const uploadVersion = (id: string, cookie: string, label: string) => {
  const next = file(label);
  return {
    next,
    request: api()
      .post(`/api/v1/resources/${id}/versions`)
      .set("Cookie", cookie)
      .attach("file", next.bytes, { filename: next.name, contentType: "application/pdf" }),
  };
};

describeWithDatabase("resources: metadata and versions (S3-B7)", () => {
  it("lets the uploader edit metadata but hides another uploader's resource", async () => {
    const resource = await createStudentResource();
    const updated = await api()
      .patch(`/api/v1/resources/${resource.id}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ title: `Edited title ${runId}`, description: null, tags: ["edited", "review"], resourceType: "SLIDES" });

    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      title: `Edited title ${runId}`,
      description: null,
      tags: ["edited", "review"],
      resourceType: "SLIDES",
      audience: "COLLEGE",
      state: "PENDING",
    });

    const nonOwner = await api()
      .patch(`/api/v1/resources/${resource.id}`)
      .set("Cookie", fixtures.peer.cookie)
      .send({ title: "A different title" });
    expect(nonOwner.status).toBe(404);
    expect(nonOwner.body.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("rejects scope changes and invalid metadata without mutating the resource", async () => {
    const resource = await createStudentResource();
    const response = await api()
      .patch(`/api/v1/resources/${resource.id}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ title: "Attempted scope change", audience: "PLATFORM", state: "APPROVED" });

    expect(response.status).toBe(400);
    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
      select: { title: true, audience: true, state: true },
    });
    expect(stored).toMatchObject({ title: `Versioned notes ${runId}`, audience: "COLLEGE", state: "PENDING" });

    const badTitle = await api()
      .patch(`/api/v1/resources/${resource.id}`)
      .set("Cookie", fixtures.student.cookie)
      .send({ title: "x" });
    expect(badTitle.status).toBe(400);
  });

  it("requires authentication and uploader ownership for version uploads", async () => {
    const resource = await createStudentResource();
    const bytes = file("unauthenticated");
    const guest = await api()
      .post(`/api/v1/resources/${resource.id}/versions`)
      .attach("file", bytes.bytes, { filename: bytes.name, contentType: "application/pdf" });
    expect(guest.status).toBe(401);

    const wrongOwner = uploadVersion(resource.id, fixtures.teacher.cookie, "wrong-owner");
    const wrongRole = await wrongOwner.request;
    expect(wrongRole.status).toBe(404);
    expect(wrongRole.body.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("keeps the approved v1 visible while a student v2 waits in the CR queue", async () => {
    const resource = await createStudentResource();
    await approveInitial(resource.id);
    const currentBefore = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
      select: { currentVersionId: true },
    });

    const upload = uploadVersion(resource.id, fixtures.student.cookie, `student-v2-${Math.random()}`);
    const response = await upload.request;
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ versionNo: 2, state: "PENDING", isCurrent: false, resourceState: "APPROVED" });

    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
      select: { state: true, currentVersionId: true },
    });
    expect(stored).toEqual({ state: "APPROVED", currentVersionId: currentBefore.currentVersionId });

    const queue = await api()
      .get("/api/v1/moderation/queue")
      .set("Cookie", fixtures.cr.cookie);
    expect(queue.status).toBe(200);
    expect(queue.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: resource.id, versionNo: 2, versionState: "PENDING" })]),
    );

    const detail = await api().get(`/api/v1/resources/${resource.id}`).set("Cookie", fixtures.peer.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.versions).toHaveLength(1);
    expect(detail.body.data.versions[0]).toMatchObject({ versionNo: 1, state: "APPROVED" });

    const download = await api().get(`/api/v1/resources/${resource.id}/download`).set("Cookie", fixtures.peer.cookie);
    expect(download.status).toBe(200);
    expect(download.headers["x-resource-version"]).toBe("1");
    expect(download.body).toEqual(resource.initial.bytes);
  });

  it("moves currentVersionId to the approved revision and supersedes v1", async () => {
    const resource = await createStudentResource();
    await approveInitial(resource.id);
    const upload = uploadVersion(resource.id, fixtures.student.cookie, `approved-v2-${Math.random()}`);
    const created = await upload.request;
    expect(created.status).toBe(201);

    const opened = await api().post(`/api/v1/moderation/resources/${resource.id}/open`).set("Cookie", fixtures.cr.cookie);
    expect(opened.status).toBe(200);
    const approved = await api().post(`/api/v1/moderation/resources/${resource.id}/approve`).set("Cookie", fixtures.cr.cookie);
    expect(approved.status).toBe(200);

    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
      select: {
        state: true,
        currentVersionId: true,
        versions: { orderBy: { versionNo: "asc" }, select: { id: true, versionNo: true, state: true } },
      },
    });
    expect(stored.state).toBe("APPROVED");
    expect(stored.currentVersionId).toBe(created.body.data.id);
    expect(stored.versions).toEqual([
      expect.objectContaining({ versionNo: 1, state: "SUPERSEDED" }),
      expect.objectContaining({ id: created.body.data.id, versionNo: 2, state: "APPROVED" }),
    ]);

    const download = await api().get(`/api/v1/resources/${resource.id}/download`).set("Cookie", fixtures.peer.cookie);
    expect(download.status).toBe(200);
    expect(download.headers["x-resource-version"]).toBe("2");
    expect(download.body).toEqual(upload.next.bytes);
  });

  it("rejects v2 with a reason while keeping the approved v1 current and visible", async () => {
    const resource = await createStudentResource();
    await approveInitial(resource.id);
    const before = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
      select: { currentVersionId: true },
    });
    const upload = uploadVersion(resource.id, fixtures.student.cookie, `rejected-v2-${Math.random()}`);
    const created = await upload.request;
    expect(created.status).toBe(201);

    const opened = await api().post(`/api/v1/moderation/resources/${resource.id}/open`).set("Cookie", fixtures.cr.cookie);
    expect(opened.status).toBe(200);
    const rejected = await api()
      .post(`/api/v1/moderation/resources/${resource.id}/reject`)
      .set("Cookie", fixtures.cr.cookie)
      .send({ reason: "The new scan is unreadable, please resubmit." });
    expect(rejected.status).toBe(200);

    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id: resource.id },
      select: {
        state: true,
        currentVersionId: true,
        versions: { orderBy: { versionNo: "asc" }, select: { versionNo: true, state: true, rejectionReason: true } },
      },
    });
    expect(stored.state).toBe("APPROVED");
    expect(stored.currentVersionId).toBe(before.currentVersionId);
    expect(stored.versions).toEqual([
      expect.objectContaining({ versionNo: 1, state: "APPROVED", rejectionReason: null }),
      expect.objectContaining({ versionNo: 2, state: "REJECTED", rejectionReason: "The new scan is unreadable, please resubmit." }),
    ]);
    expect(created.body.data.isCurrent).toBe(false);

    const mine = await api().get("/api/v1/resources/mine").set("Cookie", fixtures.student.cookie);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: resource.id,
          state: "APPROVED",
          latestVersionState: "REJECTED",
          rejectionReason: "The new scan is unreadable, please resubmit.",
        }),
      ]),
    );

    const download = await api().get(`/api/v1/resources/${resource.id}/download`).set("Cookie", fixtures.peer.cookie);
    expect(download.status).toBe(200);
    expect(download.headers["x-resource-version"]).toBe("1");
    expect(download.body).toEqual(resource.initial.bytes);
  });

  it("auto-approves teacher versions and deduplicates identical bytes", async () => {
    const initial = file(`teacher-original-${Math.random()}`);
    const resource = await api()
      .post("/api/v1/resources")
      .set("Cookie", fixtures.teacher.cookie)
      .field({ title: `Teacher file ${runId}`, resourceType: "NOTES", courseId: fixtures.courseId })
      .attach("file", initial.bytes, { filename: initial.name, contentType: "application/pdf" });
    expect(resource.status).toBe(201);

    const revision = await api()
      .post(`/api/v1/resources/${resource.body.data.id}/versions`)
      .set("Cookie", fixtures.teacher.cookie)
      .attach("file", initial.bytes, { filename: initial.name, contentType: "application/pdf" });
    expect(revision.status).toBe(201);
    expect(revision.body.data).toMatchObject({ versionNo: 2, state: "APPROVED", isCurrent: true, deduplicated: true });

    const digest = createHash("sha256").update(initial.bytes).digest("hex");
    expect(await prisma.physicalFile.count({ where: { contentHash: digest } })).toBe(1);
    const versions = await prisma.resourceVersion.findMany({
      where: { resourceId: resource.body.data.id },
      orderBy: { versionNo: "asc" },
      select: { versionNo: true, state: true },
    });
    expect(versions).toEqual([{ versionNo: 1, state: "SUPERSEDED" }, { versionNo: 2, state: "APPROVED" }]);
  });

  it("returns version history only to the uploader or an in-scope moderator", async () => {
    const resource = await createStudentResource();
    const owner = await api().get(`/api/v1/resources/${resource.id}/versions`).set("Cookie", fixtures.student.cookie);
    expect(owner.status).toBe(200);
    expect(owner.body.data).toHaveLength(1);

    const stranger = await api().get(`/api/v1/resources/${resource.id}/versions`).set("Cookie", fixtures.peer.cookie);
    expect(stranger.status).toBe(404);

    const otherBatch = await api()
      .get(`/api/v1/resources/${resource.id}/versions`)
      .set("Cookie", fixtures.otherCr.cookie);
    expect(otherBatch.status).toBe(404);

    const guest = await api().get(`/api/v1/resources/${resource.id}/versions`);
    expect(guest.status).toBe(404);
  });

  it("rejects unsupported version file types", async () => {
    const resource = await createStudentResource();
    const response = await api()
      .post(`/api/v1/resources/${resource.id}/versions`)
      .set("Cookie", fixtures.student.cookie)
      .attach("file", Buffer.from("PK", "utf8"), { filename: "archive.zip", contentType: "application/zip" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("UNSUPPORTED_FILE_TYPE");
  });
});