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

export interface CourseDetailResponse {
  course: CourseView;
}

export interface CourseListQuery {
  departmentId?: string;
  status: "active" | "all";
  search?: string;
  semester?: number;
}
