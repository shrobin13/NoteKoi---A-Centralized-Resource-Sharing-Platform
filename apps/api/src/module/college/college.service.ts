import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
  CollegeDepartmentsResponse,
  CollegeDetailResponse,
  CollegeListQuery,
  CollegeView,
} from "./college.interface.js";
import type { CreateCollegeInput, UpdateCollegeInput } from "./college.validation.js";

const collegeSelect = {
  id: true,
  name: true,
  isActive: true,
  createdAt: true,
  _count: { select: { departments: true, studentProfiles: true } },
} as const;

interface CollegeRow {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  _count: { departments: number; studentProfiles: number };
}

const toView = (row: CollegeRow): CollegeView => ({
  id: row.id,
  name: row.name,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  departmentCount: row._count.departments,
  studentCount: row._count.studentProfiles,
});

/** `?status=all` exposes deactivated rows, so only a Platform Admin may ask for them (A.4). */
const assertDirectoryViewer = (auth: AuthUser | undefined): void => {
  if (!auth || !isPlatformAdmin(auth.roles)) {
    throw AppError.forbidden("Only a Platform Admin can include deactivated colleges", "FORBIDDEN_ROLE");
  }
};

/**
 * S2-B2 — `GET /colleges`.
 * Public callers see active colleges only; `?status=all` is the admin directory.
 */
export const listColleges = async (query: CollegeListQuery, auth?: AuthUser): Promise<CollegeView[]> => {
  if (query.status === "all") assertDirectoryViewer(auth);

  const colleges = await prisma.college.findMany({
    where: {
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    },
    orderBy: { name: "asc" },
    select: collegeSelect,
  });

  return colleges.map(toView);
};

/** S2-B2 — `GET /colleges/:id` (adopted departments + member counts). */
export const getCollege = async (collegeId: string): Promise<CollegeDetailResponse> => {
  const college = await prisma.college.findUnique({
    where: { id: collegeId },
    select: {
      ...collegeSelect,
      departments: {
        orderBy: { department: { name: "asc" } },
        select: { adoptedAt: true, department: { select: { id: true, name: true, isActive: true } } },
      },
    },
  });

  if (!college) {
    throw AppError.notFound("College not found", "COLLEGE_NOT_FOUND");
  }

  const teacherCount = await prisma.teacherProfile.count({ where: { collegeId } });

  return {
    college: toView(college),
    departments: college.departments.map((link) => ({
      id: link.department.id,
      name: link.department.name,
      isActive: link.department.isActive,
      adoptedAt: link.adoptedAt.toISOString(),
    })),
    counts: { students: college._count.studentProfiles, teachers: teacherCount },
  };
};

/** S2-B2 — `POST /colleges`. */
export const createCollege = async (input: CreateCollegeInput): Promise<CollegeView> => {
  const existing = await prisma.college.findFirst({
    where: { name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict("A college with this name already exists", "COLLEGE_NAME_TAKEN");
  }

  const college = await prisma.college.create({ data: { name: input.name }, select: collegeSelect });

  return toView(college);
};

/** S2-B2 — `PATCH /colleges/:id` (rename / re-activate). */
export const updateCollege = async (collegeId: string, input: UpdateCollegeInput): Promise<CollegeView> => {
  const college = await prisma.college.findUnique({ where: { id: collegeId }, select: { id: true } });

  if (!college) {
    throw AppError.notFound("College not found", "COLLEGE_NOT_FOUND");
  }

  if (input.name) {
    const duplicate = await prisma.college.findFirst({
      where: { name: { equals: input.name, mode: "insensitive" }, id: { not: collegeId } },
      select: { id: true },
    });

    if (duplicate) {
      throw AppError.conflict("A college with this name already exists", "COLLEGE_NAME_TAKEN");
    }
  }

  const updated = await prisma.college.update({
    where: { id: collegeId },
    data: { name: input.name, isActive: input.isActive },
    select: collegeSelect,
  });

  return toView(updated);
};

/**
 * S2-B2 — `DELETE /colleges/:id`.
 * Soft delete only: profiles, roles and resources keep pointing at the row.
 */
export const deactivateCollege = async (collegeId: string): Promise<CollegeView> => {
  const college = await prisma.college.findUnique({ where: { id: collegeId }, select: { id: true } });

  if (!college) {
    throw AppError.notFound("College not found", "COLLEGE_NOT_FOUND");
  }

  const updated = await prisma.college.update({
    where: { id: collegeId },
    data: { isActive: false },
    select: collegeSelect,
  });

  return toView(updated);
};

/** S2-B2 — `POST /colleges/:id/departments` (adopt a department, Q6). */
export const adoptDepartment = async (collegeId: string, departmentId: string) => {
  const college = await prisma.college.findUnique({
    where: { id: collegeId },
    select: { id: true, isActive: true },
  });

  if (!college) {
    throw AppError.notFound("College not found", "COLLEGE_NOT_FOUND");
  }

  if (!college.isActive) {
    throw AppError.badRequest("This college is deactivated", "COLLEGE_INACTIVE");
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, name: true, isActive: true },
  });

  if (!department) {
    throw AppError.notFound("Department not found", "DEPARTMENT_NOT_FOUND");
  }

  if (!department.isActive) {
    throw AppError.badRequest("This department is deactivated", "DEPARTMENT_INACTIVE");
  }

  const existing = await prisma.collegeDepartment.findUnique({
    where: { unique_college_department: { collegeId, departmentId } },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict("This college already offers that department", "DEPARTMENT_ALREADY_ADOPTED");
  }

  const link = await prisma.collegeDepartment.create({
    data: { collegeId, departmentId },
    select: { adoptedAt: true, department: { select: { id: true, name: true, isActive: true } } },
  });

  return {
    id: link.department.id,
    name: link.department.name,
    isActive: link.department.isActive,
    adoptedAt: link.adoptedAt.toISOString(),
  };
};

/**
 * S2-B2 — `DELETE /colleges/:id/departments/:departmentId`.
 * Refuses while student profiles or resources still reference the pair (data-loss guard).
 */
export const dropDepartment = async (collegeId: string, departmentId: string): Promise<{ departmentId: string }> => {
  const link = await prisma.collegeDepartment.findUnique({
    where: { unique_college_department: { collegeId, departmentId } },
    select: { id: true },
  });

  if (!link) {
    throw AppError.notFound("This college does not offer that department", "COLLEGE_DEPARTMENT_NOT_FOUND");
  }

  const [students, resources] = await Promise.all([
    prisma.studentProfile.count({ where: { collegeId, departmentId } }),
    prisma.resource.count({ where: { collegeDepartment: { collegeId, departmentId } } }),
  ]);

  if (students > 0 || resources > 0) {
    throw new AppError(
      409,
      "Students or resources still belong to this college and department. Deactivate the department instead.",
      "COLLEGE_DEPARTMENT_IN_USE",
      [{ students, resources }],
    );
  }

  await prisma.collegeDepartment.delete({ where: { id: link.id } });

  return { departmentId };
};

/**
 * S1-B13 — public lookups that feed the register form. Read-only, active rows only.
 */
export const listDepartmentsOfCollege = async (collegeId: string): Promise<CollegeDepartmentsResponse> => {
  const college = await prisma.college.findFirst({
    where: { id: collegeId, isActive: true },
    select: { id: true, name: true },
  });

  if (!college) {
    throw AppError.notFound("College not found", "COLLEGE_NOT_FOUND");
  }

  const links = await prisma.collegeDepartment.findMany({
    where: { collegeId, department: { isActive: true } },
    orderBy: { department: { name: "asc" } },
    select: { adoptedAt: true, department: { select: { id: true, name: true } } },
  });

  return {
    college,
    departments: links.map((link) => ({
      id: link.department.id,
      name: link.department.name,
      adoptedAt: link.adoptedAt.toISOString(),
    })),
  };
};
