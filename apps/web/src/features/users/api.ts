import { apiGet, apiPatch, apiPost, apiPut, toQueryString } from "@/lib/api";
import type {
  AppointCrInput,
  AppointSubAdminInput,
  PeopleListParams,
  RoleAssignment,
  RoleListParams,
  RoleRevocation,
  StudentDirectoryItem,
  StudentVerificationItem,
  TeacherDepartmentsResult,
  TeacherDirectoryItem,
  TeacherVerificationItem,
  VerificationDecision,
  VerificationListParams,
} from "./types";

/**
 * Role-gated user endpoints (S2-B5 / S2-B6). Every path here sits behind
 * `checkAuth` + `checkRole`; the service still narrows the scope.
 */

// ── Verification queues ─────────────────────────────────────────────────────
export const fetchStudentVerifications = (
  params: VerificationListParams = {},
  signal?: AbortSignal,
): Promise<StudentVerificationItem[]> =>
  apiGet<StudentVerificationItem[]>(`/users/verification/students${toQueryString(params)}`, signal);

export const approveStudent = async (profileId: string): Promise<VerificationDecision> =>
  (await apiPost<VerificationDecision>(`/users/verification/students/${profileId}/approve`, {})).data;

export const rejectStudent = async (profileId: string, reason: string): Promise<VerificationDecision> =>
  (await apiPost<VerificationDecision>(`/users/verification/students/${profileId}/reject`, { reason })).data;

export const fetchTeacherVerifications = (
  params: VerificationListParams = {},
  signal?: AbortSignal,
): Promise<TeacherVerificationItem[]> =>
  apiGet<TeacherVerificationItem[]>(`/users/verification/teachers${toQueryString(params)}`, signal);

export const approveTeacher = async (profileId: string): Promise<VerificationDecision> =>
  (await apiPost<VerificationDecision>(`/users/verification/teachers/${profileId}/approve`, {})).data;

export const rejectTeacher = async (profileId: string, reason: string): Promise<VerificationDecision> =>
  (await apiPost<VerificationDecision>(`/users/verification/teachers/${profileId}/reject`, { reason })).data;

/** `PUT /users/teachers/:profileId/departments` — replaces the whole list (min 1). */
export const assignTeacherDepartments = (profileId: string, departmentIds: string[]): Promise<TeacherDepartmentsResult> =>
  apiPut<TeacherDepartmentsResult>(`/users/teachers/${profileId}/departments`, { departmentIds });

// ── Directories ─────────────────────────────────────────────────────────────
export const fetchStudents = (params: PeopleListParams = {}, signal?: AbortSignal): Promise<StudentDirectoryItem[]> =>
  apiGet<StudentDirectoryItem[]>(`/users/students${toQueryString(params)}`, signal);

export const fetchTeachers = (params: PeopleListParams = {}, signal?: AbortSignal): Promise<TeacherDirectoryItem[]> =>
  apiGet<TeacherDirectoryItem[]>(`/users/teachers${toQueryString(params)}`, signal);

// ── Roles ───────────────────────────────────────────────────────────────────
export const fetchRoles = (params: RoleListParams = {}, signal?: AbortSignal): Promise<RoleAssignment[]> =>
  apiGet<RoleAssignment[]>(`/users/roles${toQueryString(params)}`, signal);

export const appointCr = async (input: AppointCrInput): Promise<RoleAssignment> =>
  (await apiPost<RoleAssignment>("/users/roles", input)).data;

export const appointSubAdmin = async (input: AppointSubAdminInput): Promise<RoleAssignment> =>
  (await apiPost<RoleAssignment>("/users/roles/sub-admin", input)).data;

export const revokeRole = async (roleId: string, reason: string): Promise<RoleRevocation> =>
  (await apiPost<RoleRevocation>(`/users/roles/${roleId}/revoke`, { reason })).data;

/** Self service (`PATCH /users/me`) — used by the profile card. */
export const updateMyName = (name: string): Promise<unknown> => apiPatch<unknown>("/users/me", { name });
