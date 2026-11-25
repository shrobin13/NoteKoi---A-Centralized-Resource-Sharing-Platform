export interface SessionView {
  id: string;
  name: string;
  /** `YYYY-MM-DD` or null. */
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  departmentId: string;
  departmentName: string;
  studentCount: number;
}

export interface SessionDetailResponse {
  session: SessionView;
}

export interface SessionListQuery {
  departmentId?: string;
  status: "active" | "all";
  search?: string;
}
