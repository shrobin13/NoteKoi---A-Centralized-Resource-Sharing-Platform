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

export interface DepartmentDetailResponse {
  department: DepartmentView;
  colleges: DepartmentCollegeLink[];
}

export interface DepartmentListQuery {
  status: "active" | "all";
  search?: string;
  collegeId?: string;
}

export interface SessionSummary {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface DepartmentSessionsResponse {
  department: { id: string; name: string };
  sessions: SessionSummary[];
}

