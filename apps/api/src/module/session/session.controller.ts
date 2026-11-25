import type { RequestHandler } from "express";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as sessionService from "./session.service.js";
import type { CreateSessionInput, SessionListQueryInput, UpdateSessionInput } from "./session.validation.js";

/** GET /api/v1/sessions */
export const listSessions: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, SessionListQueryInput>(res);
  const sessions = await sessionService.listSessions(query, req.auth);

  sendResponse(res, { message: "Sessions", data: sessions, meta: { total: sessions.length } });
};

/** GET /api/v1/sessions/:id */
export const getSession: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const session = await sessionService.getSession(params.id);

  sendResponse(res, { message: "Session", data: session });
};

/** POST /api/v1/sessions */
export const createSession: RequestHandler = async (_req, res) => {
  const { body } = getValidated<CreateSessionInput>(res);
  const session = await sessionService.createSession(body);

  sendResponse(res, { message: "Session created", data: session, statusCode: 201 });
};

/** PATCH /api/v1/sessions/:id */
export const updateSession: RequestHandler = async (_req, res) => {
  const { params, body } = getValidated<UpdateSessionInput, unknown, { id: string }>(res);
  const session = await sessionService.updateSession(params.id, body);

  sendResponse(res, { message: "Session updated", data: session });
};

/** DELETE /api/v1/sessions/:id (soft delete) */
export const deleteSession: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const session = await sessionService.deactivateSession(params.id);

  sendResponse(res, { message: "Session deactivated", data: session });
};
