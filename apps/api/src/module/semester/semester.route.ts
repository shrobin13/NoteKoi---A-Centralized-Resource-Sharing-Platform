import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkRole } from "../../middleware/checkRole.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./semester.controller.js";
import {
  addSemesterCourseSchema,
  categoryParamsSchema,
  createCategorySchema,
  createSemesterSchema,
  semesterCourseIdParamsSchema,
  semesterIdParamsSchema,
  updateCategorySchema,
  updateSemesterCourseSchema,
  updateSemesterSchema,
} from "./semester.validation.js";

export const semesterRouter = Router();
const crRole = checkRole("CR", "CO_CR");

semesterRouter.get("/", checkAuth, controller.listSemesters);
semesterRouter.post("/", checkAuth, crRole, validateRequest({ body: createSemesterSchema }), controller.createSemester);
semesterRouter.get("/:id", checkAuth, validateRequest({ params: semesterIdParamsSchema }), controller.getSemester);
semesterRouter.patch("/:id", checkAuth, crRole, validateRequest({ params: semesterIdParamsSchema, body: updateSemesterSchema }), controller.updateSemester);
semesterRouter.delete("/:id", checkAuth, crRole, validateRequest({ params: semesterIdParamsSchema }), controller.deleteSemester);
semesterRouter.post("/:id/courses", checkAuth, crRole, validateRequest({ params: semesterIdParamsSchema, body: addSemesterCourseSchema }), controller.addSemesterCourse);

semesterRouter.patch("/semester-courses/:id", checkAuth, crRole, validateRequest({ params: semesterCourseIdParamsSchema, body: updateSemesterCourseSchema }), controller.updateSemesterCourse);
semesterRouter.delete("/semester-courses/:id", checkAuth, crRole, validateRequest({ params: semesterCourseIdParamsSchema }), controller.deleteSemesterCourse);
semesterRouter.post("/semester-courses/:id/categories", checkAuth, crRole, validateRequest({ params: semesterCourseIdParamsSchema, body: createCategorySchema }), controller.createCategory);
semesterRouter.patch("/semester-courses/:semesterCourseId/categories/:categoryId", checkAuth, crRole, validateRequest({ params: categoryParamsSchema, body: updateCategorySchema }), controller.updateCategory);
semesterRouter.delete("/semester-courses/:semesterCourseId/categories/:categoryId", checkAuth, crRole, validateRequest({ params: categoryParamsSchema }), controller.deleteCategory);
