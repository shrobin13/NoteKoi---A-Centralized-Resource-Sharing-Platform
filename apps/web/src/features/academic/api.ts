import { apiDelete, apiGet, apiPatch, apiPost, toQueryString } from "@/lib/api";
import type {
  CollegeDepartmentLink,
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
  DepartmentCollegeLink,
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

/** Every academic HTTP call lives here (Section 7C rule 1). Reads are public. */

// ── Register-form lookups (S1-B13) ──────────────────────────────────────────
export const fetchColleges = (signal?: AbortSignal): Promise<CollegeSummary[]> =>
  apiGet<CollegeSummary[]>("/colleges", signal);

export const fetchCollegeDepartments = (collegeId: string, signal?: AbortSignal): Promise<CollegeDepartments> =>
  apiGet<CollegeDepartments>(`/colleges/${collegeId}/departments`, signal);

export const fetchDepartmentSessions = (departmentId: string, signal?: AbortSignal): Promise<DepartmentSessions> =>
  apiGet<DepartmentSessions>(`/departments/${departmentId}/sessions`, signal);

// ── Colleges (S2-B2 / S2-F1 / S2-F2) ────────────────────────────────────────
export const fetchCollegeList = (params: CollegeListParams = {}, signal?: AbortSignal): Promise<CollegeView[]> =>
  apiGet<CollegeView[]>(`/colleges${toQueryString(params)}`, signal);

export const fetchCollegeDetail = (collegeId: string, signal?: AbortSignal): Promise<CollegeDetail> =>
  apiGet<CollegeDetail>(`/colleges/${collegeId}`, signal);

export const createCollege = async (input: CollegeInput): Promise<CollegeView> =>
  (await apiPost<CollegeView>("/colleges", input)).data;

export const updateCollege = (collegeId: string, input: CollegeUpdateInput): Promise<CollegeView> =>
  apiPatch<CollegeView>(`/colleges/${collegeId}`, input);

export const deactivateCollege = (collegeId: string): Promise<CollegeView> =>
  apiDelete<CollegeView>(`/colleges/${collegeId}`);

export const adoptCollegeDepartment = async (
  collegeId: string,
  departmentId: string,
): Promise<CollegeDepartmentLink> =>
  (await apiPost<CollegeDepartmentLink>(`/colleges/${collegeId}/departments`, { departmentId })).data;

export const dropCollegeDepartment = (
  collegeId: string,
  departmentId: string,
): Promise<CollegeDepartmentLink> =>
  apiDelete<CollegeDepartmentLink>(`/colleges/${collegeId}/departments/${departmentId}`);

// ── Departments (S2-B1 / S2-F1 / S2-F2) ─────────────────────────────────────
export const fetchDepartmentList = (
  params: DepartmentListParams = {},
  signal?: AbortSignal,
): Promise<DepartmentView[]> => apiGet<DepartmentView[]>(`/departments${toQueryString(params)}`, signal);

export const fetchDepartmentDetail = (departmentId: string, signal?: AbortSignal): Promise<DepartmentDetail> =>
  apiGet<DepartmentDetail>(`/departments/${departmentId}`, signal);

export const createDepartment = async (input: DepartmentInput): Promise<DepartmentView> =>
  (await apiPost<DepartmentView>("/departments", input)).data;

export const updateDepartment = (departmentId: string, input: DepartmentUpdateInput): Promise<DepartmentView> =>
  apiPatch<DepartmentView>(`/departments/${departmentId}`, input);

export const deactivateDepartment = (departmentId: string): Promise<DepartmentView> =>
  apiDelete<DepartmentView>(`/departments/${departmentId}`);

// ── Sessions (S2-B3 / S2-F2) ────────────────────────────────────────────────
export const fetchSessionList = (params: SessionListParams = {}, signal?: AbortSignal): Promise<SessionView[]> =>
  apiGet<SessionView[]>(`/sessions${toQueryString(params)}`, signal);

export const createSession = async (input: SessionCreateInput): Promise<SessionView> =>
  (await apiPost<SessionView>("/sessions", input)).data;

export const updateSession = (sessionId: string, input: SessionUpdateInput): Promise<SessionView> =>
  apiPatch<SessionView>(`/sessions/${sessionId}`, input);

export const deactivateSession = (sessionId: string): Promise<SessionView> =>
  apiDelete<SessionView>(`/sessions/${sessionId}`);

// ── Courses (S2-B4 / S2-F1 / S2-F2) ─────────────────────────────────────────
export const fetchCourseList = (params: CourseListParams = {}, signal?: AbortSignal): Promise<CourseView[]> =>
  apiGet<CourseView[]>(`/courses${toQueryString(params)}`, signal);

export const createCourse = async (input: CourseCreateInput): Promise<CourseView> =>
  (await apiPost<CourseView>("/courses", input)).data;

export const updateCourse = (courseId: string, input: CourseUpdateInput): Promise<CourseView> =>
  apiPatch<CourseView>(`/courses/${courseId}`, input);

export const deactivateCourse = (courseId: string): Promise<CourseView> =>
  apiDelete<CourseView>(`/courses/${courseId}`);

export type {
  CollegeDepartmentLink,
  CollegeDetail,
  CollegeView,
  CourseView,
  DepartmentCollegeLink,
  DepartmentDetail,
  DepartmentView,
  SessionView,
};

