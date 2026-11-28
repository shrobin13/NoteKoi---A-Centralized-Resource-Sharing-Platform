import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mailBox = vi.hoisted(() => ({ sent: [] as { to: string; code: string }[] }));
vi.mock("../src/lib/mailer.js", () => ({
  sendOtpEmail: async (input: { to: string; name: string; code: string; purpose: string }) => { mailBox.sent.push(input); },
}));

const describeWithDatabase = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 10_000)}`;
const password = "Pass1234!";
const api = () => request(app);

const cookieFrom = (setCookie: unknown) => {
  const cookie = ((setCookie ?? []) as string[]).find((value) => value.startsWith("accessToken="));
  if (!cookie) throw new Error("Login did not set the accessToken cookie");
  return cookie.split(";")[0] as string;
};

const signUpStudent = async (label: string, sessionId: string, departmentId: string, collegeId: string) => {
  const email = `semester-${label}-${runId}@test.local`;
  const registration = await api().post("/api/v1/auth/register").send({ role: "STUDENT", name: label, email, password, collegeId, departmentId, sessionId, regNo: `S-${label}-${runId}` });
  expect(registration.status).toBe(201);
  const userId = String(registration.body.data.userId);
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  const login = await api().post("/api/v1/auth/login").send({ email, password });
  expect(login.status).toBe(200);
  await prisma.studentProfile.update({ where: { userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });
  return { userId, cookie: cookieFrom(login.headers["set-cookie"]) };
};

const signUpTeacher = async (collegeId: string, departmentId: string) => {
  const email = `semester-teacher-${runId}@test.local`;
  const registration = await api().post("/api/v1/auth/register").send({ role: "TEACHER", name: "Semester Teacher", email, password, collegeId, departmentIds: [departmentId] });
  expect(registration.status).toBe(201);
  const userId = String(registration.body.data.userId);
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  const login = await api().post("/api/v1/auth/login").send({ email, password });
  expect(login.status).toBe(200);
  const profile = await prisma.teacherProfile.update({ where: { userId }, data: { verificationStatus: "ACTIVE", verifiedAt: new Date() } });
  return { userId, profileId: profile.id, cookie: cookieFrom(login.headers["set-cookie"]) };
};

const addCrRole = (userId: string, collegeId: string, departmentId: string, sessionId: string) =>
  prisma.userRole.create({ data: { userId, role: "CR", scope: "DEPARTMENT_SESSION", collegeId, departmentId, sessionId } });

const createResource = (input: { uploaderId: string; uploaderType: "STUDENT" | "TEACHER"; collegeId: string; departmentId: string; sessionId: string | null; courseId: string; semesterCourseId?: string; categoryId?: string }) =>
  prisma.resource.create({
    data: {
      uploaderId: input.uploaderId, uploaderType: input.uploaderType, collegeId: input.collegeId,
      departmentId: input.departmentId, sessionId: input.sessionId, courseId: input.courseId,
      semesterCourseId: input.semesterCourseId, categoryId: input.categoryId, title: `Fixture ${runId}`,
      resourceType: "NOTES", audience: input.uploaderType === "TEACHER" ? "PRIVATE" : "COLLEGE", state: "PENDING",
    },
  });

describeWithDatabase("semester API", () => {
  let collegeId: string;
  let departmentId: string;
  let otherDepartmentId: string;
  let sessionId: string;
  let otherSessionId: string;
  let otherDepartmentSessionId: string;
  let courseId: string;
  let otherCourseId: string;
  let student: { userId: string; cookie: string };
  let cr: { userId: string; cookie: string };
  let otherCr: { userId: string; cookie: string };
  let teacher: { userId: string; profileId: string; cookie: string };
  let semesterId: string;
  let semesterCourseId: string;
  let categoryId: string;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    const college = await prisma.college.create({ data: { name: `Semester College ${runId}` } });
    const department = await prisma.department.create({ data: { name: `Semester CSE ${runId}` } });
    const otherDepartment = await prisma.department.create({ data: { name: `Semester EEE ${runId}` } });
    collegeId = college.id;
    departmentId = department.id;
    otherDepartmentId = otherDepartment.id;
    await prisma.collegeDepartment.createMany({ data: [{ collegeId, departmentId }, { collegeId, departmentId: otherDepartmentId }] });
    const session = await prisma.session.create({ data: { departmentId, name: `Semester Batch A ${runId}` } });
    const otherSession = await prisma.session.create({ data: { departmentId, name: `Semester Batch B ${runId}` } });
    const otherDeptSession = await prisma.session.create({ data: { departmentId: otherDepartmentId, name: `Semester Other Dept ${runId}` } });
    sessionId = session.id;
    otherSessionId = otherSession.id;
    otherDepartmentSessionId = otherDeptSession.id;
    const course = await prisma.course.create({ data: { departmentId, name: `Semester Course ${runId}`, semester: 3 } });
    const otherCourse = await prisma.course.create({ data: { departmentId: otherDepartmentId, name: `Semester Other Course ${runId}`, semester: 3 } });
    courseId = course.id;
    otherCourseId = otherCourse.id;
    student = await signUpStudent("Student", sessionId, departmentId, collegeId);
    cr = await signUpStudent("CR", sessionId, departmentId, collegeId);
    otherCr = await signUpStudent("OtherCR", otherSessionId, departmentId, collegeId);
    await Promise.all([
      addCrRole(cr.userId, collegeId, departmentId, sessionId),
      addCrRole(otherCr.userId, collegeId, departmentId, otherSessionId),
    ]);
    teacher = await signUpTeacher(collegeId, departmentId);
  });

  it("creates, lists and renames a semester only in the CR's exact scope", async () => {
    expect((await api().post("/api/v1/semesters").send({ name: "Semester 3" })).status).toBe(401);
    expect((await api().post("/api/v1/semesters").set("Cookie", student.cookie).send({ name: "Semester 3" })).status).toBe(403);
    expect((await api().post("/api/v1/semesters").set("Cookie", cr.cookie).send({ name: "x" })).status).toBe(400);
    const created = await api().post("/api/v1/semesters").set("Cookie", cr.cookie).send({ name: "Semester 3" });
    expect(created.status).toBe(201);
    semesterId = created.body.data.id as string;
    expect((await api().get("/api/v1/semesters").set("Cookie", student.cookie)).body.data).toHaveLength(1);
    expect((await api().patch(`/api/v1/semesters/${semesterId}`).set("Cookie", otherCr.cookie).send({ name: "Changed" })).status).toBe(403);
    expect((await api().patch(`/api/v1/semesters/${semesterId}`).set("Cookie", cr.cookie).send({ name: "Semester 3 renamed" })).status).toBe(200);
    expect((await api().post("/api/v1/semesters").set("Cookie", cr.cookie).send({ name: "Semester 3 renamed" })).status).toBe(409);
  });

  it("deletes only an empty semester for an in-scope CR", async () => {
    const created = await api().post("/api/v1/semesters").set("Cookie", cr.cookie).send({ name: "Empty semester" });
    expect(created.status).toBe(201);
    const emptyId = created.body.data.id as string;
    expect((await api().delete(`/api/v1/semesters/${emptyId}`)).status).toBe(401);
    expect((await api().delete(`/api/v1/semesters/${emptyId}`).set("Cookie", student.cookie)).status).toBe(403);
    expect((await api().delete(`/api/v1/semesters/${emptyId}`).set("Cookie", otherCr.cookie)).status).toBe(403);
    expect((await api().delete(`/api/v1/semesters/${emptyId}`).set("Cookie", cr.cookie)).status).toBe(200);
    expect((await api().delete(`/api/v1/semesters/${emptyId}`).set("Cookie", cr.cookie)).status).toBe(404);
  });

  it("manages courses and categories, refusing invalid scope or non-empty deletion", async () => {
    expect((await api().post(`/api/v1/semesters/${semesterId}/courses`).send({ courseId })).status).toBe(401);
    expect((await api().post(`/api/v1/semesters/${semesterId}/courses`).set("Cookie", cr.cookie).send({})).status).toBe(400);
    expect((await api().post(`/api/v1/semesters/${semesterId}/courses`).set("Cookie", cr.cookie).send({ courseId: otherCourseId })).status).toBe(400);
    expect((await api().post(`/api/v1/semesters/${semesterId}/courses`).set("Cookie", student.cookie).send({ courseId })).status).toBe(403);
    const added = await api().post(`/api/v1/semesters/${semesterId}/courses`).set("Cookie", cr.cookie).send({ courseId, teacherProfileId: teacher.profileId });
    expect(added.status).toBe(201);
    semesterCourseId = added.body.data.id as string;
    const nonEmptyDelete = await api().delete(`/api/v1/semesters/${semesterId}`).set("Cookie", cr.cookie);
    expect(nonEmptyDelete.status).toBe(409);
    expect(nonEmptyDelete.body.code).toBe("SEMESTER_NOT_EMPTY");
    expect((await api().patch(`/api/v1/semesters/semester-courses/${semesterCourseId}`).set("Cookie", otherCr.cookie).send({ courseName: "Wrong batch" })).status).toBe(403);
    expect((await api().patch(`/api/v1/semesters/semester-courses/${semesterCourseId}`).set("Cookie", cr.cookie).send({ courseName: "Algorithms - local" })).status).toBe(200);
    expect((await api().post(`/api/v1/semesters/${semesterId}/courses`).set("Cookie", cr.cookie).send({ courseId })).status).toBe(409);
    expect((await api().post(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories`).send({ name: "Student notes" })).status).toBe(401);
    expect((await api().post(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories`).set("Cookie", student.cookie).send({ name: "Student notes" })).status).toBe(403);
    expect((await api().post(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories`).set("Cookie", cr.cookie).send({ name: "x" })).status).toBe(400);
    const category = await api().post(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories`).set("Cookie", cr.cookie).send({ name: "Student notes" });
    expect(category.status).toBe(201);
    categoryId = category.body.data.id as string;
    expect((await api().post(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories`).set("Cookie", cr.cookie).send({ name: "Student notes" })).status).toBe(409);
    expect((await api().patch(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories/${categoryId}`).set("Cookie", cr.cookie).send({ name: "Class notes" })).status).toBe(200);
    expect((await api().patch(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories/${categoryId}`).set("Cookie", cr.cookie).send({ name: "Student notes" })).status).toBe(200);
    expect((await api().patch(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories/${categoryId}`).set("Cookie", otherCr.cookie).send({ name: "Changed" })).status).toBe(403);
    expect((await api().post(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories`).set("Cookie", cr.cookie).send({ name: "Sir's slides" })).status).toBe(400);
    const systemCategory = await prisma.category.create({ data: { semesterCourseId, name: `System ${runId}`, createdById: cr.userId, isSystem: true } });
    expect((await api().patch(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories/${systemCategory.id}`).set("Cookie", cr.cookie).send({ name: "Changed" })).status).toBe(409);
    expect((await api().delete(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories/${systemCategory.id}`).set("Cookie", cr.cookie)).status).toBe(409);
    await prisma.category.delete({ where: { id: systemCategory.id } });
    const file = await createResource({ uploaderId: student.userId, uploaderType: "STUDENT", collegeId, departmentId, sessionId, courseId, semesterCourseId, categoryId });
    expect((await api().delete(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories/${categoryId}`).set("Cookie", cr.cookie)).status).toBe(409);
    expect((await api().delete(`/api/v1/semesters/semester-courses/${semesterCourseId}`).set("Cookie", cr.cookie)).status).toBe(409);
    expect((await api().get(`/api/v1/semesters/${semesterId}`).set("Cookie", student.cookie)).body.data.courses[0].categories[0].fileCount).toBe(1);
    await prisma.resource.update({ where: { id: file.id }, data: { state: "DELETED", categoryId: null, semesterCourseId: null } });
    expect((await api().delete(`/api/v1/semesters/semester-courses/${semesterCourseId}/categories/${categoryId}`).set("Cookie", cr.cookie)).status).toBe(200);
    expect((await api().delete(`/api/v1/semesters/semester-courses/${semesterCourseId}`).set("Cookie", cr.cookie)).status).toBe(200);
  });

  it("allows an in-scope CR to delete student files but never teacher or out-of-scope files", async () => {
    expect((await api().delete("/api/v1/resources/00000000-0000-4000-8000-000000000001")).status).toBe(401);
    const studentFile = await createResource({ uploaderId: student.userId, uploaderType: "STUDENT", collegeId, departmentId, sessionId, courseId });
    expect((await api().delete(`/api/v1/resources/${studentFile.id}`).set("Cookie", student.cookie)).status).toBe(403);
    const deleted = await api().delete(`/api/v1/resources/${studentFile.id}`).set("Cookie", cr.cookie);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data.state).toBe("DELETED");
    const teacherFile = await createResource({ uploaderId: teacher.userId, uploaderType: "TEACHER", collegeId, departmentId, sessionId: null, courseId });
    expect((await api().delete(`/api/v1/resources/${teacherFile.id}`).set("Cookie", cr.cookie)).status).toBe(403);
    const outOfScope = await createResource({ uploaderId: student.userId, uploaderType: "STUDENT", collegeId, departmentId, sessionId: otherSessionId, courseId });
    expect((await api().delete(`/api/v1/resources/${outOfScope.id}`).set("Cookie", cr.cookie)).status).toBe(403);
    const otherDept = await createResource({ uploaderId: student.userId, uploaderType: "STUDENT", collegeId, departmentId: otherDepartmentId, sessionId: otherDepartmentSessionId, courseId: otherCourseId });
    expect((await api().delete(`/api/v1/resources/${otherDept.id}`).set("Cookie", cr.cookie)).status).toBe(403);
  });
});
