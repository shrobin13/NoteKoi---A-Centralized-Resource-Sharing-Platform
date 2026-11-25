import { prisma } from "../../lib/prisma.js";
import { writeAuditLog } from "../../lib/audit.js";
import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { AppError } from "../../utils/AppError.js";
import { buildMe } from "../auth/auth.service.js";
import type { EntityRef, MeResponse } from "../auth/auth.interface.js";
import type {
  AppointCrInput,
  AppointSubAdminInput,
  AssignTeacherDepartmentsInput,
  PeopleListQueryInput,
  RoleListQueryInput,
  UpdateMeInput,
  UpdateStudentProfileInput,
  VerificationListQueryInput,
} from "./user.validation.js";
import type {
  RoleAssignmentItem,
  RoleRevocationResponse,
  RoleSummary,
  StudentDirectoryItem,
  StudentVerificationItem,
  TeacherDepartmentsResponse,
  TeacherDirectoryItem,
  TeacherVerificationItem,
  VerificationDecisionResponse,
} from "./user.interface.js";

/** A CR/Co-CR appointment with a complete scope (needed to judge a batch). */
interface CrScope {
  collegeId: string;
  departmentId: string;
  sessionId: string;
}

const crScopes = (auth: AuthUser): CrScope[] =>
  auth.roles.flatMap((role) => {
    if (role.role !== "CR" && role.role !== "CO_CR") return [];
    if (!role.collegeId || !role.departmentId || !role.sessionId) return [];

    return [{ collegeId: role.collegeId, departmentId: role.departmentId, sessionId: role.sessionId }];
  });

/** Colleges where the caller is an active Sub Admin (scope COLLEGE). */
const subAdminColleges = (auth: AuthUser): string[] =>
  auth.roles.flatMap((role) => (role.role === "SUB_ADMIN" && role.collegeId ? [role.collegeId] : []));

const forbiddenScope = (what: string): AppError =>
  AppError.forbidden(`${what} is outside your scope`, "FORBIDDEN_SCOPE");

/**
 * S2-B5 — which student profiles the caller may review.
 * Platform Admin: everything (optional filters). CR/Co-CR: their batches only.
 */
const studentScopeWhere = (auth: AuthUser, query: VerificationListQueryInput) => {
  if (isPlatformAdmin(auth.roles)) {
    return {
      ...(query.collegeId ? { collegeId: query.collegeId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
    };
  }

  const scopes = crScopes(auth);

  if (scopes.length === 0) {
    throw AppError.forbidden(
      "Only a CR, Co-CR or Platform Admin can review student registrations",
      "FORBIDDEN_ROLE",
    );
  }

  const allowed = scopes.filter(
    (scope) =>
      (!query.collegeId || scope.collegeId === query.collegeId) &&
      (!query.departmentId || scope.departmentId === query.departmentId) &&
      (!query.sessionId || scope.sessionId === query.sessionId),
  );

  if (allowed.length === 0) {
    throw forbiddenScope("This batch");
  }

  return { OR: allowed.map(({ collegeId, departmentId, sessionId }) => ({ collegeId, departmentId, sessionId })) };
};

const toStudentItem = (row: {
  id: string;
  userId: string;
  regNo: string;
  verificationStatus: StudentVerificationItem["verificationStatus"];
  rejectedReason: string | null;
  createdAt: Date;
  user: { name: string; email: string; emailVerifiedAt: Date | null };
  college: EntityRef;
  department: EntityRef;
  session: EntityRef;
}): StudentVerificationItem => ({
  profileId: row.id,
  userId: row.userId,
  name: row.user.name,
  email: row.user.email,
  regNo: row.regNo,
  verificationStatus: row.verificationStatus,
  rejectedReason: row.rejectedReason,
  college: row.college,
  department: row.department,
  session: row.session,
  emailVerifiedAt: row.user.emailVerifiedAt ? row.user.emailVerifiedAt.toISOString() : null,
  registeredAt: row.createdAt.toISOString(),
});

const ensureStudentTarget = async (
  target: { collegeId: string; departmentId: string; sessionId: string; regNo: string },
  excludeProfileId: string,
): Promise<void> => {
  const college = await prisma.college.findFirst({
    where: { id: target.collegeId, isActive: true },
    select: { id: true },
  });

  if (!college) {
    throw AppError.badRequest("Select an active college", "INVALID_COLLEGE");
  }

  const link = await prisma.collegeDepartment.findUnique({
    where: { unique_college_department: { collegeId: target.collegeId, departmentId: target.departmentId } },
    select: { department: { select: { isActive: true } } },
  });

  if (!link || !link.department.isActive) {
    throw AppError.badRequest("The selected department is not offered by this college", "INVALID_DEPARTMENT");
  }

  const session = await prisma.session.findFirst({
    where: { id: target.sessionId, departmentId: target.departmentId, isActive: true },
    select: { id: true },
  });

  if (!session) {
    throw AppError.badRequest("Select an active session of the chosen department", "INVALID_SESSION");
  }

  const regNoTaken = await prisma.studentProfile.findFirst({
    where: { collegeId: target.collegeId, regNo: target.regNo, id: { not: excludeProfileId } },
    select: { id: true },
  });

  if (regNoTaken) {
    throw AppError.conflict("This registration number is already registered in your college", "REG_NO_TAKEN");
  }
};

/** S2-B5 — `GET /users/me` (same payload as `/auth/me`, refreshable after edits). */
export const getMe = async (auth: AuthUser): Promise<MeResponse> => buildMe(auth.userId);

/** S2-B5 — `PATCH /users/me`. */
export const updateMe = async (auth: AuthUser, input: UpdateMeInput): Promise<MeResponse> => {
  await prisma.user.update({ where: { id: auth.userId }, data: { name: input.name } });

  return buildMe(auth.userId);
};

/**
 * S2-B5 — `PATCH /users/me/student-profile`.
 * Correcting college/department/session/regNo sends the profile back to
 * `PENDING_VERIFICATION` so the CR has to look at it again.
 */
export const updateStudentProfile = async (
  auth: AuthUser,
  input: UpdateStudentProfileInput,
): Promise<MeResponse> => {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true, collegeId: true, departmentId: true, sessionId: true, regNo: true },
  });

  if (!profile) {
    throw AppError.notFound("Your account has no student profile", "PROFILE_NOT_FOUND");
  }

  const next = {
    collegeId: input.collegeId ?? profile.collegeId,
    departmentId: input.departmentId ?? profile.departmentId,
    sessionId: input.sessionId ?? profile.sessionId,
    regNo: input.regNo ?? profile.regNo,
  };

  const identityChanged =
    next.collegeId !== profile.collegeId ||
    next.departmentId !== profile.departmentId ||
    next.sessionId !== profile.sessionId ||
    next.regNo !== profile.regNo;

  if (identityChanged) {
    await ensureStudentTarget(next, profile.id);
  }

  await prisma.studentProfile.update({
    where: { id: profile.id },
    data: {
      ...next,
      ...(input.includeOtherColleges === undefined ? {} : { includeOtherColleges: input.includeOtherColleges }),
      ...(identityChanged
        ? {
            verificationStatus: "PENDING_VERIFICATION" as const,
            verifiedAt: null,
            verifiedById: null,
            rejectedReason: null,
            rejectedById: null,
          }
        : {}),
    },
  });

  return buildMe(auth.userId);
};

/**
 * S2-B5 — `GET /users/verification/students`.
 * CR/Co-CR see their own batches; a Platform Admin sees everything.
 */
export const listStudentVerifications = async (
  auth: AuthUser,
  query: VerificationListQueryInput,
): Promise<StudentVerificationItem[]> => {
  const rows = await prisma.studentProfile.findMany({
    where: { verificationStatus: query.status, ...studentScopeWhere(auth, query) },
    orderBy: { createdAt: "asc" },
    take: query.limit,
    select: {
      id: true,
      userId: true,
      regNo: true,
      verificationStatus: true,
      rejectedReason: true,
      createdAt: true,
      user: { select: { name: true, email: true, emailVerifiedAt: true } },
      college: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
    },
  });

  return rows.map(toStudentItem);
};

interface StudentProfileScope {
  id: string;
  userId: string;
  regNo: string;
  collegeId: string;
  departmentId: string;
  sessionId: string;
  verificationStatus: StudentVerificationItem["verificationStatus"];
}

const loadStudentProfile = async (profileId: string): Promise<StudentProfileScope> => {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      userId: true,
      regNo: true,
      collegeId: true,
      departmentId: true,
      sessionId: true,
      verificationStatus: true,
    },
  });

  if (!profile) {
    throw AppError.notFound("Student profile not found", "PROFILE_NOT_FOUND");
  }

  return profile;
};

const assertStudentScope = (auth: AuthUser, profile: StudentProfileScope): void => {
  if (isPlatformAdmin(auth.roles)) return;

  const allowed = crScopes(auth).some(
    (scope) =>
      scope.collegeId === profile.collegeId &&
      scope.departmentId === profile.departmentId &&
      scope.sessionId === profile.sessionId,
  );

  if (!allowed) {
    throw forbiddenScope("This student's batch");
  }
};

const notPending = (): AppError =>
  new AppError(409, "This registration is not waiting for verification", "INVALID_VERIFICATION_STATE");

const toDecision = (
  profileId: string,
  verificationStatus: StudentVerificationItem["verificationStatus"],
  verifiedAt: Date | null,
  rejectedReason: string | null,
): VerificationDecisionResponse => ({
  profileId,
  verificationStatus,
  verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
  rejectedReason,
});

/** S2-B5 — `POST /users/verification/students/:profileId/approve`. */
export const approveStudent = async (auth: AuthUser, profileId: string): Promise<VerificationDecisionResponse> => {
  const profile = await loadStudentProfile(profileId);

  assertStudentScope(auth, profile);

  if (profile.verificationStatus !== "PENDING_VERIFICATION") {
    throw notPending();
  }

  const verifiedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.studentProfile.updateMany({
      where: { id: profile.id, verificationStatus: "PENDING_VERIFICATION" },
      data: {
        verificationStatus: "ACTIVE",
        verifiedById: auth.userId,
        verifiedAt,
        rejectedReason: null,
        rejectedById: null,
      },
    });

    if (updated.count === 0) {
      throw notPending();
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "STUDENT_VERIFIED",
      targetType: "STUDENT_PROFILE",
      targetId: profile.id,
      metadata: {
        userId: profile.userId,
        regNo: profile.regNo,
        collegeId: profile.collegeId,
        departmentId: profile.departmentId,
        sessionId: profile.sessionId,
      },
    });
  });

  return toDecision(profile.id, "ACTIVE", verifiedAt, null);
};

/** S2-B5 — `POST /users/verification/students/:profileId/reject`. */
export const rejectStudent = async (
  auth: AuthUser,
  profileId: string,
  reason: string,
): Promise<VerificationDecisionResponse> => {
  const profile = await loadStudentProfile(profileId);

  assertStudentScope(auth, profile);

  if (profile.verificationStatus !== "PENDING_VERIFICATION") {
    throw notPending();
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.studentProfile.updateMany({
      where: { id: profile.id, verificationStatus: "PENDING_VERIFICATION" },
      data: { verificationStatus: "REJECTED", rejectedReason: reason, rejectedById: auth.userId, verifiedAt: null, verifiedById: null },
    });

    if (updated.count === 0) {
      throw notPending();
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "STUDENT_VERIFICATION_REJECTED",
      targetType: "STUDENT_PROFILE",
      targetId: profile.id,
      justification: reason,
      metadata: { userId: profile.userId, regNo: profile.regNo, collegeId: profile.collegeId, departmentId: profile.departmentId, sessionId: profile.sessionId },
    });
  });

  return toDecision(profile.id, "REJECTED", null, reason);
};

const toTeacherItem = (row: {
  id: string;
  userId: string;
  verificationStatus: TeacherVerificationItem["verificationStatus"];
  rejectedReason: string | null;
  createdAt: Date;
  user: { name: string; email: string; emailVerifiedAt: Date | null };
  college: EntityRef;
  teacherDepartments: { department: EntityRef }[];
}): TeacherVerificationItem => ({
  profileId: row.id,
  userId: row.userId,
  name: row.user.name,
  email: row.user.email,
  college: row.college,
  departments: row.teacherDepartments.map((link) => link.department),
  verificationStatus: row.verificationStatus,
  rejectedReason: row.rejectedReason,
  emailVerifiedAt: row.user.emailVerifiedAt ? row.user.emailVerifiedAt.toISOString() : null,
  registeredAt: row.createdAt.toISOString(),
});

/**
 * S2-B5 — which teacher profiles the caller may review.
 * Sub Admin: their own college(s). Platform Admin: everything.
 */
const teacherScopeWhere = (auth: AuthUser, query: VerificationListQueryInput) => {
  const departmentFilter = query.departmentId
    ? { teacherDepartments: { some: { departmentId: query.departmentId } } }
    : {};

  if (isPlatformAdmin(auth.roles)) {
    return { ...(query.collegeId ? { collegeId: query.collegeId } : {}), ...departmentFilter };
  }

  const colleges = subAdminColleges(auth);

  if (colleges.length === 0) {
    throw AppError.forbidden(
      "Only a Sub Admin or Platform Admin can review teacher registrations",
      "FORBIDDEN_ROLE",
    );
  }

  if (query.collegeId && !colleges.includes(query.collegeId)) {
    throw forbiddenScope("This college");
  }

  return { collegeId: { in: colleges }, ...departmentFilter };
};

/** S2-B5 — `GET /users/verification/teachers`. */
export const listTeacherVerifications = async (
  auth: AuthUser,
  query: VerificationListQueryInput,
): Promise<TeacherVerificationItem[]> => {
  const rows = await prisma.teacherProfile.findMany({
    where: { verificationStatus: query.status, ...teacherScopeWhere(auth, query) },
    orderBy: { createdAt: "asc" },
    take: query.limit,
    select: {
      id: true,
      userId: true,
      verificationStatus: true,
      rejectedReason: true,
      createdAt: true,
      user: { select: { name: true, email: true, emailVerifiedAt: true } },
      college: { select: { id: true, name: true } },
      teacherDepartments: { select: { department: { select: { id: true, name: true } } } },
    },
  });

  return rows.map(toTeacherItem);
};

interface TeacherProfileScope {
  id: string;
  userId: string;
  collegeId: string;
  verificationStatus: TeacherVerificationItem["verificationStatus"];
}

const loadTeacherProfile = async (profileId: string): Promise<TeacherProfileScope> => {
  const profile = await prisma.teacherProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true, collegeId: true, verificationStatus: true },
  });

  if (!profile) {
    throw AppError.notFound("Teacher profile not found", "PROFILE_NOT_FOUND");
  }

  return profile;
};

const assertTeacherScope = (auth: AuthUser, profile: Pick<TeacherProfileScope, "collegeId">): void => {
  if (isPlatformAdmin(auth.roles)) return;

  if (!subAdminColleges(auth).includes(profile.collegeId)) {
    throw forbiddenScope("This college");
  }
};

const notPendingTeacher = (): AppError =>
  new AppError(409, "This registration is not waiting for verification", "INVALID_VERIFICATION_STATE");

/** S2-B5 — `POST /users/verification/teachers/:profileId/approve`. */
export const approveTeacher = async (auth: AuthUser, profileId: string): Promise<VerificationDecisionResponse> => {
  const profile = await loadTeacherProfile(profileId);

  assertTeacherScope(auth, profile);

  if (profile.verificationStatus !== "PENDING_VERIFICATION") {
    throw notPendingTeacher();
  }

  const verifiedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.teacherProfile.updateMany({
      where: { id: profile.id, verificationStatus: "PENDING_VERIFICATION" },
      data: {
        verificationStatus: "ACTIVE",
        verifiedById: auth.userId,
        verifiedAt,
        rejectedReason: null,
        rejectedById: null,
      },
    });

    if (updated.count === 0) {
      throw notPendingTeacher();
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "TEACHER_VERIFIED",
      targetType: "TEACHER_PROFILE",
      targetId: profile.id,
      metadata: { userId: profile.userId, collegeId: profile.collegeId },
    });
  });

  return toDecision(profile.id, "ACTIVE", verifiedAt, null);
};

/** S2-B5 — `POST /users/verification/teachers/:profileId/reject`. */
export const rejectTeacher = async (
  auth: AuthUser,
  profileId: string,
  reason: string,
): Promise<VerificationDecisionResponse> => {
  const profile = await loadTeacherProfile(profileId);

  assertTeacherScope(auth, profile);

  if (profile.verificationStatus !== "PENDING_VERIFICATION") {
    throw notPendingTeacher();
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.teacherProfile.updateMany({
      where: { id: profile.id, verificationStatus: "PENDING_VERIFICATION" },
      data: {
        verificationStatus: "REJECTED",
        rejectedReason: reason,
        rejectedById: auth.userId,
        verifiedAt: null,
        verifiedById: null,
      },
    });

    if (updated.count === 0) {
      throw notPendingTeacher();
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "TEACHER_VERIFICATION_REJECTED",
      targetType: "TEACHER_PROFILE",
      targetId: profile.id,
      justification: reason,
      metadata: { userId: profile.userId, collegeId: profile.collegeId },
    });
  });

  return toDecision(profile.id, "REJECTED", null, reason);
};

/**
 * S2-B6 — `PUT /users/teachers/:profileId/departments`.
 * A teacher's departments must belong to their own college's adopted set; the
 * whole set is replaced in one transaction and audited.
 */
export const assignTeacherDepartments = async (
  auth: AuthUser,
  profileId: string,
  input: AssignTeacherDepartmentsInput,
): Promise<TeacherDepartmentsResponse> => {
  const profile = await prisma.teacherProfile.findUnique({
    where: { id: profileId },
    select: { id: true, userId: true, collegeId: true },
  });

  if (!profile) {
    throw AppError.notFound("Teacher profile not found", "PROFILE_NOT_FOUND");
  }

  assertTeacherScope(auth, profile);

  const links = await prisma.collegeDepartment.findMany({
    where: { collegeId: profile.collegeId, departmentId: { in: input.departmentIds } },
    select: { departmentId: true, department: { select: { id: true, name: true, isActive: true } } },
  });

  if (links.length !== input.departmentIds.length) {
    throw AppError.badRequest("Pick departments this college offers", "INVALID_DEPARTMENT");
  }

  if (links.some((link) => !link.department.isActive)) {
    throw AppError.badRequest("One of the selected departments is deactivated", "DEPARTMENT_INACTIVE");
  }

  await prisma.$transaction(async (tx) => {
    await tx.teacherDepartment.deleteMany({ where: { teacherProfileId: profile.id } });

    await tx.teacherDepartment.createMany({
      data: input.departmentIds.map((departmentId) => ({ teacherProfileId: profile.id, departmentId })),
    });

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "TEACHER_DEPARTMENTS_ASSIGNED",
      targetType: "TEACHER_PROFILE",
      targetId: profile.id,
      metadata: {
        userId: profile.userId,
        collegeId: profile.collegeId,
        departmentCount: input.departmentIds.length,
        departmentIds: input.departmentIds.join(","),
      },
    });
  });

  return {
    profileId: profile.id,
    departments: links.map((link) => ({ id: link.department.id, name: link.department.name })),
  };
};

// ── S2-B6: role management (appoint / revoke CR, Co-CR and Sub Admin) ────────

/** Active role predicate (A.2: not revoked and not expired). */
const activeNow = () => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
});

/** Active roles of a user, as the directory screens list them. */
const roleSummarySelect = () => ({
  where: activeNow(),
  orderBy: [{ assignedAt: "asc" as const }, { createdAt: "asc" as const }],
  select: { id: true, role: true, expiresAt: true },
});

const toRoleSummary = (role: { id: string; role: RoleSummary["role"]; expiresAt: Date | null }): RoleSummary => ({
  id: role.id,
  role: role.role,
  expiresAt: role.expiresAt ? role.expiresAt.toISOString() : null,
});

const roleAssignmentSelect = {
  id: true,
  userId: true,
  role: true,
  scope: true,
  appointmentType: true,
  assignedAt: true,
  expiresAt: true,
  college: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  session: { select: { id: true, name: true } },
  user: { select: { name: true, email: true } },
} as const;

const toRoleAssignment = (row: {
  id: string;
  userId: string;
  role: RoleAssignmentItem["role"];
  scope: RoleAssignmentItem["scope"];
  appointmentType: RoleAssignmentItem["appointmentType"];
  assignedAt: Date;
  expiresAt: Date | null;
  college: EntityRef | null;
  department: EntityRef | null;
  session: EntityRef | null;
  user: { name: string; email: string };
}): RoleAssignmentItem => ({
  id: row.id,
  userId: row.userId,
  name: row.user.name,
  email: row.user.email,
  role: row.role,
  scope: row.scope,
  appointmentType: row.appointmentType,
  college: row.college,
  department: row.department,
  session: row.session,
  assignedAt: row.assignedAt.toISOString(),
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
});

const roleLabel = (role: RoleAssignmentItem["role"]): string => {
  if (role === "CO_CR") return "Co-CR";
  if (role === "CR") return "CR";
  if (role === "SUB_ADMIN") return "Sub Admin";

  return "Platform Admin";
};

/**
 * S2-B6 — a Sub Admin only acts inside their own college(s); a Platform Admin
 * acts platform-wide (A.4).
 */
const assertCollegeScope = (auth: AuthUser, collegeId: string): void => {
  if (isPlatformAdmin(auth.roles)) return;

  const colleges = subAdminColleges(auth);

  if (colleges.length === 0) {
    throw AppError.forbidden("Only a Sub Admin or Platform Admin can manage roles", "FORBIDDEN_ROLE");
  }

  if (!colleges.includes(collegeId)) {
    throw forbiddenScope("This college");
  }
};

/** `where` clause for directory/role lists, narrowed to the caller's colleges. */
const collegeFilterFor = (auth: AuthUser, query: { collegeId?: string }) => {
  if (isPlatformAdmin(auth.roles)) {
    return { ...(query.collegeId ? { collegeId: query.collegeId } : {}) };
  }

  const colleges = subAdminColleges(auth);

  if (colleges.length === 0) {
    throw AppError.forbidden("Only a Sub Admin or Platform Admin can manage roles", "FORBIDDEN_ROLE");
  }

  if (query.collegeId && !colleges.includes(query.collegeId)) {
    throw forbiddenScope("This college");
  }

  return { collegeId: { in: colleges } };
};

/** S2-B6 — `GET /users/students`: verified students the caller may appoint. */
export const listStudents = async (
  auth: AuthUser,
  query: PeopleListQueryInput,
): Promise<StudentDirectoryItem[]> => {
  const search = query.q?.trim();

  const rows = await prisma.studentProfile.findMany({
    where: {
      verificationStatus: "ACTIVE",
      ...collegeFilterFor(auth, query),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { regNo: { contains: search, mode: "insensitive" as const } },
                  { user: { name: { contains: search, mode: "insensitive" as const } } },
                  { user: { email: { contains: search, mode: "insensitive" as const } } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ collegeId: "asc" }, { regNo: "asc" }],
    take: query.limit,
    select: {
      id: true,
      userId: true,
      regNo: true,
      includeOtherColleges: true,
      college: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
      user: { select: { name: true, email: true, roles: roleSummarySelect() } },
    },
  });

  return rows.map((row) => ({
    profileId: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    regNo: row.regNo,
    includeOtherColleges: row.includeOtherColleges,
    college: row.college,
    department: row.department,
    session: row.session,
    roles: row.user.roles.map(toRoleSummary),
  }));
};

/** S2-B6 — `GET /users/teachers`: verified teachers (Sub Admin pickers). */
export const listTeachers = async (
  auth: AuthUser,
  query: PeopleListQueryInput,
): Promise<TeacherDirectoryItem[]> => {
  const search = query.q?.trim();

  const rows = await prisma.teacherProfile.findMany({
    where: {
      verificationStatus: "ACTIVE",
      ...collegeFilterFor(auth, query),
      ...(query.departmentId ? { teacherDepartments: { some: { departmentId: query.departmentId } } } : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { user: { name: { contains: search, mode: "insensitive" as const } } },
                  { user: { email: { contains: search, mode: "insensitive" as const } } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ collegeId: "asc" }, { createdAt: "asc" }],
    take: query.limit,
    select: {
      id: true,
      userId: true,
      college: { select: { id: true, name: true } },
      teacherDepartments: { select: { department: { select: { id: true, name: true } } } },
      user: { select: { name: true, email: true, roles: roleSummarySelect() } },
    },
  });

  return rows.map((row) => ({
    profileId: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    college: row.college,
    departments: row.teacherDepartments.map((link) => link.department),
    roles: row.user.roles.map(toRoleSummary),
  }));
};

/** S2-B6 — `GET /users/roles`: active role assignments in the caller's scope. */
export const listRoles = async (auth: AuthUser, query: RoleListQueryInput): Promise<RoleAssignmentItem[]> => {
  const rows = await prisma.userRole.findMany({
    where: {
      ...activeNow(),
      ...collegeFilterFor(auth, query),
      ...(query.role ? { role: query.role } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.sessionId ? { sessionId: query.sessionId } : {}),
    },
    orderBy: [{ assignedAt: "desc" }],
    take: query.limit,
    select: roleAssignmentSelect,
  });

  return rows.map(toRoleAssignment);
};

/**
 * S2-B6 — `POST /users/roles`: appoint a CR or Co-CR.
 * One active pair per (college, department, session); the student must already
 * be a verified member of that exact batch.
 */
export const appointCr = async (auth: AuthUser, input: AppointCrInput): Promise<RoleAssignmentItem> => {
  assertCollegeScope(auth, input.collegeId);

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true, collegeId: true, departmentId: true, sessionId: true, verificationStatus: true },
  });

  if (!profile) {
    throw AppError.badRequest("That user has no student profile", "INVALID_STUDENT_TARGET");
  }

  if (profile.verificationStatus !== "ACTIVE") {
    throw AppError.badRequest("Only a verified student can be appointed", "PROFILE_NOT_ACTIVE");
  }

  if (
    profile.collegeId !== input.collegeId ||
    profile.departmentId !== input.departmentId ||
    profile.sessionId !== input.sessionId
  ) {
    throw AppError.badRequest(
      "The student must belong to that college, department and session",
      "INVALID_STUDENT_SCOPE",
    );
  }

  const taken = await prisma.userRole.findFirst({
    where: {
      ...activeNow(),
      role: input.role,
      collegeId: input.collegeId,
      departmentId: input.departmentId,
      sessionId: input.sessionId,
    },
    select: { id: true, user: { select: { name: true } } },
  });

  if (taken) {
    throw AppError.conflict(
      `This batch already has a ${roleLabel(input.role)} (${taken.user.name}). Revoke that role first.`,
      "ROLE_SLOT_TAKEN",
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const role = await tx.userRole.create({
      data: {
        userId: input.userId,
        role: input.role,
        scope: "DEPARTMENT_SESSION",
        collegeId: input.collegeId,
        departmentId: input.departmentId,
        sessionId: input.sessionId,
        assignedById: auth.userId,
        appointmentType: "STANDARD",
        expiresAt: input.expiresAt ?? null,
        reason: input.reason ?? null,
      },
      select: roleAssignmentSelect,
    });

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "ROLE_APPOINTED",
      targetType: "USER_ROLE",
      targetId: role.id,
      justification: input.reason ?? null,
      metadata: {
        userId: input.userId,
        role: input.role,
        collegeId: input.collegeId,
        departmentId: input.departmentId,
        sessionId: input.sessionId,
        expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
      },
    });

    return role;
  });

  return toRoleAssignment(created);
};

/**
 * S2-B6 — `POST /users/roles/:roleId/revoke`.
 * Sub Admin: CR/Co-CR of their own college. Platform Admin: any role.
 */
export const revokeRole = async (
  auth: AuthUser,
  roleId: string,
  reason: string,
): Promise<RoleRevocationResponse> => {
  const role = await prisma.userRole.findUnique({
    where: { id: roleId },
    select: { id: true, userId: true, role: true, collegeId: true, revokedAt: true },
  });

  if (!role) {
    throw AppError.notFound("Role assignment not found", "ROLE_NOT_FOUND");
  }

  if (!isPlatformAdmin(auth.roles)) {
    if (role.role !== "CR" && role.role !== "CO_CR") {
      throw AppError.forbidden("Only a Platform Admin can revoke this role", "FORBIDDEN_ROLE");
    }

    if (!role.collegeId) {
      throw forbiddenScope("This role");
    }

    assertCollegeScope(auth, role.collegeId);
  }

  if (role.revokedAt) {
    throw AppError.conflict("This role was already revoked", "ROLE_ALREADY_REVOKED");
  }

  const revokedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.userRole.updateMany({
      where: { id: role.id, revokedAt: null },
      data: { revokedAt, revokedById: auth.userId, reason },
    });

    if (updated.count === 0) {
      throw AppError.conflict("This role was already revoked", "ROLE_ALREADY_REVOKED");
    }

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: "ROLE_REVOKED",
      targetType: "USER_ROLE",
      targetId: role.id,
      justification: reason,
      metadata: { userId: role.userId, role: role.role, collegeId: role.collegeId },
    });
  });

  return { id: role.id, userId: role.userId, role: role.role, revokedAt: revokedAt.toISOString() };
};

/**
 * S2-B6 — `POST /users/roles/sub-admin` (Platform Admin only).
 * Exactly one active Sub Admin per college (D9). An emergency appointment
 * revokes the current holder inside the same transaction and is audited.
 */
export const appointSubAdmin = async (
  auth: AuthUser,
  input: AppointSubAdminInput,
): Promise<RoleAssignmentItem> => {
  if (!isPlatformAdmin(auth.roles)) {
    throw AppError.forbidden("Only a Platform Admin can appoint Sub Admins", "FORBIDDEN_ROLE");
  }

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true, collegeId: true, verificationStatus: true },
  });

  if (!teacher || teacher.collegeId !== input.collegeId) {
    throw AppError.badRequest("The Sub Admin must be a teacher of that college", "INVALID_SUB_ADMIN_TARGET");
  }

  if (teacher.verificationStatus !== "ACTIVE") {
    throw AppError.badRequest("Only a verified teacher can be a Sub Admin", "PROFILE_NOT_ACTIVE");
  }

  const current = await prisma.userRole.findFirst({
    where: { ...activeNow(), role: "SUB_ADMIN", collegeId: input.collegeId },
    select: { id: true, userId: true, user: { select: { name: true, email: true } } },
  });

  if (current && !input.emergency) {
    throw AppError.conflict(
      `This college already has a Sub Admin (${current.user.name}). Use the emergency replacement to remove them.`,
      "SUB_ADMIN_EXISTS",
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (current) {
      const revokedAt = new Date();

      const revoked = await tx.userRole.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt, revokedById: auth.userId, reason: input.reason ?? "Emergency replacement" },
      });

      if (revoked.count === 0) {
        throw AppError.conflict(
          "The Sub Admin changed while you were editing. Reload and retry.",
          "ROLE_ALREADY_REVOKED",
        );
      }

      await writeAuditLog(tx, {
        actorId: auth.userId,
        action: "SUB_ADMIN_REPLACED",
        targetType: "USER_ROLE",
        targetId: current.id,
        justification: input.reason ?? null,
        metadata: {
          userId: current.userId,
          collegeId: input.collegeId,
          replacementUserId: input.userId,
        },
      });
    }

    const role = await tx.userRole.create({
      data: {
        userId: input.userId,
        role: "SUB_ADMIN",
        scope: "COLLEGE",
        collegeId: input.collegeId,
        assignedById: auth.userId,
        appointmentType: input.emergency ? "EMERGENCY" : "STANDARD",
        expiresAt: input.expiresAt ?? null,
        reason: input.reason ?? null,
      },
      select: roleAssignmentSelect,
    });

    await writeAuditLog(tx, {
      actorId: auth.userId,
      action: input.emergency ? "SUB_ADMIN_EMERGENCY_APPOINTED" : "SUB_ADMIN_APPOINTED",
      targetType: "USER_ROLE",
      targetId: role.id,
      justification: input.reason ?? null,
      metadata: {
        userId: input.userId,
        collegeId: input.collegeId,
        expiresAt: input.expiresAt ? input.expiresAt.toISOString() : null,
      },
    });

    return role;
  });

  return toRoleAssignment(created);
};
