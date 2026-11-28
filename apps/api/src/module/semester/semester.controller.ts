import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as semesterService from "./semester.service.js";
import type {
  AddSemesterCourseInput,
  CreateCategoryInput,
  CreateSemesterInput,
  UpdateCategoryInput,
  UpdateSemesterCourseInput,
  UpdateSemesterInput,
} from "./semester.validation.js";

export const listSemesters: RequestHandler = async (req, res) => {
  const semesters = await semesterService.listSemesters(requireAuth(req));
  sendResponse(res, { message: "Semesters loaded", data: semesters, meta: { total: semesters.length } });
};

export const createSemester: RequestHandler = async (req, res) => {
  const { body } = getValidated<CreateSemesterInput>(res);
  const semester = await semesterService.createSemester(requireAuth(req), body);
  sendResponse(res, { message: "Semester created", data: semester, statusCode: 201 });
};

export const getSemester: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, { id: string }>(res);
  const semester = await semesterService.getSemester(requireAuth(req), params.id);
  sendResponse(res, { message: "Semester loaded", data: semester });
};

export const updateSemester: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<UpdateSemesterInput, never, { id: string }>(res);
  const semester = await semesterService.updateSemester(requireAuth(req), params.id, body);
  sendResponse(res, { message: "Semester updated", data: semester });
};

export const deleteSemester: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, { id: string }>(res);
  const result = await semesterService.deleteSemester(requireAuth(req), params.id);
  sendResponse(res, { message: "Semester removed", data: result });
};

export const addSemesterCourse: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<AddSemesterCourseInput, never, { id: string }>(res);
  const course = await semesterService.addSemesterCourse(requireAuth(req), params.id, body);
  sendResponse(res, { message: "Course added to semester", data: course, statusCode: 201 });
};

export const updateSemesterCourse: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<UpdateSemesterCourseInput, never, { id: string }>(res);
  const course = await semesterService.updateSemesterCourse(requireAuth(req), params.id, body);
  sendResponse(res, { message: "Semester course updated", data: course });
};

export const deleteSemesterCourse: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, { id: string }>(res);
  const result = await semesterService.deleteSemesterCourse(requireAuth(req), params.id);
  sendResponse(res, { message: "Semester course removed", data: result });
};

export const createCategory: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<CreateCategoryInput, never, { id: string }>(res);
  const category = await semesterService.createCategory(requireAuth(req), params.id, body);
  sendResponse(res, { message: "Category created", data: category, statusCode: 201 });
};

export const updateCategory: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<UpdateCategoryInput, never, { semesterCourseId: string; categoryId: string }>(res);
  const category = await semesterService.updateCategory(requireAuth(req), params.semesterCourseId, params.categoryId, body);
  sendResponse(res, { message: "Category updated", data: category });
};

export const deleteCategory: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, { semesterCourseId: string; categoryId: string }>(res);
  const result = await semesterService.deleteCategory(requireAuth(req), params.semesterCourseId, params.categoryId);
  sendResponse(res, { message: "Category removed", data: result });
};
