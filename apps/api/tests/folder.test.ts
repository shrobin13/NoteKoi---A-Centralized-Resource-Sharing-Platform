import cookieParser from "cookie-parser";
import express from "express";
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
const emailOf = (kind: string): string => `folder-${kind}-${runId}@test.local`;
const api = () => request(app);

interface SignedUp {
  userId: string;
  cookie: string;
}

interface Fixtures {
  collegeId: string;
  departmentId: string;
  otherDepartmentId: string;
  courseId: string;
  otherCourseId: string;
  owner: SignedUp;
  otherTeacher: SignedUp;
  student: SignedUp;
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

  const college = await prisma.college.create({ data: { name: `Folder College ${runId}` } });
  const department = await prisma.department.create({ data: { name: `Folder CSE ${runId}` } });
  const otherDepartment = await prisma.department.create({ data: { name: `Folder EEE ${runId}` } });
  await prisma.collegeDepartment.createMany({
    data: [
      { collegeId: college.id, departmentId: department.id },
      { collegeId: college.id, departmentId: otherDepartment.id },
    ],
  });
  const course = await prisma.course.create({
    data: { departmentId: department.id, name: `Folder Course ${runId}`, semester: 2 },
  });
  const otherCourse = await prisma.course.create({
    data: { departmentId: otherDepartment.id, name: `Other Folder Course ${runId}`, semester: 2 },
  });

  fixtures = {
    collegeId: college.id,
    departmentId: department.id,
    otherDepartmentId: otherDepartment.id,
    courseId: course.id,
    otherCourseId: otherCourse.id,
    owner: { userId: "", cookie: "" },
    otherTeacher: { userId: "", cookie: "" },
    student: { userId: "", cookie: "" },
  };

  fixtures.owner = await signUp({
    role: "TEACHER",
    name: "Folder Owner",
    email: emailOf("owner"),
    collegeId: college.id,
    departmentIds: [department.id],
  });
  await activateTeacher(fixtures.owner.userId);

  fixtures.otherTeacher = await signUp({
    role: "TEACHER",
    name: "Other Folder Teacher",
    email: emailOf("other-teacher"),
    collegeId: college.id,
    departmentIds: [otherDepartment.id],
  });
  await activateTeacher(fixtures.otherTeacher.userId);

  const session = await prisma.session.create({ data: { departmentId: department.id, name: `Folder Session ${runId}` } });
  fixtures.student = await signUp({
    role: "STUDENT",
    name: "Folder Student",
    email: emailOf("student"),
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    regNo: `REG-folder-${runId}`,
  });
  await activateStudent(fixtures.student.userId);
});

const createFolder = (cookie: string, name: string, extra: Record<string, unknown> = {}) =>
  api().post("/api/v1/folders").set("Cookie", cookie).send({ name, ...extra });

describeWithDatabase("folders (S4-B1)", () => {
  it("creates, lists, renames, moves, and deletes an empty folder tree", async () => {
    const root = await createFolder(fixtures.owner.cookie, `Root ${runId}`, { courseId: fixtures.courseId });
    expect(root.status).toBe(201);
    expect(root.body.data).toMatchObject({ name: `Root ${runId}`, depth: 0, courseId: fixtures.courseId, childCount: 0 });

    const child = await createFolder(fixtures.owner.cookie, `Child ${runId}`, { parentId: root.body.data.id });
    expect(child.status).toBe(201);
    expect(child.body.data).toMatchObject({ parentId: root.body.data.id, depth: 1, courseId: fixtures.courseId });

    const tree = await api().get("/api/v1/folders").set("Cookie", fixtures.owner.cookie);
    expect(tree.status).toBe(200);
    expect(tree.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: root.body.data.id,
          childCount: 1,
          children: [expect.objectContaining({ id: child.body.data.id, depth: 1 })],
        }),
      ]),
    );

    const renamed = await api()
      .patch(`/api/v1/folders/${child.body.data.id}`)
      .set("Cookie", fixtures.owner.cookie)
      .send({ name: `Renamed ${runId}` });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe(`Renamed ${runId}`);

    const moved = await api()
      .patch(`/api/v1/folders/${child.body.data.id}`)
      .set("Cookie", fixtures.owner.cookie)
      .send({ parentId: null });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ parentId: null, depth: 0 });

    const deleted = await api().delete(`/api/v1/folders/${root.body.data.id}`).set("Cookie", fixtures.owner.cookie);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toMatchObject({ id: root.body.data.id, deleted: true });
  });

  it("rejects malformed folder inputs", async () => {
    const emptyName = await createFolder(fixtures.owner.cookie, "   ");
    expect(emptyName.status).toBe(400);

    const emptyUpdate = await api()
      .patch(`/api/v1/folders/${crypto.randomUUID()}`)
      .set("Cookie", fixtures.owner.cookie)
      .send({});
    expect(emptyUpdate.status).toBe(400);

    const badId = await api()
      .patch("/api/v1/folders/not-a-uuid")
      .set("Cookie", fixtures.owner.cookie)
      .send({ name: "Valid name" });
    expect(badId.status).toBe(400);
  });

  it("requires a session and a verified teacher role", async () => {
    const guest = await api().get("/api/v1/folders");
    expect(guest.status).toBe(401);
    expect(guest.body.code).toBe("NOT_AUTHENTICATED");

    const student = await createFolder(fixtures.student.cookie, `Student Folder ${runId}`);
    expect(student.status).toBe(403);
    expect(student.body.code).toBe("FORBIDDEN_ROLE");
  });

  it("scopes folders and course-linked roots to the owner's assigned departments", async () => {
    const foreignCourse = await createFolder(fixtures.owner.cookie, `Foreign course ${runId}`, {
      courseId: fixtures.otherCourseId,
    });
    expect(foreignCourse.status).toBe(403);
    expect(foreignCourse.body.code).toBe("FORBIDDEN_SCOPE");

    const root = await createFolder(fixtures.owner.cookie, `Private root ${runId}`);
    const otherOwner = await api()
      .patch(`/api/v1/folders/${root.body.data.id}`)
      .set("Cookie", fixtures.otherTeacher.cookie)
      .send({ name: "Hijack" });
    expect(otherOwner.status).toBe(404);
    expect(otherOwner.body.code).toBe("FOLDER_NOT_FOUND");
  });

  it("prevents cycles and rejects nesting beyond depth five", async () => {
    const root = await createFolder(fixtures.owner.cookie, `Cycle root ${runId}`);
    const child = await createFolder(fixtures.owner.cookie, `Cycle child ${runId}`, { parentId: root.body.data.id });
    const cycle = await api()
      .patch(`/api/v1/folders/${root.body.data.id}`)
      .set("Cookie", fixtures.owner.cookie)
      .send({ parentId: child.body.data.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.code).toBe("FOLDER_CYCLE");

    let parentId: string | null = null;
    for (let depth = 0; depth <= 5; depth += 1) {
      const nested = await createFolder(fixtures.owner.cookie, `Depth ${depth} ${runId}`, {
        ...(parentId ? { parentId } : {}),
      });
      expect(nested.status).toBe(201);
      parentId = String(nested.body.data.id);
    }

    const tooDeep = await createFolder(fixtures.owner.cookie, `Depth 6 ${runId}`, { parentId });
    expect(tooDeep.status).toBe(400);
    expect(tooDeep.body.code).toBe("FOLDER_DEPTH_LIMIT");
  });

  it("refuses to delete a folder with children and deletes an empty folder", async () => {
    const root = await createFolder(fixtures.owner.cookie, `Nonempty root ${runId}`);
    const child = await createFolder(fixtures.owner.cookie, `Nonempty child ${runId}`, { parentId: root.body.data.id });

    const blocked = await api().delete(`/api/v1/folders/${root.body.data.id}`).set("Cookie", fixtures.owner.cookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("FOLDER_NOT_EMPTY");

    const deleteChild = await api().delete(`/api/v1/folders/${child.body.data.id}`).set("Cookie", fixtures.owner.cookie);
    expect(deleteChild.status).toBe(200);
  });
});