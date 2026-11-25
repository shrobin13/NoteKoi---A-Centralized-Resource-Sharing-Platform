import type { EntityRef, ProfileVerificationStatus, UserRoleType } from "@/features/auth/types";

/** Mirrors `apps/api/src/module/user/user.interface.ts` (S2-B5 / S2-B6). */

export type VerificationQueryStatus = ProfileVerificationStatus;

export interface VerificationListParams {
  status?: VerificationQueryStatus;
  collegeId?: string;
  departmentId?: string;
  sessionId?: string;
  limit?: number;
}

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

export interface VerificationDecision {
  profileId: string;
  verificationStatus: ProfileVerificationStatus;
  verifiedAt: string | null;
  rejectedReason: string | null;
}

export interface TeacherDepartmentsResult {
  profileId: string;
  departments: EntityRef[];
}

export interface RoleSummary {
  id: string;
  role: UserRoleType;
  expiresAt: string | null;
}

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

export interface TeacherDirectoryItem {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  college: EntityRef;
  departments: EntityRef[];
  roles: RoleSummary[];
}

export interface RoleAssignment {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: UserRoleType;
  scope: "DEPARTMENT_SESSION" | "COLLEGE" | "PLATFORM";
  appointmentType: "STANDARD" | "EMERGENCY";
  college: EntityRef | null;
  department: EntityRef | null;
  session: EntityRef | null;
  assignedAt: string;
  expiresAt: string | null;
}

export interface RoleRevocation {
  id: string;
  userId: string;
  role: UserRoleType;
  revokedAt: string;
}

export interface PeopleListParams {
  collegeId?: string;
  departmentId?: string;
  sessionId?: string;
  q?: string;
  limit?: number;
}

export interface RoleListParams {
  role?: UserRoleType;
  collegeId?: string;
  departmentId?: string;
  sessionId?: string;
  limit?: number;
}

export interface AppointCrInput {
  userId: string;
  role: "CR" | "CO_CR";
  collegeId: string;
  departmentId: string;
  sessionId: string;
  expiresAt?: string;
  reason?: string;
}

export interface AppointSubAdminInput {
  userId: string;
  collegeId: string;
  emergency: boolean;
  expiresAt?: string;
  reason?: string;
}
