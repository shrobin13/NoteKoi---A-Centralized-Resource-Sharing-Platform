import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { SessionListQuery, SessionView } from "./session.interface.js";
import type { CreateSessionInput, UpdateSessionInput } from "./session.validation.js";

const sessionSelect = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  isActive: true,
  createdAt: true,
  departmentId: true,
  department: { select: { name: true } },
  _count: { select: { studentProfiles: true } },
} as const;

interface SessionRow {
  id: string;
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  departmentId: string;
  department: { name: string };
  _count: { studentProfiles: number };
}

const toDateOnly = (value: Date | null): string | null => (value ? value.toISOString().slice(0, 10) : null);

const toView = (row: SessionRow): SessionView => ({
  id: row.id,
  name: row.name,
  startDate: toDateOnly(row.startDate),
  endDate: toDateOnly(row.endDate),
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  departmentId: row.departmentId,
  departmentName: row.department.name,
  studentCount: row._count.studentProfiles,
});

/** `YYYY-MM-DD` -> UTC midnight (the column is `@db.Date`). */
const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

const assertOrder = (startDate: Date | null, endDate: Date | null): void => {
  if (startDate && endDate && startDate > endDate) {
    throw AppError.badRequest("The end date must be on or after the start date", "INVALID_SESSION_DATES");
  }
};

/**
 * S2-B3 — `GET /sessions`.
 * Public callers see active sessions; `?status=all` is Platform Admin only.
 */
export const listSessions = async (query: SessionListQuery, auth?: AuthUser): Promise<SessionView[]> => {
  if (query.status === "all" && !(auth && isPlatformAdmin(auth.roles))) {
    throw AppError.forbidden("Only a Platform Admin can include deactivated sessions", "FORBIDDEN_ROLE");
  }

  const sessions = await prisma.session.findMany({
    where: {
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.status === "active" ? { isActive: true } : {}),
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    select: sessionSelect,
  });

  return sessions.map(toView);
};

/** S2-B3 — `GET /sessions/:id`. */
export const getSession = async (sessionId: string): Promise<SessionView> => {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: sessionSelect });

  if (!session) {
    throw AppError.notFound("Session not found", "SESSION_NOT_FOUND");
  }

  return toView(session);
};

/** S2-B3 — `POST /sessions` (a session belongs to exactly one department). */
export const createSession = async (input: CreateSessionInput): Promise<SessionView> => {
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

  const existing = await prisma.session.findFirst({
    where: { departmentId: input.departmentId, name: { equals: input.name, mode: "insensitive" } },
    select: { id: true },
  });

  if (existing) {
    throw AppError.conflict("This department already has a session with that name", "SESSION_NAME_TAKEN");
  }

  const startDate = toDate(input.startDate);
  const endDate = toDate(input.endDate);

  assertOrder(startDate, endDate);

  const created = await prisma.session.create({
    data: { departmentId: input.departmentId, name: input.name, startDate, endDate },
    select: sessionSelect,
  });

  return toView(created);
};

/** S2-B3 — `PATCH /sessions/:id`. */
export const updateSession = async (sessionId: string, input: UpdateSessionInput): Promise<SessionView> => {
  const current = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, departmentId: true, startDate: true, endDate: true },
  });

  if (!current) {
    throw AppError.notFound("Session not found", "SESSION_NOT_FOUND");
  }

  if (input.name) {
    const duplicate = await prisma.session.findFirst({
      where: {
        departmentId: current.departmentId,
        name: { equals: input.name, mode: "insensitive" },
        id: { not: sessionId },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw AppError.conflict("This department already has a session with that name", "SESSION_NAME_TAKEN");
    }
  }

  const startDate = input.startDate === undefined ? current.startDate : toDate(input.startDate);
  const endDate = input.endDate === undefined ? current.endDate : toDate(input.endDate);

  assertOrder(startDate, endDate);

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: {
      name: input.name,
      isActive: input.isActive,
      startDate: input.startDate === undefined ? undefined : startDate,
      endDate: input.endDate === undefined ? undefined : endDate,
    },
    select: sessionSelect,
  });

  return toView(updated);
};

/**
 * S2-B3 — `DELETE /sessions/:id` (soft delete).
 * Existing profiles keep their session; registration stops offering it.
 */
export const deactivateSession = async (sessionId: string): Promise<SessionView> => {
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } });

  if (!session) {
    throw AppError.notFound("Session not found", "SESSION_NOT_FOUND");
  }

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { isActive: false },
    select: sessionSelect,
  });

  return toView(updated);
};
