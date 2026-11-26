import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as reportService from "./report.service.js";
import type { FileReportInput, ListReportsQuery } from "./report.validation.js";

interface ReportIdParams {
  id: string;
}

export const fileReport: RequestHandler = async (req, res) => {
  const { body } = getValidated<FileReportInput>(res);
  const report = await reportService.fileReport(requireAuth(req), body);

  sendResponse(res, { message: "Report submitted", data: report, statusCode: 201 });
};

export const listReports: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ListReportsQuery>(res);
  const result = await reportService.listReports(requireAuth(req), query);

  sendResponse(res, {
    message: "Reports loaded",
    data: result.items,
    meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
  });
};

export const resolveReport: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ReportIdParams>(res);
  const report = await reportService.resolveReport(requireAuth(req), params.id);

  sendResponse(res, { message: "Report resolved", data: report });
};

export const dismissReport: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ReportIdParams>(res);
  const report = await reportService.dismissReport(requireAuth(req), params.id);

  sendResponse(res, { message: "Report dismissed", data: report });
};