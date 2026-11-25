import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { CourseListQuery, CourseView } from "./course.interface.js";
import type { CreateCourseInput, UpdateCourseInput } from "./course.validation.js";

const courseSelect = {
  id: true,
  name: true,
  description: true,
  semester: true,
  isActive: true,
  createdAt: true,
  departmentId: true,
  department: { select: { name: true } },
  _count: { select: { resources: true, folders: true } },
} as const;

interface CourseRow {
  id: string;
  name: string;
  description: string | null;
  semester: number | null;
  isActive: boolean;
  createdAt: Date;
  departmentId: string;
  department: { name: string };
  _count: { resources: number; folders: number };
}

const toView = (row: CourseRow): CourseView => ({
  id: row.id,
  name: row.name,
  description: row.description,
  semester: row.semester,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  departmentId: row.departmentId,
  departmentName: row.department.name,
  resourceCount: row._count.resources,
  folderCount: row._count.folders,
});

/**
 * S2-B4 — `GET /courses`.
 * Public callers see active courses; `?status=all` is Platform Admin only.
 */
export const listCourses = async (query: CourseListQuery, auth?: AuthUser): Promise<CourseView[]> => {
  if (query.status === "all" && !(auth && isPlatformAdmin(auth.roles))) {
    throw AppError.forbidden("Only a Platform Admin can include deactivated courses", "FORBIDDEN_ROLE");
  }

  const courses = await prisma.course.findMany({
    where: {
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.semester ? { semester: query.semester } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ semester: "asc" }, { name: "asc" }],
    select: courseSelect,
  });

  return courses.map(toView);
};

/** S2-B4 — `GET /courses/:id`. */
export const getCourse = async (courseId: string): Promise<CourseView> => {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: courseSelect });

  if (!course) {
    throw AppError.notFound("Course not found", "COURSE_NOT_FOUND");
  }

  return toView(course);
};

/** S2-B4 — `POST /courses`. */
export const createCourse = async (input: CreateCourseInput): Promise<CourseView> => {
  const department = await prisma.department.findUnique({
    where: { id: input.departmentId },
    select: { id: true, isActive: true },
  });

  if (!department) {
    throw AppError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
  }

  if (!department.isActive) {
    throw AppError.badRequest("This department is deactivated", "DEPARTMENT_INACTIVE");
  }

  const existing = await prisma.course.findFirst({
    where: { departmentId: input.departmentId, name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict("This department already has a course with that name", "COURSE_NAME_TAKEN");
  }

  const created = await prisma.course.create({
    data: {
      departmentId: input.departmentId,
      name: input.name,
      description: input.description,
      semester: input.semester,
    },
    select: courseSelect,
  });

  return toView(created);
};

/** S2-B4 — `PATCH /courses/:id` (rename / description / semester / re-activate). */
export const updateCourse = async (courseId: string, input: UpdateCourseInput): Promise<CourseView> => {
  const current = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, departmentId: true },
  });

  if (!current) {
    throw AppError.notFound("Course not found", "COURSE_NOT_FOUND");
  }

  if (input.name) {
    const duplicate = await prisma.course.findFirst({
      where: {
        departmentId: current.departmentId,
        name: { equals: input.name, mode: "insensitive" },
        id: { not: courseId },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw AppError.conflict("This department already has a course with that name", "COURSE_NAME_TAKEN");
    }
  }

  const updated = await prisma.course.update({
    where: { id: courseId },
    data: {
      name: input.name,
      description: input.description,
      semester: input.semester,
      isActive: input.isActive,
    },
    select: courseSelect,
  });

  return toView(updated);
};

/**
 * S2-B4 — `DELETE /courses/:id` (soft delete).
 * Resources keep their course; uploads stop offering it.
 */
export const deactivateCourse = async (courseId: string): Promise<CourseView> => {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });

  if (!course) {
    throw AppError.notFound("Course not found", "COURSE_NOT_FOUND");
  }

  const updated = await prisma.course.update({
    where: { id: courseId },
    data: { isActive: false },
    select: courseSelect,
  });

  return toView(updated);
};
