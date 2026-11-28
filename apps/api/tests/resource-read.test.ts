import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

/**
 * S3-B4 — reading resources: browse/search, detail and the proxied download.
 *
 * Every read has to agree with `lib/visibility.ts` (S3-B1's matrix), so the
 * fixtures here are one row per audience/state cell: PLATFORM, COLLEGE (two
 * colleges), PERMITTED (one batch), a teacher's PRIVATE file, a student's PENDING
 * and REJECTED upload. The file owns its fixtures and users, so it is
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
const emailOf = (kind: string): string => `read-${kind}-${runId}@test.local`;

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

const signUp = async (payload: Record<string, unknown>): Promise<SignedUp> => {
  const email = String(payload.email);
  const registered = await api().post("/api/v1/auth/register").send({ password: PASSWORD, ...payload });

  expect(registered.status).toBe(201);

  const verified = await api().post("/api/v1/auth/verify-email").send({ email, code: lastCodeFor(email) });

  expect(verified.status).toBe(200);

  const loggedIn = await api().post("/api/v1/auth/login").send({ email, password: PASSWORD });

  expect(loggedIn.status).toBe(200);

  return { userId: String(registered.body.data.userId), cookie: cookieFrom(loggedIn.headers["set-cookie"]) };
};

/** Test-only shortcut for the verification flows owned by S2-B5. */
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

interface ResourceFixture {
  id: string;
  text: string;
}

interface Fixtures {
  a: Academic;
  b: Academic;
  platform: ResourceFixture;
  collegeA: ResourceFixture;
  permitted: ResourceFixture;
  private: ResourceFixture;
  pending: ResourceFixture;
  rejected: ResourceFixture;
  collegeB: ResourceFixture;
}

let f: Fixtures;
let browseFixture: { semesterName: string; courseId: string; teacherProfileId: string; visibleIds: string[]; hiddenIds: string[] };
let browseStudentCookie = "";
let browseTeacherCookie = "";

const cookies = { studentA: "", studentA2: "", studentB: "", cr: "", teacher: "" };

const uploadFixture = async (
  cookie: string,
  title: string,
  suffix: string,
  extra: Record<string, string> = {},
  courseId?: string,
): Promise<ResourceFixture> => {
  const text = `%PDF-1.4 NoteKoi ${runId} ${suffix}`;
  const response = await api()
    .post("/api/v1/resources")
    .set("Cookie", cookie)
    .field({
      title,
      description: `Fixture ${suffix}`,
      tags: `koi,${suffix}`,
      resourceType: "NOTES",
      courseId: courseId ?? f.a.courseId,
      ...extra,
    })
    .attach("file", Buffer.from(text, "utf8"), { filename: `${suffix}.pdf`, contentType: "application/pdf" });

  expect(response.status).toBe(201);

  return { id: String(response.body.data.id), text };
};

beforeAll(async () => {
  if (!process.env.TEST_DATABASE_URL) return;

  const collegeA = await prisma.college.create({ data: { name: `Read College A ${runId}` } });
  const collegeB = await prisma.college.create({ data: { name: `Read College B ${runId}` } });
  const deptA = await prisma.department.create({ data: { name: `Read CSE ${runId}` } });
  const deptB = await prisma.department.create({ data: { name: `Read EEE ${runId}` } });

  await prisma.collegeDepartment.createMany({
    data: [
      { collegeId: collegeA.id, departmentId: deptA.id },
      { collegeId: collegeB.id, departmentId: deptB.id },
    ],
  });

  const s1 = await prisma.session.create({ data: { departmentId: deptA.id, name: `Read Batch 1 ${runId}` } });
  const s2 = await prisma.session.create({ data: { departmentId: deptA.id, name: `Read Batch 2 ${runId}` } });
  const sB = await prisma.session.create({ data: { departmentId: deptB.id, name: `Read Batch B ${runId}` } });

  const courseA = await prisma.course.create({
    data: { departmentId: deptA.id, name: `Algorithms ${runId}`, semester: 3 },
  });
  const courseB = await prisma.course.create({
    data: { departmentId: deptB.id, name: `Circuits ${runId}`, semester: 3 },
  });

  f = {
    a: {
      collegeId: collegeA.id,
      departmentId: deptA.id,
      sessionId: s1.id,
      otherSessionId: s2.id,
      courseId: courseA.id,
    },
    b: {
      collegeId: collegeB.id,
      departmentId: deptB.id,
      sessionId: sB.id,
      otherSessionId: sB.id,
      courseId: courseB.id,
    },
  } as Fixtures;

  const studentA = await signUp({
    role: "STUDENT",
    name: "Reader A1",
    email: emailOf("a1"),
    collegeId: f.a.collegeId,
    departmentId: f.a.departmentId,
    sessionId: f.a.sessionId,
    regNo: `RA1-${runId}`,
  });
  const studentA2 = await signUp({
    role: "STUDENT",
    name: "Reader A2",
    email: emailOf("a2"),
    collegeId: f.a.collegeId,
    departmentId: f.a.departmentId,
    sessionId: f.a.otherSessionId,
    regNo: `RA2-${runId}`,
  });
  const studentB = await signUp({
    role: "STUDENT",
    name: "Reader B",
    email: emailOf("b"),
    collegeId: f.b.collegeId,
    departmentId: f.b.departmentId,
    sessionId: f.b.sessionId,
    regNo: `RB-${runId}`,
  });
  const cr = await signUp({
    role: "STUDENT",
    name: "Reader CR",
    email: emailOf("cr"),
    collegeId: f.a.collegeId,
    departmentId: f.a.departmentId,
    sessionId: f.a.sessionId,
    regNo: `RCR-${runId}`,
  });
  const teacher = await signUp({
    role: "TEACHER",
    name: "Reader Teacher",
    email: emailOf("teacher"),
    collegeId: f.a.collegeId,
    departmentIds: [f.a.departmentId],
  });
  const browseStudent = await signUp({
    role: "STUDENT",
    name: "Browse Reader",
    email: emailOf("browse-student"),
    collegeId: f.a.collegeId,
    departmentId: f.a.departmentId,
    sessionId: f.a.sessionId,
    regNo: `BR-${runId}`,
  });
  const browseTeacher = await signUp({
    role: "TEACHER",
    name: "Browse Teacher",
    email: emailOf("browse-teacher"),
    collegeId: f.a.collegeId,
    departmentIds: [f.a.departmentId],
  });

  await Promise.all([
    activate(studentA.userId),
    activate(studentA2.userId),
    activate(studentB.userId),
    activate(cr.userId),
    activate(teacher.userId),
    activate(browseStudent.userId),
    activate(browseTeacher.userId),
  ]);

  await prisma.userRole.create({
    data: {
      userId: cr.userId,
      role: "CR",
      scope: "DEPARTMENT_SESSION",
      collegeId: f.a.collegeId,
      departmentId: f.a.departmentId,
      sessionId: f.a.sessionId,
      appointmentType: "STANDARD",
    },
  });

  cookies.studentA = studentA.cookie;
  cookies.studentA2 = studentA2.cookie;
  cookies.studentB = studentB.cookie;
  cookies.cr = cr.cookie;
  cookies.teacher = teacher.cookie;
  browseStudentCookie = browseStudent.cookie;
  browseTeacherCookie = browseTeacher.cookie;

  const semesterName = `Semester 5 ${runId}`;
  const teacherProfile = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: browseTeacher.userId }, select: { id: true } });
  const semesters = await Promise.all([f.a.sessionId, f.a.otherSessionId].map((sessionId) => prisma.semester.create({
    data: { collegeId: f.a.collegeId, departmentId: f.a.departmentId, sessionId, name: semesterName, createdById: cr.userId },
  })));
  const placements = await Promise.all(semesters.map((entry) => prisma.semesterCourse.create({
    data: { semesterId: entry.id, courseId: f.a.courseId, teacherProfileId: teacherProfile.id },
  })));
  const categories = await Promise.all(placements.map((entry) => prisma.category.create({
    data: { semesterCourseId: entry.id, name: "Lecture slides", createdById: browseTeacher.userId },
  })));
  await prisma.studentProfile.update({ where: { userId: browseStudent.userId }, data: { includeOtherColleges: true } });
  const publicFileA = await uploadFixture(browseTeacherCookie, `Browse public A ${runId}`, "browse-public-a", {
    audience: "PLATFORM", semesterCourseId: placements[0]!.id, categoryId: categories[0]!.id,
  });
  const publicFileB = await uploadFixture(browseTeacherCookie, `Browse public B ${runId}`, "browse-public-b", {
    audience: "PLATFORM", semesterCourseId: placements[1]!.id, categoryId: categories[1]!.id,
  });
  await prisma.resource.updateMany({ where: { id: { in: [publicFileA.id, publicFileB.id] } }, data: { state: "PENDING" } });
  await prisma.resourceVersion.updateMany({ where: { resourceId: { in: [publicFileA.id, publicFileB.id] } }, data: { state: "PENDING" } });
  const permittedFile = await uploadFixture(browseTeacherCookie, `Browse permitted ${runId}`, "browse-permitted", {
    audience: "PERMITTED", sessionIds: f.a.sessionId, semesterCourseId: placements[0]!.id,
  });
  const privateFile = await uploadFixture(browseTeacherCookie, `Browse private ${runId}`, "browse-private", {
    audience: "PRIVATE", semesterCourseId: placements[0]!.id,
  });
  const pendingFile = await uploadFixture(browseTeacherCookie, `Browse pending ${runId}`, "browse-pending", {
    audience: "PLATFORM", semesterCourseId: placements[0]!.id,
  });
  await prisma.resource.update({ where: { id: pendingFile.id }, data: { state: "PENDING" } });
  await prisma.resourceVersion.updateMany({ where: { resourceId: pendingFile.id }, data: { state: "PENDING" } });
  browseFixture = {
    semesterName,
    courseId: f.a.courseId,
    teacherProfileId: teacherProfile.id,
    visibleIds: [publicFileA.id, publicFileB.id],
    hiddenIds: [permittedFile.id, privateFile.id, pendingFile.id],
  };

  f.platform = await uploadFixture(cr.cookie, `Platform announcement ${runId}`, "platform", {
    audience: "PLATFORM",
    tags: "shared,koi",
  });
  f.collegeA = await uploadFixture(cr.cookie, `College notes ${runId}`, "college-a", { audience: "COLLEGE" });
  f.permitted = await uploadFixture(teacher.cookie, `Permitted lab manual ${runId}`, "permitted", {
    audience: "PERMITTED",
    sessionIds: f.a.sessionId,
  });
  f.private = await uploadFixture(teacher.cookie, `Private draft ${runId}`, "private");
  f.pending = await uploadFixture(studentA.cookie, `Pending assignment ${runId}`, "pending");
  f.rejected = await uploadFixture(studentA.cookie, `Rejected quiz ${runId}`, "rejected", {
    resourceType: "QUESTION_BANK",
  });
  f.collegeB = await uploadFixture(
    studentB.cookie,
    `Other college notes ${runId}`,
    "college-b",
    {},
    f.b.courseId,
  );

  // The states the moderation endpoints will produce on their own (S3-B6).
  await prisma.resource.update({ where: { id: f.rejected.id }, data: { state: "REJECTED" } });
  await prisma.resourceVersion.updateMany({
    where: { resourceId: f.rejected.id },
    data: { state: "REJECTED", rejectionReason: "Duplicate upload" },
  });
  await prisma.resource.update({ where: { id: f.collegeB.id }, data: { state: "APPROVED" } });
  await prisma.resourceVersion.updateMany({ where: { resourceId: f.collegeB.id }, data: { state: "APPROVED" } });
});

describeWithDatabase("resources: browse and search (S3-B4)", () => {
  const ids = (body: { data: { id: string }[] }): string[] => body.data.map((row) => row.id);

  it("requires authentication, validates browse input, aggregates batches and hides non-public files", async () => {
    const semesterPath = "/api/v1/resources/browse/semesters";
    expect((await api().get(semesterPath).query({ collegeId: f.a.collegeId, departmentId: f.a.departmentId })).status).toBe(401);
    expect((await api().get(semesterPath).set("Cookie", browseStudentCookie).query({ collegeId: "bad-id", departmentId: f.a.departmentId })).status).toBe(400);

    const semesters = await api().get(semesterPath).set("Cookie", browseStudentCookie).query({ collegeId: f.a.collegeId, departmentId: f.a.departmentId });
    expect(semesters.status).toBe(200);
    expect(semesters.body.data.filter((name: string) => name === browseFixture.semesterName)).toHaveLength(1);

    const courses = await api().get("/api/v1/resources/browse/courses").set("Cookie", browseStudentCookie).query({
      collegeId: f.a.collegeId, departmentId: f.a.departmentId, semester: browseFixture.semesterName,
    });
    expect(courses.status).toBe(200);
    expect(courses.body.data).toHaveLength(1);
    expect(courses.body.data[0]).toMatchObject({ courseId: browseFixture.courseId, teacherProfileId: browseFixture.teacherProfileId, categories: ["Lecture slides"] });

    await prisma.resource.updateMany({ where: { id: { in: browseFixture.visibleIds } }, data: { state: "APPROVED" } });
    await prisma.resourceVersion.updateMany({ where: { resourceId: { in: browseFixture.visibleIds } }, data: { state: "APPROVED" } });
    const files = await api().get("/api/v1/resources/browse/files").set("Cookie", browseStudentCookie).query({
      collegeId: f.a.collegeId,
      departmentId: f.a.departmentId,
      semester: browseFixture.semesterName,
      courseId: browseFixture.courseId,
      teacherProfileId: browseFixture.teacherProfileId,
      categoryName: "Sir's slides",
    });
    expect(files.status).toBe(200);
    await prisma.resource.updateMany({ where: { id: { in: browseFixture.visibleIds } }, data: { state: "PENDING" } });
    await prisma.resourceVersion.updateMany({ where: { resourceId: { in: browseFixture.visibleIds } }, data: { state: "PENDING" } });
    expect(ids(files.body)).toEqual(expect.arrayContaining(browseFixture.visibleIds));
    expect(ids(files.body)).toHaveLength(browseFixture.visibleIds.length);
    for (const hiddenId of browseFixture.hiddenIds) expect(ids(files.body)).not.toContain(hiddenId);
  });

  const browse = (query: Record<string, string | number> = {}, cookie?: string) => {
    const call = api().get("/api/v1/resources").query({ keyword: runId, ...query });

    return cookie ? call.set("Cookie", cookie) : call;
  };

  const toggleOtherColleges = async (email: string, value: boolean): Promise<void> => {
    const profile = await prisma.studentProfile.findFirstOrThrow({
      where: { user: { email } },
      select: { userId: true },
    });

    await prisma.studentProfile.update({
      where: { userId: profile.userId },
      data: { includeOtherColleges: value },
    });
  };

  it("shows a guest only approved PLATFORM resources", async () => {
    const response = await browse();

    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual([f.platform.id]);
    expect(response.body.meta).toMatchObject({ page: 1, pageSize: 12, total: 1, totalPages: 1 });
  });

  it("shows a student their college and their batch's PERMITTED files", async () => {
    const response = await browse({}, cookies.studentA);

    expect(new Set(ids(response.body))).toEqual(new Set([f.platform.id, f.collegeA.id, f.permitted.id]));
  });

  it("never lists another college, a pending, a rejected or a teacher's private row", async () => {
    const response = await browse({}, cookies.studentA);
    const listed = ids(response.body);

    for (const hidden of [f.pending.id, f.rejected.id, f.private.id, f.collegeB.id]) {
      expect(listed).not.toContain(hidden);
    }
  });

  it("keeps a PERMITTED file inside the granted batch", async () => {
    const response = await browse({}, cookies.studentA2);

    expect(new Set(ids(response.body))).toEqual(new Set([f.platform.id, f.collegeA.id]));
  });

  it("widens COLLEGE to every college only after the student opts in", async () => {
    const before = await browse({}, cookies.studentB);

    expect(new Set(ids(before.body))).toEqual(new Set([f.platform.id, f.collegeB.id]));

    await toggleOtherColleges(emailOf("b"), true);

    try {
      const after = await browse({}, cookies.studentB);

      expect(new Set(ids(after.body))).toEqual(
        new Set([f.platform.id, f.collegeB.id, f.collegeA.id]),
      );
    } finally {
      await toggleOtherColleges(emailOf("b"), false);
    }
  });

  it("matches the keyword against tags and keeps the type filter", async () => {
    const byTag = await browse({ keyword: "college-a" }, cookies.studentA);

    expect(ids(byTag.body)).toEqual([f.collegeA.id]);

    const asNotes = await browse({ resourceType: "NOTES" });
    const asQuestionBank = await browse({ resourceType: "QUESTION_BANK" });

    expect(ids(asNotes.body)).toEqual([f.platform.id]);
    expect(asQuestionBank.body.data).toEqual([]);
  });

  it("filters by course", async () => {
    const ownCourse = await browse({ courseId: f.a.courseId });
    const otherCourse = await browse({ courseId: f.b.courseId });

    expect(ids(ownCourse.body)).toEqual([f.platform.id]);
    expect(otherCourse.body.data).toEqual([]);
  });

  it("paginates and reports the totals", async () => {
    const firstPage = await browse({ pageSize: 2, page: 1 }, cookies.studentA);
    const secondPage = await browse({ pageSize: 2, page: 2 }, cookies.studentA);

    expect(firstPage.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(firstPage.body.data).toHaveLength(2);
    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.meta).toMatchObject({ page: 2, totalPages: 2 });
  });

  it("rejects an invalid page size", async () => {
    const response = await browse({ pageSize: 500 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});



describeWithDatabase("resources: detail and my uploads (S3-B4)", () => {
  const detail = (id: string, cookie?: string) => {
    const call = api().get(`/api/v1/resources/${id}`);

    return cookie ? call.set("Cookie", cookie) : call;
  };

  const mine = (cookie?: string) => {
    const call = api().get("/api/v1/resources/mine").query({ keyword: runId });

    return cookie ? call.set("Cookie", cookie) : call;
  };

  it("returns an approved COLLEGE resource to a classmate", async () => {
    const response = await detail(f.collegeA.id, cookies.studentA);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: f.collegeA.id,
      audience: "COLLEGE",
      state: "APPROVED",
      courseId: f.a.courseId,
    });
    expect(response.body.data.course.name).toContain("Algorithms");
    expect(response.body.data.versions).toHaveLength(1);
    expect(response.body.data.versions[0].mimeType).toBe("application/pdf");
  });

  it("hides a COLLEGE resource from a guest and from another college", async () => {
    for (const cookie of [undefined, cookies.studentB]) {
      const response = await detail(f.collegeA.id, cookie);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe("RESOURCE_NOT_FOUND");
    }
  });

  it("shows the uploader their pending and rejected rows, but not a classmate", async () => {
    const pending = await detail(f.pending.id, cookies.studentA);
    const rejected = await detail(f.rejected.id, cookies.studentA);
    const classmate = await detail(f.pending.id, cookies.studentA2);

    expect(pending.status).toBe(200);
    expect(pending.body.data.state).toBe("PENDING");
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.state).toBe("REJECTED");
    expect(rejected.body.data.versions[0].rejectionReason).toBe("Duplicate upload");
    expect(classmate.status).toBe(404);
  });

  it("shows a pending upload to the batch CR who has to moderate it", async () => {
    const response = await detail(f.pending.id, cookies.cr);

    expect(response.status).toBe(200);
  });

  it("keeps a teacher's PRIVATE file to the teacher", async () => {
    const owner = await detail(f.private.id, cookies.teacher);
    const student = await detail(f.private.id, cookies.studentA);

    expect(owner.status).toBe(200);
    expect(owner.body.data.audience).toBe("PRIVATE");
    expect(student.status).toBe(404);
  });

  it("answers 404 for an unknown id and 400 for a malformed one", async () => {
    const unknown = await detail("11111111-1111-4111-8111-111111111111", cookies.studentA);
    const malformed = await detail("not-a-uuid", cookies.studentA);

    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(400);
    expect(malformed.body.code).toBe("VALIDATION_ERROR");
  });

  it("lists my own uploads in every state", async () => {
    const student = await mine(cookies.studentA);
    const teacher = await mine(cookies.teacher);

    expect(new Set(student.body.data.map((row: { id: string }) => row.id))).toEqual(
      new Set([f.pending.id, f.rejected.id]),
    );
    expect(teacher.body.data.map((row: { id: string }) => row.id).sort()).toEqual(
      [f.private.id, f.permitted.id].sort(),
    );
  });

  it("filters my uploads by state", async () => {
    const response = await api()
      .get("/api/v1/resources/mine")
      .query({ keyword: runId, state: "PENDING" })
      .set("Cookie", cookies.studentA);

    expect(response.body.data.map((row: { id: string }) => row.id)).toEqual([f.pending.id]);
  });

  it("refuses my uploads without a session", async () => {
    const response = await mine();

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("NOT_AUTHENTICATED");
  });
});

describeWithDatabase("resources: proxied download (S3-B4)", () => {
  const download = (id: string, cookie?: string) => {
    const call = api().get(`/api/v1/resources/${id}/download`);

    return cookie ? call.set("Cookie", cookie) : call;
  };

  it("streams the stored bytes to an allowed viewer", async () => {
    const response = await download(f.collegeA.id, cookies.studentA);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain('attachment; filename="College notes');
    expect(response.headers["content-disposition"]).toContain(".pdf");
    expect(response.headers["x-resource-version"]).toBe("1");
    expect(Buffer.from(response.body).toString("utf8")).toBe(f.collegeA.text);
  });

  it("serves a PLATFORM file to a guest", async () => {
    const response = await download(f.platform.id);

    expect(response.status).toBe(200);
    expect(Buffer.from(response.body).toString("utf8")).toBe(f.platform.text);
  });

  it("refuses a COLLEGE file to a guest and a PRIVATE file to a student", async () => {
    const asGuest = await download(f.collegeA.id);
    const asStudent = await download(f.private.id, cookies.studentA);

    expect(asGuest.status).toBe(404);
    expect(asStudent.status).toBe(404);
  });

  it("lets the uploader and the moderating CR download a pending version", async () => {
    const owner = await download(f.pending.id, cookies.studentA);
    const moderator = await download(f.pending.id, cookies.cr);

    expect(owner.status).toBe(200);
    expect(moderator.status).toBe(200);
    expect(Buffer.from(owner.body).toString("utf8")).toBe(f.pending.text);
  });

  it("refuses a rejected version to a classmate", async () => {
    const response = await download(f.rejected.id, cookies.studentA2);

    expect(response.status).toBe(404);
  });

  it("rejects a malformed id", async () => {
    const response = await download("not-a-uuid", cookies.studentA);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
  });
});
