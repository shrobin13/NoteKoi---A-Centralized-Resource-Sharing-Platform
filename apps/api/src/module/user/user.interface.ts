import type {
  AppointmentType,
  ProfileVerificationStatus,
  RoleScope,
  UserRoleType,
} from "../../../generated/prisma/enums.js";
import type { EntityRef } from "../auth/auth.interface.js";

/** S2-B5 — one pending student registration as the CR queue sees it. */
export interface StudentVerificationItem {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  regNo: string;
  verificationStatus: ProfileVerificationStatus;
  rejectedReason: string | null;
  college: EntityRef;
  department: EntityRef;
  session: EntityRef;
  emailVerifiedAt: string | null;
  registeredAt: string;
}

/** S2-B5 — one pending teacher registration as the Sub Admin queue sees it. */
export interface TeacherVerificationItem {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  college: EntityRef;
  departments: EntityRef[];
  verificationStatus: ProfileVerificationStatus;
  rejectedReason: string | null;
  emailVerifiedAt: string | null;
  registeredAt: string;
}

export interface VerificationDecisionResponse {
  profileId: string;
  verificationStatus: ProfileVerificationStatus;
  /** Set when the profile was approved. */
  verifiedAt: string | null;
  /** Set when the profile was rejected. */
  rejectedReason: string | null;
}

export interface TeacherDepartmentsResponse {
  profileId: string;
  departments: EntityRef[];
}

/** One active role as the directory/detail screens show it (S2-B6). */
export interface RoleSummary {
  id: string;
  role: UserRoleType;
  expiresAt: string | null;
}

/** S2-B6 — a verified student, with the roles they currently hold. */
export interface StudentDirectoryItem {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  regNo: string;
  includeOtherColleges: boolean;
  college: EntityRef;
  department: EntityRef;
  session: EntityRef;
  roles: RoleSummary[];
}

/** S2-B6 — a verified teacher, with the roles they currently hold. */
export interface TeacherDirectoryItem {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  college: EntityRef;
  departments: EntityRef[];
  roles: RoleSummary[];
}

/** S2-B6 — one active `UserRole` row, ready to render in the role table. */
export interface RoleAssignmentItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: UserRoleType;
  scope: RoleScope;
  appointmentType: AppointmentType;
  college: EntityRef | null;
  department: EntityRef | null;
  session: EntityRef | null;
  assignedAt: string;
  expiresAt: string | null;
}

/** S2-B6 — result of a revocation. */
export interface RoleRevocationResponse {
  id: string;
  userId: string;
  role: UserRoleType;
  revokedAt: string;
}
