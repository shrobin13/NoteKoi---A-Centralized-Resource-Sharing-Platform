import type { RequestHandler } from "express";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as collegeService from "./college.service.js";
import type { CollegeListQueryInput, CreateCollegeInput, UpdateCollegeInput } from "./college.validation.js";

/** GET /api/v1/colleges */
export const listColleges: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, CollegeListQueryInput>(res);
  const colleges = await collegeService.listColleges(query, req.auth);

  sendResponse(res, { message: "Colleges", data: colleges, meta: { total: colleges.length } });
};

/** GET /api/v1/colleges/:id */
export const getCollege: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const result = await collegeService.getCollege(params.id);

  sendResponse(res, { message: "College", data: result, meta: { departments: result.departments.length } });
};

/** POST /api/v1/colleges */
export const createCollege: RequestHandler = async (_req, res) => {
  const { body } = getValidated<CreateCollegeInput>(res);
  const college = await collegeService.createCollege(body);

  sendResponse(res, { message: "College created", data: college, statusCode: 201 });
};

/** PATCH /api/v1/colleges/:id */
export const updateCollege: RequestHandler = async (_req, res) => {
  const { params, body } = getValidated<UpdateCollegeInput, unknown, { id: string }>(res);
  const college = await collegeService.updateCollege(params.id, body);

  sendResponse(res, { message: "College updated", data: college });
};

/** DELETE /api/v1/colleges/:id (soft delete) */
export const deleteCollege: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const college = await collegeService.deactivateCollege(params.id);

  sendResponse(res, { message: "College deactivated", data: college });
};

/** POST /api/v1/colleges/:id/departments */
export const adoptDepartment: RequestHandler = async (_req, res) => {
  const { params, body } = getValidated<{ departmentId: string }, unknown, { id: string }>(res);
  const department = await collegeService.adoptDepartment(params.id, body.departmentId);

  sendResponse(res, { message: "Department adopted", data: department, statusCode: 201 });
};

/** DELETE /api/v1/colleges/:id/departments/:departmentId */
export const dropDepartment: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string; departmentId: string }>(res);
  const result = await collegeService.dropDepartment(params.id, params.departmentId);

  sendResponse(res, { message: "Department removed from the college", data: result });
};

/** GET /api/v1/colleges/:id/departments */
export const listDepartments: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const result = await collegeService.listDepartmentsOfCollege(params.id);

  sendResponse(res, {
    message: "Departments of the college",
    data: result,
    meta: { total: result.departments.length },
  });
};

