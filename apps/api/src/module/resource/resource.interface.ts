import type {
  AudienceType,
  ResourceState,
  UploaderType,
  VersionState,
} from "../../../generated/prisma/enums.js";

/** S3-B3 — the shape every resource endpoint returns. */
export interface ResourceVersionView {
  id: string;
  versionNo: number;
  state: VersionState;
  rejectionReason: string | null;
  createdAt: string;
  mimeType: string | null;
  /** `BigInt` columns are serialised as numbers for the client. */
  sizeBytes: number | null;
}

export interface ResourceVersionHistoryItem extends ResourceVersionView {
  isCurrent: boolean;
}

export interface ResourceVersionUploadResult extends ResourceVersionHistoryItem {
  resourceId: string;
  resourceState: ResourceState;
  deduplicated: boolean;
}

export interface ResourceDetail {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  resourceType: string;
  audience: AudienceType;
  state: ResourceState;
  uploaderType: UploaderType;
  collegeId: string;
  departmentId: string;
  courseId: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  uploader: { id: string; name: string };
  college: { id: string; name: string };
  department: { id: string; name: string };
  course: { id: string; name: string };
  session: { id: string; name: string } | null;
  currentVersionId: string | null;
  versions: ResourceVersionView[];
  /** Only meaningful for `PERMITTED`: the batches this file was shared with. */
  grants: { sessionId: string; sessionName: string }[];
}

export interface ResourceUploadResult extends ResourceDetail {
  /** True when the bytes were already stored and the existing row was reused. */
  deduplicated: boolean;
}

/** S3-B4 — one row of a resource list (browse or "My uploads"). */
export interface ResourceListItem {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  resourceType: string;
  audience: AudienceType;
  state: ResourceState;
  uploaderType: UploaderType;
  createdAt: string;
  updatedAt: string;
  uploader: { id: string; name: string };
  department: { id: string; name: string };
  course: { id: string; name: string };
  /** The live version; `null` only for a half-written row. */
  versionNo: number | null;
  latestVersionState: VersionState | null;
  rejectionReason: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface ResourceListResult {
  items: ResourceListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
