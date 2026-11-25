import type { RequestHandler } from "express";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as departmentService from "./department.service.js";
import type {
  CreateDepartmentInput,
  DepartmentListQueryInput,
  UpdateDepartmentInput,
} from "./department.validation.js";

/** GET /api/v1/departments */
export const listDepartments: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, DepartmentListQueryInput>(res);
  const departments = await departmentService.listDepartments(query, req.auth);

  sendResponse(res, { message: "Departments", data: departments, meta: { total: departments.length } });
};

/** GET /api/v1/departments/:id */
export const getDepartment: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const result = await departmentService.getDepartment(params.id);

  sendResponse(res, { message: "Department", data: result, meta: { colleges: result.colleges.length } });
};

/** POST /api/v1/departments */
export const createDepartment: RequestHandler = async (_req, res) => {
  const { body } = getValidated<CreateDepartmentInput>(res);
  const department = await departmentService.createDepartment(body);

  sendResponse(res, { message: "Department created", data: department, statusCode: 201 });
};

/** PATCH /api/v1/departments/:id */
export const updateDepartment: RequestHandler = async (_req, res) => {
  const { params, body } = getValidated<UpdateDepartmentInput, unknown, { id: string }>(res);
  const department = await departmentService.updateDepartment(params.id, body);

  sendResponse(res, { message: "Department updated", data: department });
};

/** DELETE /api/v1/departments/:id (soft delete) */
export const deleteDepartment: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const department = await departmentService.deactivateDepartment(params.id);

  sendResponse(res, { message: "Department deactivated", data: department });
};

/** GET /api/v1/departments/:id/sessions */
export const listSessions: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const result = await departmentService.listSessionsOfDepartment(params.id);

  sendResponse(res, {
    message: "Sessions of the department",
    data: result,
    meta: { total: result.sessions.length },
  });
};

