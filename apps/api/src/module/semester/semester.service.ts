import { isClassRepresentative, isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
  AddSemesterCourseInput,
  CreateCategoryInput,
  CreateSemesterInput,
  UpdateCategoryInput,
  UpdateSemesterCourseInput,
  UpdateSemesterInput,
} from "./semester.validation.js";

const scopeError = () => AppError.forbidden("This action is outside your CR college, department and session", "SEMESTER_SCOPE_FORBIDDEN");
const semesterNotFound = () => AppError.notFound("Semester not found", "SEMESTER_NOT_FOUND");

const findCrProfile = (auth: AuthUser) => {
  if (auth.profile?.kind !== "student" || auth.profile.verificationStatus !== "ACTIVE" || !isClassRepresentative(auth.roles)) {
    throw AppError.forbidden("Only an active CR or Co-CR can manage semesters", "FORBIDDEN_ROLE");
  }
  return auth.profile;
};

const assertCrScope = (auth: AuthUser, scope: { collegeId: string; departmentId: string; sessionId: string }) => {
  const profile = findCrProfile(auth);
  const matchingRole = auth.roles.some((role) =>
    (role.role === "CR" || role.role === "CO_CR") && role.collegeId === scope.collegeId &&
    role.departmentId === scope.departmentId && role.sessionId === scope.sessionId,
  );
  if (!matchingRole || profile.collegeId !== scope.collegeId || profile.departmentId !== scope.departmentId || profile.sessionId !== scope.sessionId) {
    throw scopeError();
  }
};

const assertCanRead = async (auth: AuthUser, semester: { id: string; collegeId: string; departmentId: string; sessionId: string }) => {
  if (isPlatformAdmin(auth.roles)) return;
  if (auth.profile?.kind === "student") {
    if (auth.profile.collegeId === semester.collegeId && auth.profile.departmentId === semester.departmentId && auth.profile.sessionId === semester.sessionId) return;
  }
  if (auth.profile?.kind === "teacher" && auth.profile.collegeId === semester.collegeId && auth.profile.departmentIds.includes(semester.departmentId)) {
    const assigned = await prisma.semesterCourse.count({ where: { semesterId: semester.id, teacherProfileId: auth.profile.id } });
    if (assigned > 0) return;
  }
  if (auth.roles.some((role) => role.role === "SUB_ADMIN" && role.collegeId === semester.collegeId)) return;
  throw AppError.forbidden("You cannot read this semester", "SEMESTER_READ_FORBIDDEN");
};

const handleUniqueConflict = (error: unknown, message: string, code: string): never => {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw AppError.conflict(message, code);
  }
  throw error;
};

const semesterSelect = {
  id: true,
  name: true,
  collegeId: true,
  departmentId: true,
  sessionId: true,
  collegeDepartment: { select: { college: { select: { name: true } }, department: { select: { name: true } } } },
  session: { select: { name: true } },
  _count: { select: { courses: true } },
} as const;

const semesterDetailInclude = {
  collegeDepartment: { select: { college: { select: { name: true } }, department: { select: { name: true } } } },
  session: { select: { name: true } },
  courses: {
    orderBy: { createdAt: "asc" as const },
    include: {
      course: { select: { id: true, name: true } },
      teacherProfile: { select: { user: { select: { name: true } } } },
      categories: {
        orderBy: { name: "asc" as const },
        include: { _count: { select: { resources: true } } },
      },
      _count: { select: { resources: true } },
    },
  },
} as const;

type SemesterDetailRow = Prisma.SemesterGetPayload<{ include: typeof semesterDetailInclude }>;

const toSemesterDetail = (row: SemesterDetailRow | null) => {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    college: row.collegeDepartment.college.name,
    department: row.collegeDepartment.department.name,
    session: row.session.name,
    courses: row.courses.map((entry) => ({
      id: entry.id,
      courseId: entry.course.id,
      name: entry.name ?? entry.course.name,
      teacherProfileId: entry.teacherProfileId,
      teacherName: entry.teacherProfile?.user.name ?? null,
      fileCount: entry._count.resources,
      categories: entry.categories.map((category) => ({
        id: category.id,
        name: category.name,
        isSystem: category.isSystem,
        fileCount: category._count.resources,
      })),
    })),
  };
};

export const listSemesters = async (auth: AuthUser) => {
  if (isPlatformAdmin(auth.roles)) {
    return prisma.semester.findMany({ orderBy: [{ session: { name: "asc" } }, { name: "asc" }], select: semesterSelect });
  }
  if (auth.profile?.kind === "student") {
    return prisma.semester.findMany({
      where: { collegeId: auth.profile.collegeId, departmentId: auth.profile.departmentId, sessionId: auth.profile.sessionId },
      orderBy: { name: "asc" }, select: semesterSelect,
    });
  }
  if (auth.profile?.kind === "teacher") {
    return prisma.semester.findMany({
      where: { collegeId: auth.profile.collegeId, departmentId: { in: auth.profile.departmentIds }, courses: { some: { teacherProfileId: auth.profile.id } } },
      orderBy: [{ session: { name: "asc" } }, { name: "asc" }], select: semesterSelect,
    });
  }
  const collegeIds = auth.roles.filter((role) => role.role === "SUB_ADMIN" && role.collegeId).map((role) => role.collegeId as string);
  return prisma.semester.findMany({ where: { collegeId: { in: collegeIds } }, orderBy: [{ session: { name: "asc" } }, { name: "asc" }], select: semesterSelect });
};

export const createSemester = async (auth: AuthUser, input: CreateSemesterInput) => {
  const profile = findCrProfile(auth);
  assertCrScope(auth, { collegeId: profile.collegeId, departmentId: profile.departmentId, sessionId: profile.sessionId });
  const session = await prisma.session.findFirst({
    where: { id: profile.sessionId, departmentId: profile.departmentId, isActive: true },
    select: { id: true },
  });
  if (!session) throw AppError.badRequest("Choose an active session in your department", "INVALID_SESSION");
  try {
    return await prisma.semester.create({
      data: { collegeId: profile.collegeId, departmentId: profile.departmentId, sessionId: profile.sessionId, name: input.name, createdById: auth.userId },
      select: semesterSelect,
    });
  } catch (error) {
    handleUniqueConflict(error, "A semester with this name already exists in your batch", "SEMESTER_NAME_TAKEN");
  }
};

export const getSemester = async (auth: AuthUser, id: string) => {
  const semester = await prisma.semester.findUnique({ where: { id }, select: { id: true, collegeId: true, departmentId: true, sessionId: true } });
  if (!semester) throw semesterNotFound();
  await assertCanRead(auth, semester);
  return toSemesterDetail(await prisma.semester.findUnique({ where: { id }, include: semesterDetailInclude }));
};

export const updateSemester = async (auth: AuthUser, id: string, input: UpdateSemesterInput) => {
  const semester = await prisma.semester.findUnique({ where: { id }, select: { id: true, collegeId: true, departmentId: true, sessionId: true } });
  if (!semester) throw semesterNotFound();
  assertCrScope(auth, semester);
  try {
    return await prisma.semester.update({ where: { id }, data: { name: input.name }, select: semesterSelect });
  } catch (error) {
    handleUniqueConflict(error, "A semester with this name already exists in your batch", "SEMESTER_NAME_TAKEN");
  }
};

export const deleteSemester = async (auth: AuthUser, id: string) => {
  const semester = await getSemesterForCr(auth, id);
  const deleted = await prisma.semester.deleteMany({ where: { id, courses: { none: {} } } });
  if (deleted.count === 0) {
    const stillExists = await prisma.semester.findUnique({ where: { id }, select: { id: true } });
    if (!stillExists) throw semesterNotFound();
    throw AppError.conflict("Only an empty semester can be removed. Remove its courses first.", "SEMESTER_NOT_EMPTY");
  }
  return { id: semester.id };
};

const getSemesterForCr = async (auth: AuthUser, id: string) => {
  const row = await prisma.semester.findUnique({ where: { id }, select: { id: true, collegeId: true, departmentId: true, sessionId: true } });
  if (!row) throw semesterNotFound();
  assertCrScope(auth, row);
  return row;
};

const validateTeacher = async (teacherProfileId: string | null | undefined, collegeId: string, departmentId: string) => {
  if (!teacherProfileId) return null;
  const teacher = await prisma.teacherProfile.findFirst({
    where: { id: teacherProfileId, collegeId, verificationStatus: "ACTIVE", teacherDepartments: { some: { departmentId } } },
    select: { id: true },
  });
  if (!teacher) throw AppError.badRequest("Choose a verified teacher assigned to this department", "INVALID_TEACHER");
  return teacher.id;
};

export const addSemesterCourse = async (auth: AuthUser, semesterId: string, input: AddSemesterCourseInput) => {
  const semester = await getSemesterForCr(auth, semesterId);
  let courseId = input.courseId;
  if (input.courseName) {
    const duplicate = await prisma.course.findFirst({ where: { departmentId: semester.departmentId, name: { equals: input.courseName, mode: "insensitive" } }, select: { id: true } });
    if (duplicate) throw AppError.conflict("This department already has a course with that name", "COURSE_NAME_TAKEN");
    const course = await prisma.course.create({ data: { departmentId: semester.departmentId, name: input.courseName, semester: input.semesterNumber }, select: { id: true } });
    courseId = course.id;
  }
  const course = await prisma.course.findFirst({ where: { id: courseId, departmentId: semester.departmentId, isActive: true }, select: { id: true } });
  if (!course) throw AppError.badRequest("Choose an active course from your department", "INVALID_COURSE");
  const teacherProfileId = await validateTeacher(input.teacherProfileId, semester.collegeId, semester.departmentId);
  try {
    return await prisma.semesterCourse.create({
      data: { semesterId, courseId: course.id, teacherProfileId },
      include: { course: { select: { name: true } }, teacherProfile: { select: { user: { select: { name: true } } } } },
    });
  } catch (error) {
    handleUniqueConflict(error, "This course is already in the semester", "SEMESTER_COURSE_EXISTS");
  }
};

export const updateSemesterCourse = async (auth: AuthUser, id: string, input: UpdateSemesterCourseInput) => {
  const entry = await prisma.semesterCourse.findUnique({ where: { id }, include: { semester: { select: { collegeId: true, departmentId: true, sessionId: true } } } });
  if (!entry) throw AppError.notFound("Semester course not found", "SEMESTER_COURSE_NOT_FOUND");
  assertCrScope(auth, entry.semester);
  const teacherProfileId = input.teacherProfileId === undefined ? undefined : await validateTeacher(input.teacherProfileId, entry.semester.collegeId, entry.semester.departmentId);
  try {
    return await prisma.semesterCourse.update({
      where: { id }, data: { name: input.courseName, teacherProfileId },
      include: { course: { select: { name: true } }, teacherProfile: { select: { user: { select: { name: true } } } } },
    });
  } catch (error) {
    throw error;
  }
};

export const deleteSemesterCourse = async (auth: AuthUser, id: string) => {
  const entry = await prisma.semesterCourse.findUnique({ where: { id }, include: { semester: { select: { collegeId: true, departmentId: true, sessionId: true } } } });
  if (!entry) throw AppError.notFound("Semester course not found", "SEMESTER_COURSE_NOT_FOUND");
  assertCrScope(auth, entry.semester);
  const activeFiles = await prisma.resource.count({ where: { semesterCourseId: id, state: { not: "DELETED" } } });
  if (activeFiles > 0) throw AppError.conflict("Only a course with no files can be removed", "SEMESTER_COURSE_HAS_FILES");
  await prisma.resource.updateMany({ where: { semesterCourseId: id }, data: { semesterCourseId: null, categoryId: null } });
  await prisma.category.deleteMany({ where: { semesterCourseId: id } });
  await prisma.semesterCourse.delete({ where: { id } });
  return { id };
};

export const createCategory = async (auth: AuthUser, semesterCourseId: string, input: CreateCategoryInput) => {
  const entry = await prisma.semesterCourse.findUnique({ where: { id: semesterCourseId }, include: { semester: { select: { collegeId: true, departmentId: true, sessionId: true } } } });
  if (!entry) throw AppError.notFound("Semester course not found", "SEMESTER_COURSE_NOT_FOUND");
  assertCrScope(auth, entry.semester);
  if (input.name.toLowerCase() === "sir's slides") throw AppError.badRequest("Sir's slides is a virtual system category", "SYSTEM_CATEGORY");
  try {
    return await prisma.category.create({ data: { semesterCourseId, name: input.name, createdById: auth.userId } });
  } catch (error) {
    handleUniqueConflict(error, "This category already exists in the course", "CATEGORY_NAME_TAKEN");
  }
};

const getCategoryForCr = async (auth: AuthUser, semesterCourseId: string, categoryId: string) => {
  const category = await prisma.category.findFirst({ where: { id: categoryId, semesterCourseId }, include: { semesterCourse: { include: { semester: { select: { collegeId: true, departmentId: true, sessionId: true } } } } } });
  if (!category) throw AppError.notFound("Category not found", "CATEGORY_NOT_FOUND");
  assertCrScope(auth, category.semesterCourse.semester);
  if (category.isSystem) throw AppError.conflict("The system category cannot be renamed or removed", "SYSTEM_CATEGORY");
  return category;
};

export const updateCategory = async (auth: AuthUser, semesterCourseId: string, categoryId: string, input: UpdateCategoryInput) => {
  await getCategoryForCr(auth, semesterCourseId, categoryId);
  try {
    return await prisma.category.update({ where: { id: categoryId }, data: { name: input.name } });
  } catch (error) {
    handleUniqueConflict(error, "This category already exists in the course", "CATEGORY_NAME_TAKEN");
  }
};

export const deleteCategory = async (auth: AuthUser, semesterCourseId: string, categoryId: string) => {
  await getCategoryForCr(auth, semesterCourseId, categoryId);
  const activeFiles = await prisma.resource.count({ where: { categoryId, state: { not: "DELETED" } } });
  if (activeFiles > 0) throw AppError.conflict("Only an empty category can be removed. Delete its files first.", "CATEGORY_HAS_FILES");
  await prisma.resource.updateMany({ where: { categoryId }, data: { categoryId: null } });
  await prisma.category.delete({ where: { id: categoryId } });
  return { id: categoryId };
};
