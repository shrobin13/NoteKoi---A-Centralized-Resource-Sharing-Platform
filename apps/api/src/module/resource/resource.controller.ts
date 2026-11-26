import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { viewerFromAuth } from "../../lib/visibility.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as resourceService from "./resource.service.js";
import type {
  AddResourceGrantsInput,
  EditResourceMetadataInput,
  ListOwnResourcesQuery,
  ListResourcesQuery,
  PublishResourceInput,
  UploadResourceInput,
} from "./resource.validation.js";

interface ResourceIdParams {
  id: string;
}

interface ResourceGrantParams extends ResourceIdParams {
  sessionId: string;
}

/** POST /api/v1/resources (multipart: fields + `file`) — S3-B3. */
export const uploadResource: RequestHandler = async (req, res) => {
  const { body } = getValidated<UploadResourceInput>(res);
  const file = req.file
    ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    : undefined;
  const resource = await resourceService.uploadResource(requireAuth(req), body, file);

  sendResponse(res, {
    message: resource.deduplicated
      ? "Resource uploaded (identical file reused)"
      : "Resource uploaded",
    data: resource,
    statusCode: 201,
  });
};

/** PATCH /api/v1/resources/:id — uploader-only metadata changes (S3-B7). */
export const editResourceMetadata: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<EditResourceMetadataInput, never, ResourceIdParams>(res);
  const resource = await resourceService.editResourceMetadata(requireAuth(req), params.id, body);

  sendResponse(res, { message: "Resource metadata updated", data: resource });
};

/** POST /api/v1/resources/:id/versions — multipart file upload (S3-B7). */
export const uploadResourceVersion: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const file = req.file
    ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    : undefined;
  const version = await resourceService.uploadResourceVersion(requireAuth(req), params.id, file);

  sendResponse(res, {
    message: version.deduplicated ? "Version uploaded (identical file reused)" : "Version uploaded",
    data: version,
    statusCode: 201,
  });
};

/** GET /api/v1/resources/:id/versions — uploader or in-scope moderator (S3-B7). */
export const listResourceVersions: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const versions = await resourceService.listResourceVersions(req.auth ?? null, params.id);

  sendResponse(res, { message: "Resource versions loaded", data: versions });
};

/** POST /api/v1/resources/:id/publish — PRIVATE → PERMITTED or PLATFORM (S4-B3). */
export const publishResource: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<PublishResourceInput, never, ResourceIdParams>(res);
  const resource = await resourceService.publishResource(requireAuth(req), params.id, body);

  sendResponse(res, { message: "Resource published", data: resource });
};

/** POST /api/v1/resources/:id/grants — add batches to a PERMITTED resource (S4-B4). */
export const addResourceGrants: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<AddResourceGrantsInput, never, ResourceIdParams>(res);
  const resource = await resourceService.addResourceGrants(requireAuth(req), params.id, body);

  sendResponse(res, { message: "Batches added", data: resource });
};

/** DELETE /api/v1/resources/:id/grants/:sessionId — revoke one batch (S4-B4). */
export const revokeResourceGrant: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceGrantParams>(res);
  const resource = await resourceService.revokeResourceGrant(requireAuth(req), params.id, params.sessionId);

  sendResponse(res, { message: "Batch access revoked", data: resource });
};

/** POST /api/v1/resources/:id/promote — raise audience to PLATFORM (S5-B3). */
export const promoteResource: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const resource = await resourceService.promoteResource(requireAuth(req), params.id);

  sendResponse(res, { message: "Resource promoted to PLATFORM", data: resource });
};

/** POST /api/v1/resources/:id/revoke-platform — return to the uploader's private/college audience (S5-B3). */
export const revokePlatformResource: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const resource = await resourceService.revokePlatformResource(requireAuth(req), params.id);

  sendResponse(res, { message: "PLATFORM publication revoked", data: resource });
};

/** GET /api/v1/resources — browse + search, guest-friendly (S3-B4). */
export const listResources: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ListResourcesQuery>(res);
  const result = await resourceService.listResources(viewerFromAuth(req.auth), query);

  sendResponse(res, {
    message: "Resources loaded",
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
};

/** GET /api/v1/resources/mine — the uploader's own rows, any state (S3-F2). */
export const listOwnResources: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ListOwnResourcesQuery>(res);
  const result = await resourceService.listOwnResources(viewerFromAuth(req.auth), query);

  sendResponse(res, {
    message: "Your uploads",
    data: result.items,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
};

/** GET /api/v1/resources/:id — detail (S3-B4). */
export const getResource: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const resource = await resourceService.getResourceDetail(viewerFromAuth(req.auth), params.id);

  sendResponse(res, { message: "Resource loaded", data: resource });
};

/** GET /api/v1/resources/:id/download — proxied bytes, never a Drive URL (S3-B4). */
export const downloadResource: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, ResourceIdParams>(res);
  const download = await resourceService.openResourceDownload(viewerFromAuth(req.auth), params.id);
  const fallback = download.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");

  res.setHeader("Content-Type", download.mimeType);
  res.setHeader("Content-Length", String(download.sizeBytes));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(download.fileName)}`,
  );
  res.setHeader("X-Resource-Version", String(download.versionNo));
  res.setHeader("Cache-Control", "private, no-store");

  // The stream can fail after the headers went out; all that is left is to abort.
  download.stream.on("error", () => {
    if (res.headersSent) res.destroy();
    else res.status(502).json({ success: false, message: "The file could not be read", code: "STORAGE_UNAVAILABLE" });
  });

  download.stream.pipe(res);
};
