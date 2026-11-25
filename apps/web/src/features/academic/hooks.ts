"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adoptCollegeDepartment,
  createCollege,
  createCourse,
  createDepartment,
  createSession,
  deactivateCollege,
  deactivateCourse,
  deactivateDepartment,
  deactivateSession,
  dropCollegeDepartment,
  fetchCollegeDepartments,
  fetchCollegeDetail,
  fetchCollegeList,
  fetchColleges,
  fetchCourseList,
  fetchDepartmentDetail,
  fetchDepartmentList,
  fetchDepartmentSessions,
  fetchSessionList,
  updateCollege,
  updateCourse,
  updateDepartment,
  updateSession,
} from "./api";
import type {
  CollegeDepartments,
  CollegeDetail,
  CollegeInput,
  CollegeListParams,
  CollegeSummary,
  CollegeUpdateInput,
  CollegeView,
  CourseCreateInput,
  CourseListParams,
  CourseUpdateInput,
  CourseView,
  DepartmentDetail,
  DepartmentInput,
  DepartmentListParams,
  DepartmentSessions,
  DepartmentUpdateInput,
  DepartmentView,
  SessionCreateInput,
  SessionListParams,
  SessionUpdateInput,
  SessionView,
} from "./types";

export const academicKeys = {
  /** Register-form lookups (S1-B13). */
  colleges: ["academic", "colleges"] as const,
  departments: (collegeId: string) => ["academic", "colleges", collegeId, "departments"] as const,
  sessions: (departmentId: string) => ["academic", "departments", departmentId, "sessions"] as const,

  /** Slice 2 screens. */
  collegeList: (params: CollegeListParams) => ["academic", "colleges", "list", params] as const,
  collegeDetail: (collegeId: string) => ["academic", "college", collegeId] as const,
  departmentList: (params: DepartmentListParams) => ["academic", "departments", "list", params] as const,
  departmentDetail: (departmentId: string) => ["academic", "departments", "detail", departmentId] as const,
  sessionList: (params: SessionListParams) => ["academic", "sessions", "list", params] as const,
  courseList: (params: CourseListParams) => ["academic", "courses", "list", params] as const,
};

/** Academic structure feeds almost every screen, so any write refreshes the whole namespace. */
const useAcademicMutation = <TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  successMessage: string,
) => {
  const queryClient = useQueryClient();

  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["academic"] });
      toast.success(successMessage);
    },
  });
};

export const useColleges = () =>
  useQuery<CollegeSummary[]>({
    queryKey: academicKeys.colleges,
    queryFn: ({ signal }) => fetchColleges(signal),
    staleTime: 5 * 60_000,
  });

export const useCollegeDepartments = (collegeId: string) =>
  useQuery<CollegeDepartments>({
    queryKey: academicKeys.departments(collegeId),
    queryFn: ({ signal }) => fetchCollegeDepartments(collegeId, signal),
    enabled: collegeId.length > 0,
    staleTime: 5 * 60_000,
  });

export const useDepartmentSessions = (departmentId: string) =>
  useQuery<DepartmentSessions>({
    queryKey: academicKeys.sessions(departmentId),
    queryFn: ({ signal }) => fetchDepartmentSessions(departmentId, signal),
    enabled: departmentId.length > 0,
    staleTime: 5 * 60_000,
  });

// ── Slice 2 reads ───────────────────────────────────────────────────────────
export const useCollegeList = (params: CollegeListParams = {}) =>
  useQuery<CollegeView[]>({
    queryKey: academicKeys.collegeList(params),
    queryFn: ({ signal }) => fetchCollegeList(params, signal),
    staleTime: 30_000,
  });

export const useCollegeDetail = (collegeId: string) =>
  useQuery<CollegeDetail>({
    queryKey: academicKeys.collegeDetail(collegeId),
    queryFn: ({ signal }) => fetchCollegeDetail(collegeId, signal),
    enabled: collegeId.length > 0,
  });

export const useDepartmentList = (params: DepartmentListParams = {}) =>
  useQuery<DepartmentView[]>({
    queryKey: academicKeys.departmentList(params),
    queryFn: ({ signal }) => fetchDepartmentList(params, signal),
    staleTime: 30_000,
  });

export const useDepartmentDetail = (departmentId: string) =>
  useQuery<DepartmentDetail>({
    queryKey: academicKeys.departmentDetail(departmentId),
    queryFn: ({ signal }) => fetchDepartmentDetail(departmentId, signal),
    enabled: departmentId.length > 0,
  });

export const useSessionList = (params: SessionListParams = {}) =>
  useQuery<SessionView[]>({
    queryKey: academicKeys.sessionList(params),
    queryFn: ({ signal }) => fetchSessionList(params, signal),
    staleTime: 30_000,
  });

export const useCourseList = (params: CourseListParams = {}) =>
  useQuery<CourseView[]>({
    queryKey: academicKeys.courseList(params),
    queryFn: ({ signal }) => fetchCourseList(params, signal),
    staleTime: 30_000,
  });

// ── College writes (Platform Admin) ─────────────────────────────────────────
export const useCreateCollege = () =>
  useAcademicMutation<CollegeView, CollegeInput>((input) => createCollege(input), "College created.");

export const useUpdateCollege = () =>
  useAcademicMutation<CollegeView, { collegeId: string; input: CollegeUpdateInput }>(
    ({ collegeId, input }) => updateCollege(collegeId, input),
    "College updated.",
  );

export const useDeactivateCollege = () =>
  useAcademicMutation<CollegeView, string>(
    (collegeId) => deactivateCollege(collegeId),
    "College deactivated. Nothing was deleted.",
  );

export const useAdoptCollegeDepartment = () =>
  useAcademicMutation<unknown, { collegeId: string; departmentId: string }>(
    ({ collegeId, departmentId }) => adoptCollegeDepartment(collegeId, departmentId),
    "Department adopted by the college.",
  );

export const useDropCollegeDepartment = () =>
  useAcademicMutation<unknown, { collegeId: string; departmentId: string }>(
    ({ collegeId, departmentId }) => dropCollegeDepartment(collegeId, departmentId),
    "Department removed from the college.",
  );

// ── Department writes (Platform Admin) ──────────────────────────────────────
export const useCreateDepartment = () =>
  useAcademicMutation<DepartmentView, DepartmentInput>((input) => createDepartment(input), "Department created.");

export const useUpdateDepartment = () =>
  useAcademicMutation<DepartmentView, { departmentId: string; input: DepartmentUpdateInput }>(
    ({ departmentId, input }) => updateDepartment(departmentId, input),
    "Department updated.",
  );

export const useDeactivateDepartment = () =>
  useAcademicMutation<DepartmentView, string>(
    (departmentId) => deactivateDepartment(departmentId),
    "Department deactivated. Nothing was deleted.",
  );

// ── Session writes (Platform Admin) ─────────────────────────────────────────
export const useCreateSession = () =>
  useAcademicMutation<SessionView, SessionCreateInput>((input) => createSession(input), "Session created.");

export const useUpdateSession = () =>
  useAcademicMutation<SessionView, { sessionId: string; input: SessionUpdateInput }>(
    ({ sessionId, input }) => updateSession(sessionId, input),
    "Session updated.",
  );

export const useDeactivateSession = () =>
  useAcademicMutation<SessionView, string>(
    (sessionId) => deactivateSession(sessionId),
    "Session deactivated. Nothing was deleted.",
  );

// ── Course writes (Platform Admin) ──────────────────────────────────────────
export const useCreateCourse = () =>
  useAcademicMutation<CourseView, CourseCreateInput>((input) => createCourse(input), "Course created.");

export const useUpdateCourse = () =>
  useAcademicMutation<CourseView, { courseId: string; input: CourseUpdateInput }>(
    ({ courseId, input }) => updateCourse(courseId, input),
    "Course updated.",
  );

export const useDeactivateCourse = () =>
  useAcademicMutation<CourseView, string>(
    (courseId) => deactivateCourse(courseId),
    "Course deactivated. Nothing was deleted.",
  );

