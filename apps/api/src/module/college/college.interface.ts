export interface EntityRef {
  id: string;
  name: string;
}

/** S2-B2 — one row of the college list (public or admin view). */
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

export interface CollegeDetailResponse {
  college: CollegeView;
  departments: CollegeDepartmentLink[];
  counts: { students: number; teachers: number };
}

export interface CollegeListQuery {
  status: "active" | "all";
  search?: string;
}

/** Shape still returned by `GET /colleges/:id/departments` (register form, S1-B13). */
export interface CollegeSummary {
  id: string;
  name: string;
}

export interface CollegeDepartmentSummary {
  id: string;
  name: string;
  adoptedAt: string;
}

export interface CollegeDepartmentsResponse {
  college: CollegeSummary;
  departments: CollegeDepartmentSummary[];
}

