import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as deletionService from "./deletion.service.js";
import type { DeleteResourceInput, ListDeletionRequestsQuery } from "./deletion.validation.js";

interface IdParams {
  id: string;
}

export const requestOrDeleteResource: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<DeleteResourceInput, never, IdParams>(res);
  const result = await deletionService.requestOrDeleteResource(requireAuth(req), params.id, body);

  sendResponse(res, {
    message:
      result.action === "REQUESTED"
        ? "Deletion request submitted"
        : result.action === "FLAGGED"
          ? "Deletion flagged for review"
          : result.action === "CANCELED"
            ? "Pending upload canceled"
            : "Resource deleted",
    data: result,
    statusCode: result.action === "REQUESTED" ? 201 : 200,
  });
};

export const listDeletionRequests: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ListDeletionRequestsQuery>(res);
  const result = await deletionService.listDeletionRequests(requireAuth(req), query);

  sendResponse(res, {
    message: "Deletion requests loaded",
    data: result.items,
    meta: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
  });
};

export const approveDeletionRequest: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, IdParams>(res);
  const result = await deletionService.approveDeletionRequest(requireAuth(req), params.id);

  sendResponse(res, { message: "Deletion request approved", data: result });
};

export const denyDeletionRequest: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, IdParams>(res);
  const result = await deletionService.denyDeletionRequest(requireAuth(req), params.id);

  sendResponse(res, { message: "Deletion request denied", data: result });
};