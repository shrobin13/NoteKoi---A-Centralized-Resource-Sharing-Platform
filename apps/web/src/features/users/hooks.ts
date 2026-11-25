"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { authKeys } from "@/features/auth/hooks/use-auth";
import {
  appointCr,
  appointSubAdmin,
  approveStudent,
  approveTeacher,
  assignTeacherDepartments,
  fetchRoles,
  fetchStudents,
  fetchStudentVerifications,
  fetchTeachers,
  fetchTeacherVerifications,
  rejectStudent,
  rejectTeacher,
  revokeRole,
} from "./api";
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

export const userKeys = {
  verificationStudents: (params: VerificationListParams) => ["users", "verification", "students", params] as const,
  verificationTeachers: (params: VerificationListParams) => ["users", "verification", "teachers", params] as const,
  students: (params: PeopleListParams) => ["users", "students", params] as const,
  teachers: (params: PeopleListParams) => ["users", "teachers", params] as const,
  roles: (params: RoleListParams) => ["users", "roles", params] as const,
};

/**
 * Verification and role writes touch queues, directories and the caller's own
 * roles (a Sub Admin losing their role must immediately lose the screens), so
 * every mutation refreshes the whole `users` namespace plus `auth/me`.
 */
const useUserMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  successMessage: string,
) => {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: authKeys.me });
      toast.success(successMessage);
    },
  });
};

// ── Verification queues ─────────────────────────────────────────────────────
export const useStudentVerifications = (params: VerificationListParams = {}) =>
  useQuery<StudentVerificationItem[]>({
    queryKey: userKeys.verificationStudents(params),
    queryFn: ({ signal }) => fetchStudentVerifications(params, signal),
    staleTime: 15_000,
  });

export const useTeacherVerifications = (params: VerificationListParams = {}) =>
  useQuery<TeacherVerificationItem[]>({
    queryKey: userKeys.verificationTeachers(params),
    queryFn: ({ signal }) => fetchTeacherVerifications(params, signal),
    staleTime: 15_000,
  });

export const useApproveStudent = () =>
  useUserMutation<VerificationDecision, string>((profileId) => approveStudent(profileId), "Student approved.");

export const useRejectStudent = () =>
  useUserMutation<VerificationDecision, { profileId: string; reason: string }>(
    ({ profileId, reason }) => rejectStudent(profileId, reason),
    "Student registration rejected.",
  );

export const useApproveTeacher = () =>
  useUserMutation<VerificationDecision, string>((profileId) => approveTeacher(profileId), "Teacher approved.");

export const useRejectTeacher = () =>
  useUserMutation<VerificationDecision, { profileId: string; reason: string }>(
    ({ profileId, reason }) => rejectTeacher(profileId, reason),
    "Teacher registration rejected.",
  );

export const useAssignTeacherDepartments = () =>
  useUserMutation<TeacherDepartmentsResult, { profileId: string; departmentIds: string[] }>(
    ({ profileId, departmentIds }) => assignTeacherDepartments(profileId, departmentIds),
    "Teacher departments updated.",
  );

// ── Directories ─────────────────────────────────────────────────────────────
export const useStudents = (params: PeopleListParams = {}, enabled = true) =>
  useQuery<StudentDirectoryItem[]>({
    queryKey: userKeys.students(params),
    queryFn: ({ signal }) => fetchStudents(params, signal),
    enabled,
    staleTime: 15_000,
  });

export const useTeachers = (params: PeopleListParams = {}, enabled = true) =>
  useQuery<TeacherDirectoryItem[]>({
    queryKey: userKeys.teachers(params),
    queryFn: ({ signal }) => fetchTeachers(params, signal),
    enabled,
    staleTime: 15_000,
  });

// ── Roles ───────────────────────────────────────────────────────────────────
export const useRoles = (params: RoleListParams = {}) =>
  useQuery<RoleAssignment[]>({
    queryKey: userKeys.roles(params),
    queryFn: ({ signal }) => fetchRoles(params, signal),
    staleTime: 15_000,
  });

export const useAppointCr = () =>
  useUserMutation<RoleAssignment, AppointCrInput>((input) => appointCr(input), "Role appointed.");

export const useAppointSubAdmin = () =>
  useUserMutation<RoleAssignment, AppointSubAdminInput>((input) => appointSubAdmin(input), "Sub Admin appointed.");

export const useRevokeRole = () =>
  useUserMutation<RoleRevocation, { roleId: string; reason: string }>(
    ({ roleId, reason }) => revokeRole(roleId, reason),
    "Role revoked. History is kept.",
  );
