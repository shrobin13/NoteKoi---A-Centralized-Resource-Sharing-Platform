import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * S3-B6 — moderation: the CR queue, open (PENDING → IN_REVIEW), approve and
 * reject, plus the audit row and the uploader notification each decision writes.
 *
 * Two batches in one college and a second college give the scope checks
 * something to refuse; every `it()` uploads its own fixture so the file is
 * order-independent.
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
const emailOf = (kind: string): string => `mod-${kind}-${runId}@test.local`;

const api = () => request(app);

const cookieFrom = (setCookie: unknown): string => {
  const cookies = (setCookie ?? []) as string[];
  const cookie = cookies.find((value) => value.startsWith("accessToken="));

  if (!cookie) throw new Error("The login response did not set the accessToken cookie");

  return cookie.split(";")[0] as string;
};

const signUp = async (payload: Record<string, unknown>): Promise<{ userId: string; cookie: string }> => {
  const email = String(payload.email);
  const registered = await api().post("/api/v1/auth/register").send({ password: PASSWORD, ...payload });

  expect(registered.status).toBe(201);

  const verified = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });

  expect(verified.status).toBe(200);

  const loggedIn = await api().post("/api/v1/auth/login").send({ email, password: PASSWORD });

  expect(loggedIn.status).toBe(200);

  return { userId: String(registered.body.data.userId), cookie: cookieFrom(loggedIn.headers["set-cookie"]) };
};

const activate = async (userId: string): Promise<void> => {
  await prisma.studentProfile.updateMany({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });
  await prisma.teacherProfile.updateMany({
    where: { userId },
    data: { verificationStatus: "ACTIVE", verifiedAt: new Date() },
  });
};

interface Academic {
  collegeId: string;
  departmentId: string;
  sessionId: string;
  otherSessionId: string;
  courseId: string;
}

let a: Academic;
let b: Academic;

const users = {
  studentA: { id: "", cookie: "" },
  studentB: { id: "", cookie: "" },
  studentOtherCollege: { id: "", cookie: "" },
  cr: { id: "", cookie: "" },
  subAdmin: { id: "", cookie: "" },
};

/** A COLLEGE-audience student upload in the CR's batch — lands in PENDING by design. */
const pendingUpload = async (cookie: string, suffix: string): Promise<string> => {
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", cookie)
    .field({
      title: `Moderation fixture ${suffix} ${runId}`,
      description: `Fixture ${suffix}`,
      tags: `moderation,${suffix}`,
      resourceType: "NOTES",
      audience: "COLLEGE",
      courseId: a.courseId,
    })
    .attach("file", Buffer.from(`%PDF-1.4 NoteKoi ${runId} ${suffix}`, "utf8"), {
      filename: `${suffix}.pdf`,
      contentType: "application/pdf",
    });

  expect(response.status).toBe(201);
  expect(response.body.data.state).toBe("PENDING");

  return String(response.body.data.id);
};

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const collegeA = await prisma.college.create({ data: { name: `Mod College A ${runId}` } });
  const collegeB = await prisma.college.create({ data: { name: `Mod College B ${runId}` } });
  const deptA = await prisma.department.create({ data: { name: `Mod CSE ${runId}` } });
  const deptB = await prisma.department.create({ data: { name: `Mod EEE ${runId}` } });

  await prisma.collegeDepartment.createMany({
    data: [
      { collegeId: collegeA.id, departmentId: deptA.id },
      { collegeId: collegeB.id, departmentId: deptB.id },
    ],
  });

  const s1 = await prisma.session.create({ data: { departmentId: deptA.id, name: `Mod Batch 1 ${runId}` } });
  const s2 = await prisma.session.create({ data: { departmentId: deptA.id, name: `Mod Batch 2 ${runId}` } });
  const sB = await prisma.session.create({ data: { departmentId: deptB.id, name: `Mod Batch B ${runId}` } });

  const courseA = await prisma.course.create({
    data: { departmentId: deptA.id, name: `Mod Algorithms ${runId}`, semester: 3 },
  });
  const courseB = await prisma.course.create({
    data: { departmentId: deptB.id, name: `Mod Circuits ${runId}`, semester: 3 },
  });

  a = {
    collegeId: collegeA.id,
    departmentId: deptA.id,
    sessionId: s1.id,
    otherSessionId: s2.id,
    courseId: courseA.id,
  };
  b = {
    collegeId: collegeB.id,
    departmentId: deptB.id,
    sessionId: sB.id,
    otherSessionId: sB.id,
    courseId: courseB.id,
  };

  const studentA = await signUp({
    role: "STUDENT",
    name: "Mod Student A",
    email: emailOf("a"),
    collegeId: a.collegeId,
    departmentId: a.departmentId,
    sessionId: a.sessionId,
    regNo: `MA-${runId}`,
  });
  const studentB = await signUp({
    role: "STUDENT",
    name: "Mod Student B",
    email: emailOf("b"),
    collegeId: a.collegeId,
    departmentId: a.departmentId,
    sessionId: a.otherSessionId,
    regNo: `MB-${runId}`,
  });
  const studentOtherCollege = await signUp({
    role: "STUDENT",
    name: "Mod Student Other",
    email: emailOf("other"),
    collegeId: b.collegeId,
    departmentId: b.departmentId,
    sessionId: b.sessionId,
    regNo: `MOC-${runId}`,
  });
  const cr = await signUp({
    role: "STUDENT",
    name: "Mod CR",
    email: emailOf("cr"),
    collegeId: a.collegeId,
    departmentId: a.departmentId,
    sessionId: a.sessionId,
    regNo: `MCR-${runId}`,
  });
  const subAdmin = await signUp({
    role: "TEACHER",
    name: "Mod Sub Admin",
    email: emailOf("subadmin"),
    collegeId: a.collegeId,
    departmentIds: [a.departmentId],
  });

  await Promise.all([
    activate(studentA.userId),
    activate(studentB.userId),
    activate(studentOtherCollege.userId),
    activate(cr.userId),
    activate(subAdmin.userId),
  ]);

  await prisma.userRole.createMany({
    data: [
      {
        userId: cr.userId,
        role: "CR",
        scope: "DEPARTMENT_SESSION",
        collegeId: a.collegeId,
        departmentId: a.departmentId,
        sessionId: a.sessionId,
        appointmentType: "STANDARD",
      },
      {
        userId: subAdmin.userId,
        role: "SUB_ADMIN",
        scope: "COLLEGE",
        collegeId: a.collegeId,
        appointmentType: "STANDARD",
      },
    ],
  });

  users.studentA = { id: studentA.userId, cookie: studentA.cookie };
  users.studentB = { id: studentB.userId, cookie: studentB.cookie };
  users.studentOtherCollege = { id: studentOtherCollege.userId, cookie: studentOtherCollege.cookie };
  users.cr = { id: cr.userId, cookie: cr.cookie };
  users.subAdmin = { id: subAdmin.userId, cookie: subAdmin.cookie };
});
describeWithDatabase("moderation (S3-B6)", () => {
  it("refuses guests and students", async () => {
    const guest = await api().get("/api/v1/moderation/queue");

    expect(guest.status).toBe(401);

    const student = await api().get("/api/v1/moderation/queue").set("Cookie", users.studentA.cookie);

    expect(student.status).toBe(403);
    expect(student.body.code).toBe("FORBIDDEN_SCOPE");
  });

  it("lists the caller's batch, oldest first, with uploader and course joined", async () => {
    const older = await pendingUpload(users.studentA.cookie, "queue-older");
    const newer = await pendingUpload(users.studentA.cookie, "queue-newer");
    const otherBatch = await pendingUpload(users.studentB.cookie, "queue-other-batch");

    const response = await api().get("/api/v1/moderation/queue").set("Cookie", users.cr.cookie);

    expect(response.status).toBe(200);

    const ids: string[] = response.body.data.map((item: { id: string }) => item.id);

    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(ids).not.toContain(otherBatch);
    expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));

    const item = response.body.data.find((row: { id: string }) => row.id === older);

    expect(item.uploader.id).toBe(users.studentA.id);
    expect(item.course.name).toContain("Mod Algorithms");
    expect(item.session.name).toContain("Mod Batch 1");
    expect(item.versionNo).toBe(1);
    expect(item.versionState).toBe("PENDING");
    expect(item.sizeBytes).toBeGreaterThan(0);
    expect(item.mimeType).toBe("application/pdf");
  });

  it("opens a pending row once, then reports a conflict", async () => {
    const id = await pendingUpload(users.studentA.cookie, "open-once");

    const opened = await api().post(`/api/v1/moderation/resources/${id}/open`).set("Cookie", users.cr.cookie);

    expect(opened.status).toBe(200);
    expect(opened.body.data.state).toBe("IN_REVIEW");
    expect(opened.body.data.previousState).toBe("PENDING");

    const again = await api().post(`/api/v1/moderation/resources/${id}/open`).set("Cookie", users.cr.cookie);

    expect(again.status).toBe(409);
    expect(again.body.code).toBe("RESOURCE_ALREADY_IN_REVIEW");

    const stored = await prisma.resource.findUniqueOrThrow({ where: { id }, select: { state: true } });

    expect(stored.state).toBe("IN_REVIEW");

    const audit = await prisma.auditLog.findFirst({ where: { targetId: id, action: "REVIEW_STARTED" } });

    expect(audit?.actorId).toBe(users.cr.id);

    const inReview = await api()
      .get("/api/v1/moderation/queue?state=IN_REVIEW")
      .set("Cookie", users.cr.cookie);

    expect(inReview.body.data.map((row: { id: string }) => row.id)).toContain(id);
  });


  it("hides another batch's resource behind a 404", async () => {
    const otherBatch = await pendingUpload(users.studentB.cookie, "cross-batch");

    for (const action of ["open", "approve", "reject"]) {
      const response = await api()
        .post(`/api/v1/moderation/resources/${otherBatch}/${action}`)
        .set("Cookie", users.cr.cookie)
        .send({ reason: "Not my batch but a long enough reason" });

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("RESOURCE_NOT_FOUND");
    }

    const q = await api().get("/api/v1/moderation/queue").set("Cookie", users.cr.cookie);

    expect(q.body.data.map((row: { id: string }) => row.id)).not.toContain(otherBatch);
  });

  it("approves: both rows move, one audit row, one notification", async () => {
    const id = await pendingUpload(users.studentA.cookie, "approve-me");

    const approved = await api().post(`/api/v1/moderation/resources/${id}/approve`).set("Cookie", users.cr.cookie);

    expect(approved.status).toBe(200);
    expect(approved.body.data.state).toBe("APPROVED");
    expect(approved.body.data.previousState).toBe("PENDING");
    expect(approved.body.data.versionNo).toBe(1);
    expect(approved.body.data.versionState).toBe("APPROVED");

    const stored = await prisma.resource.findUniqueOrThrow({
      where: { id },
      select: { state: true, versions: { select: { versionNo: true, state: true } } },
    });

    expect(stored.state).toBe("APPROVED");
    expect(stored.versions).toEqual([{ versionNo: 1, state: "APPROVED" }]);

    const audit = await prisma.auditLog.findFirst({ where: { targetId: id, action: "RESOURCE_APPROVED" } });

    expect(audit?.actorId).toBe(users.cr.id);

    const notification = await prisma.notification.findFirst({
      where: { userId: users.studentA.id, type: "RESOURCE_APPROVED" },
      orderBy: { createdAt: "desc" },
    });

    expect(notification?.payload).toMatchObject({ resourceId: id });

    const twice = await api().post(`/api/v1/moderation/resources/${id}/approve`).set("Cookie", users.cr.cookie);

    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("RESOURCE_NOT_PENDING");

    const q = await api().get("/api/v1/moderation/queue?state=PENDING").set("Cookie", users.cr.cookie);

    expect(q.body.data.map((row: { id: string }) => row.id)).not.toContain(id);
  });
  it("rejects only with a reason, and stores it for the uploader", async () => {
    const id = await pendingUpload(users.studentA.cookie, "reject-me");

    const tooShort = await api()
      .post(`/api/v1/moderation/resources/${id}/reject`)
      .set("Cookie", users.cr.cookie)
      .send({ reason: "no" });

    expect(tooShort.status).toBe(400);

    const reason = "Scanned pages are unreadable; resubmit a clear copy.";
    const rejected = await api()
      .post(`/api/v1/moderation/resources/${id}/reject`)
      .set("Cookie", users.cr.cookie)
      .send({ reason });

    expect(rejected.status).toBe(200);
    expect(rejected.body.data.state).toBe("REJECTED");
    expect(rejected.body.data.versionState).toBe("REJECTED");
    expect(rejected.body.data.reason).toBe(reason);

    const version = await prisma.resourceVersion.findFirstOrThrow({ where: { resourceId: id } });

    expect(version.state).toBe("REJECTED");
    expect(version.rejectionReason).toBe(reason);

    const audit = await prisma.auditLog.findFirst({ where: { targetId: id, action: "RESOURCE_REJECTED" } });

    expect(audit?.justification).toBe(reason);

    const notification = await prisma.notification.findFirst({
      where: { userId: users.studentA.id, type: "RESOURCE_REJECTED" },
      orderBy: { createdAt: "desc" },
    });

    expect(notification?.payload).toMatchObject({ resourceId: id, reason });
  });

  it("lets a Sub Admin moderate across their college but not another", async () => {
    const sameCollege = await pendingUpload(users.studentB.cookie, "sub-same-college");

    const approved = await api()
      .post(`/api/v1/moderation/resources/${sameCollege}/approve`)
      .set("Cookie", users.subAdmin.cookie);

    expect(approved.status).toBe(200);
    expect(approved.body.data.state).toBe("APPROVED");

    const foreign = await api()
      .post("/api/v1/resources")
      .set("Cookie", users.studentOtherCollege.cookie)
      .field({
        title: `Foreign college fixture ${runId}`,
        resourceType: "NOTES",
        audience: "COLLEGE",
        courseId: b.courseId,
      })
      .attach("file", Buffer.from(`%PDF-1.4 foreign ${runId}`, "utf8"), {
        filename: "foreign.pdf",
        contentType: "application/pdf",
      });

    expect(foreign.status).toBe(201);

    const refused = await api()
      .post(`/api/v1/moderation/resources/${String(foreign.body.data.id)}/approve`)
      .set("Cookie", users.subAdmin.cookie);

    expect(refused.status).toBe(404);
    expect(refused.body.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("rejects a malformed resource id", async () => {
    const response = await api()
      .post("/api/v1/moderation/resources/not-a-uuid/open")
      .set("Cookie", users.cr.cookie);

    expect(response.status).toBe(400);
  });
});

