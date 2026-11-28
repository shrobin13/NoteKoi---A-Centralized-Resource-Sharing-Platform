import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as adminService from "./admin.service.js";
import type { AdminDeleteResourceInput, AdminUpdateResourceInput, AuditLogQuery } from "./admin.validation.js";

interface ResourceIdParams {
  id: string;
}

export const updateResourceOverride: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<AdminUpdateResourceInput, never, ResourceIdParams>(res);
  const result = await adminService.updateResourceOverride(requireAuth(req), params.id, body);

  sendResponse(res, { message: "Resource overridden", data: result });
};

export const deleteResourceOverride: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<AdminDeleteResourceInput, never, ResourceIdParams>(res);
  const result = await adminService.deleteResourceOverride(requireAuth(req), params.id, body);

  sendResponse(res, { message: "Resource soft-deleted by Platform Admin", data: result });
};

export const listAuditLogs: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, AuditLogQuery>(res);
  const result = await adminService.listAuditLogs(requireAuth(req), query);

  sendResponse(res, {
    message: "Audit logs loaded",
    data: result.items,
    meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
  });
};
