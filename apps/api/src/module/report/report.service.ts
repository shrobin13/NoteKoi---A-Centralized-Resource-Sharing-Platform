import type { Prisma } from "../../../generated/prisma/client.js";
import type { ReportStatus } from "../../../generated/prisma/enums.js";
import { isPlatformAdmin, type AuthUser } from "../../lib/authz.js";
import { buildVisibilityWhere, viewerFromAuth } from "../../lib/visibility.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { ReportListResult, ReportView } from "./report.interface.js";
import type { FileReportInput, ListReportsQuery } from "./report.validation.js";

const reportSelect = {
  id: true,
  resourceId: true,
  reason: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  reporter: { select: { id: true, name: true, email: true } },
  resolvedBy: { select: { id: true, name: true } },
  resource: {
    select: {
      id: true,
      title: true,
      audience: true,
      uploaderType: true,
      uploader: { select: { id: true, name: true } },
      course: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
    },
  },
} as const;

type ReportRow = Prisma.ReportGetPayload<{ select: typeof reportSelect }>;

const toReportView = (row: ReportRow): ReportView => ({
  id: row.id,
  resourceId: row.resourceId,
  reason: row.reason,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  reporter: row.reporter,
  resolvedBy: row.resolvedBy,
  resource: row.resource,
});

const reportNotFound = (): AppError => AppError.notFound("Report not found", "REPORT_NOT_FOUND");

const reportQueueWhere = (auth: AuthUser): Prisma.ReportWhereInput => {
  if (isPlatformAdmin(auth.roles)) {
    return { resource: { audience: { not: "PRIVATE" }, deletedAt: null } };
  }

  const scopes: Prisma.ReportWhereInput[] = [];

  for (const role of auth.roles) {
    if ((role.role === "CR" || role.role === "CO_CR") && role.collegeId && role.departmentId && role.sessionId) {
      scopes.push({
        resource: {
          collegeId: role.collegeId,
          departmentId: role.departmentId,
          sessionId: role.sessionId,
          uploaderType: "STUDENT",
          uploaderId: { not: auth.userId },
          audience: { not: "PRIVATE" },
          deletedAt: null,
        },
      });
    }

    if (role.role === "SUB_ADMIN" && role.collegeId) {
      scopes.push({
        resource: {
          collegeId: role.collegeId,
          uploaderType: "TEACHER",
          audience: { not: "PRIVATE" },
          deletedAt: null,
        },
      });
    }
  }

  if (scopes.length === 0) {
    throw AppError.forbidden("Only a CR, Co-CR, Sub Admin or Platform Admin can review reports", "FORBIDDEN_SCOPE");
  }

  return { OR: scopes };
};

const findScopedReport = async (auth: AuthUser, id: string): Promise<ReportRow> => {
  const report = await prisma.report.findFirst({
    where: { AND: [reportQueueWhere(auth), { id }] },
    select: reportSelect,
  });

  if (!report) throw reportNotFound();
  return report;
};

export const fileReport = async (auth: AuthUser, input: FileReportInput): Promise<ReportView> => {
  const resource = await prisma.resource.findFirst({
    where: {
      AND: [
        buildVisibilityWhere(viewerFromAuth(auth)),
        { id: input.resourceId, audience: { not: "PRIVATE" }, deletedAt: null },
      ],
    },
    select: { id: true },
  });

  if (!resource) throw AppError.notFound("Resource not found", "RESOURCE_NOT_FOUND");

  const report = await prisma.report.create({
    data: { resourceId: resource.id, reporterId: auth.userId, reason: input.reason },
    select: reportSelect,
  });

  return toReportView(report);
};

export const listReports = async (auth: AuthUser, query: ListReportsQuery): Promise<ReportListResult> => {
  const where: Prisma.ReportWhereInput = {
    AND: [reportQueueWhere(auth), { status: query.status }],
  };
  const [total, rows] = await prisma.$transaction([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: reportSelect,
    }),
  ]);

  return {
    items: rows.map(toReportView),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
};

const decideReport = async (auth: AuthUser, id: string, status: Exclude<ReportStatus, "PENDING">): Promise<ReportView> => {
  const report = await findScopedReport(auth, id);
  if (report.status !== "PENDING") {
    throw AppError.conflict("This report has already been decided", "REPORT_ALREADY_DECIDED");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.report.updateMany({
      where: { id, status: "PENDING" },
      data: { status, resolvedById: auth.userId, resolvedAt: new Date() },
    });
    if (updated.count === 0) {
      throw AppError.conflict("This report has already been decided", "REPORT_ALREADY_DECIDED");
    }

    return toReportView(await tx.report.findUniqueOrThrow({ where: { id }, select: reportSelect }));
  });
};

export const resolveReport = (auth: AuthUser, id: string): Promise<ReportView> =>
  decideReport(auth, id, "RESOLVED");

export const dismissReport = (auth: AuthUser, id: string): Promise<ReportView> =>
  decideReport(auth, id, "DISMISSED");