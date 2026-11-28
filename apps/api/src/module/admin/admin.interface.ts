import type { AudienceType, ResourceState } from "../../../generated/prisma/enums.js";

export interface AdminResourceView {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  resourceType: string;
  audience: AudienceType;
  state: ResourceState;
  uploaderId: string;
  currentVersionId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOverrideResult {
  resource: AdminResourceView;
  action: "RESOURCE_UPDATED" | "RESOURCE_SOFT_DELETED";
}
