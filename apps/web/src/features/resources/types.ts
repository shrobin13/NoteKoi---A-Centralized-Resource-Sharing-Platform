export type ResourceAudience = "PRIVATE" | "COLLEGE" | "PERMITTED" | "PLATFORM";
export type ResourceState = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "DELETED";
export type ResourceType = "NOTES" | "SLIDES" | "ASSIGNMENT" | "QUESTION_BANK" | "BOOK" | "OTHER";
export type ResourceVersionState = ResourceState | "SUPERSEDED";

export interface ResourceVersion {
  id: string;
  versionNo: number;
  state: ResourceVersionState;
  rejectionReason: string | null;
  createdAt: string;
  mimeType: string | null;
  sizeBytes: number | null;
  isCurrent?: boolean;
}

export interface ResourceUploadResult {
  id: string;
  title: string;
  audience: ResourceAudience;
  state: ResourceState;
  resourceType: ResourceType;
  currentVersionId: string | null;
  versions: ResourceVersion[];
  deduplicated: boolean;
}

export interface ResourceListItem {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  resourceType: ResourceType;
  audience: ResourceAudience;
  state: ResourceState;
  uploaderType: "STUDENT" | "TEACHER" | "ADMIN";
  collegeId: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  uploader: { id: string; name: string };
  department: { id: string; name: string };
  course: { id: string; name: string };
  versionNo: number | null;
  latestVersionState: ResourceVersionState | null;
  rejectionReason: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface ResourceDetail extends ResourceListItem {
  collegeId: string;
  departmentId: string;
  courseId: string;
  sessionId: string | null;
  currentVersionId: string | null;
  college: { id: string; name: string };
  session: { id: string; name: string } | null;
  versions: ResourceVersion[];
  grants: { sessionId: string; sessionName: string }[];
}

export interface ResourceVersionUploadResult extends ResourceVersion {
  resourceId: string;
  resourceState: ResourceState;
  deduplicated: boolean;
}

export interface UploadTokenResult {
  token: string;
  tokenType: "Bearer";
  expiresAt: number;
  expiresInSeconds: number;
}

export interface ResourceListFilters {
  courseId?: string;
  semesterCourseId?: string;
  categoryId?: string;
  keyword?: string;
  resourceType?: ResourceType;
  sort?: "newest" | "oldest" | "title";
  page: number;
  pageSize: number;
}

export interface ResourceListResult {
  items: ResourceListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}