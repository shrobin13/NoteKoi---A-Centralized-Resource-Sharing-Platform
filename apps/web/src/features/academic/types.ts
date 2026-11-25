/** Shared academic DTOs (S2-F1…S2-F4). Mirrors `apps/api/src/module/{college,department,session,course}`. */

export type AcademicStatus = "active" | "all";

export interface EntityRef {
  id: string;
  name: string;
}

/** `GET /colleges/:id/departments` — shape used by the register form (S1-B13). */
export interface CollegeSummary {
  id: string;
  name: string;
}

export interface CollegeDepartmentSummary {
  id: string;
  name: string;
  adoptedAt: string;
}

export interface CollegeDepartments {
  college: CollegeSummary;
  departments: CollegeDepartmentSummary[];
}

export interface SessionSummary {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface DepartmentSessions {
  department: { id: string; name: string };
  sessions: SessionSummary[];
}

/** `GET /colleges` — one row of the college directory (S2-B2). */
export interface CollegeView {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  departmentCount: number;
  studentCount: number;
}

export interface CollegeDepartmentLink {
  id: string;
  name: string;
  isActive: boolean;
  adoptedAt: string;
}

export interface CollegeDetail {
  college: CollegeView;
  departments: CollegeDepartmentLink[];
  counts: { students: number; teachers: number };
}

/** `GET /departments` — one row of the department directory (S2-B1). */
export interface DepartmentView {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  collegeCount: number;
  sessionCount: number;
  courseCount: number;
  studentCount: number;
}

export interface DepartmentCollegeLink {
  id: string;
  name: string;
  isActive: boolean;
  adoptedAt: string;
}

export interface DepartmentDetail {
  department: DepartmentView;
  colleges: DepartmentCollegeLink[];
}

/** `GET /sessions` (S2-B3). */
export interface SessionView {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  departmentId: string;
  departmentName: string;
  studentCount: number;
}

/** `GET /courses` (S2-B4). */
export interface CourseView {
  id: string;
  name: string;
  description: string | null;
  semester: number | null;
  isActive: boolean;
  createdAt: string;
  departmentId: string;
  departmentName: string;
  resourceCount: number;
  folderCount: number;
}

export interface CollegeListParams {
  status?: AcademicStatus;
  search?: string;
}

export interface DepartmentListParams extends CollegeListParams {
  collegeId?: string;
}

export interface SessionListParams {
  departmentId?: string;
  status?: AcademicStatus;
  search?: string;
}

export interface CourseListParams {
  departmentId?: string;
  status?: AcademicStatus;
  search?: string;
  semester?: number;
}

export interface CollegeInput {
  name: string;
}

export interface CollegeUpdateInput {
  name?: string;
  isActive?: boolean;
}

export interface DepartmentInput {
  name: string;
}

export interface DepartmentUpdateInput {
  name?: string;
  isActive?: boolean;
}

export interface SessionCreateInput {
  departmentId: string;
  name: string;
  startDate?: string;
  endDate?: string;
}

export interface SessionUpdateInput {
  name?: string;
  startDate?: string | null;
  endDate?: string | null;
  isActive?: boolean;
}

export interface CourseCreateInput {
  departmentId: string;
  name: string;
  description?: string;
  semester?: number;
}

export interface CourseUpdateInput {
  name?: string;
  description?: string | null;
  semester?: number | null;
  isActive?: boolean;
}
