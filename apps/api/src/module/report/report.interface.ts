import type { AudienceType, ReportStatus, UploaderType } from "../../../generated/prisma/enums.js";

export interface ReportView {
  id: string;
  resourceId: string;
  reason: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string; email: string };
  resolvedBy: { id: string; name: string } | null;
  resource: {
    id: string;
    title: string;
    audience: AudienceType;
    uploaderType: UploaderType;
    uploader: { id: string; name: string };
    course: { id: string; name: string };
    session: { id: string; name: string } | null;
  };
}

export interface ReportListResult {
  items: ReportView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}