import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
  DepartmentDetailResponse,
  DepartmentListQuery,
  DepartmentSessionsResponse,
  DepartmentView,
} from "./department.interface.js";
import type { CreateDepartmentInput, UpdateDepartmentInput } from "./department.validation.js";

const departmentSelect = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  _count: {
    select: { colleges: true, sessions: true, courses: true, studentProfiles: true },
  },
} as const;

interface DepartmentRow {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  _count: { colleges: number; sessions: number; courses: number; studentProfiles: number };
}

const toView = (row: DepartmentRow): DepartmentView => ({
  id: row.id,
  name: row.name,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  collegeCount: row._count.colleges,
  sessionCount: row._count.sessions,
  courseCount: row._count.courses,
  studentCount: row._count.studentProfiles,
});

/**
 * S2-B1 — `GET /departments`.
 * Public: active departments (optionally the ones a college adopted).
 * `?status=all` is the Platform Admin directory (A.4).
 */
export const listDepartments = async (query: DepartmentListQuery, auth?: AuthUser): Promise<DepartmentView[]> => {
  if (query.status === "all" && !(auth && isPlatformAdmin(auth.roles))) {
    throw AppError.forbidden("Only a Platform Admin can include deactivated departments", "FORBIDDEN_ROLE");
  }

  const departments = await prisma.department.findMany({
    where: {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
      ...(query.collegeId
        ? { colleges: { some: { collegeId: query.collegeId, college: { isActive: true } } } }
        : {}),
    },
    orderBy: { name: "asc" },
    select: departmentSelect,
  });

  return departments.map(toView);
};

/** S2-B1 — `GET /departments/:id` (which colleges adopted it + counts). */
export const getDepartment = async (departmentId: string): Promise<DepartmentDetailResponse> => {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      ...departmentSelect,
      colleges: {
        orderBy: { college: { name: "asc" } },
        select: { adoptedAt: true, college: { select: { id: true, name: true, isActive: true } } },
      },
    },
  });

  if (!department) {
    throw AppError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
  }

  return {
    department: toView(department),
    colleges: department.colleges.map((link) => ({
      id: link.college.id,
      name: link.college.name,
      isActive: link.college.isActive,
      adoptedAt: link.adoptedAt.toISOString(),
    })),
  };
};

/** S2-B1 — `POST /departments` (departments are global, adopted per college). */
export const createDepartment = async (input: CreateDepartmentInput): Promise<DepartmentView> => {
  const existing = await prisma.department.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict("A department with this name already exists", "DEPARTMENT_NAME_TAKEN");
  }

  const department = await prisma.department.create({ data: { name: input.name }, select: departmentSelect });

  return toView(department);
};

/** S2-B1 — `PATCH /departments/:id` (rename / re-activate). */
export const updateDepartment = async (
  departmentId: string,
  input: UpdateDepartmentInput,
): Promise<DepartmentView> => {
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });

  if (!department) {
    throw AppError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
  }

  if (input.name) {
    const duplicate = await prisma.department.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, id: { not: departmentId } },
      select: { id: true },
    });

    if (duplicate) {
      throw AppError.conflict("A department with this name already exists", "DEPARTMENT_NAME_TAKEN");
    }
  }

  const updated = await prisma.department.update({
    where: { id: departmentId },
    data: { name: input.name, isActive: input.isActive },
    select: departmentSelect,
  });

  return toView(updated);
};

/**
 * S2-B1 — `DELETE /departments/:id`.
 * Soft delete: sessions/courses/profiles stay, but registration stops using it.
 */
export const deactivateDepartment = async (departmentId: string): Promise<DepartmentView> => {
  const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });

  if (!department) {
    throw AppError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
  }

  const updated = await prisma.department.update({
    where: { id: departmentId },
    data: { isActive: false },
    select: departmentSelect,
  });

  return toView(updated);
};

/** S1-B13 — active sessions of a department, for the register form. */
export const listSessionsOfDepartment = async (departmentId: string): Promise<DepartmentSessionsResponse> => {
  const department = await prisma.department.findFirst({
    where: { id: departmentId, isActive: true },
    select: { id: true, name: true },
  });

  if (!department) {
    throw AppError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
  }

  const sessions = await prisma.session.findMany({
    where: { departmentId, isActive: true },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  return {
    department,
    sessions: sessions.map((session) => ({
      id: session.id,
      name: session.name,
      startDate: session.startDate ? session.startDate.toISOString().slice(0, 10) : null,
      endDate: session.endDate ? session.endDate.toISOString().slice(0, 10) : null,
    })),
  };
};

