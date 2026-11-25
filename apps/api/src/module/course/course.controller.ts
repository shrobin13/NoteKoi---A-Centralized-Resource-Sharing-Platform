import type { RequestHandler } from "express";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as courseService from "./course.service.js";
import type { CourseListQueryInput, CreateCourseInput, UpdateCourseInput } from "./course.validation.js";

/** GET /api/v1/courses */
export const listCourses: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, CourseListQueryInput>(res);
  const courses = await courseService.listCourses(query, req.auth);

  sendResponse(res, { message: "Courses", data: courses, meta: { total: courses.length } });
};

/** GET /api/v1/courses/:id */
export const getCourse: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const course = await courseService.getCourse(params.id);

  sendResponse(res, { message: "Course", data: course });
};

/** POST /api/v1/courses */
export const createCourse: RequestHandler = async (_req, res) => {
  const { body } = getValidated<CreateCourseInput>(res);
  const course = await courseService.createCourse(body);

  sendResponse(res, { message: "Course created", data: course, statusCode: 201 });
};

/** PATCH /api/v1/courses/:id */
export const updateCourse: RequestHandler = async (_req, res) => {
  const { params, body } = getValidated<UpdateCourseInput, unknown, { id: string }>(res);
  const course = await courseService.updateCourse(params.id, body);

  sendResponse(res, { message: "Course updated", data: course });
};

/** DELETE /api/v1/courses/:id (soft delete) */
export const deleteCourse: RequestHandler = async (_req, res) => {
  const { params } = getValidated<unknown, unknown, { id: string }>(res);
  const course = await courseService.deactivateCourse(params.id);

  sendResponse(res, { message: "Course deactivated", data: course });
};
