import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkRole } from "../../middleware/checkRole.js";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./course.controller.js";
import {
  courseIdParamsSchema,
  courseListQuerySchema,
  createCourseSchema,
  updateCourseSchema,
} from "./course.validation.js";

/**
 * Mounted by routes/index.ts at `/api/v1/courses`.
 * Reads are public; writes are Platform Admin only (A.4).
 */
export const courseRouter = Router();

courseRouter.get("/", optionalAuth, validateRequest({ query: courseListQuerySchema }), controller.listCourses);
courseRouter.post(
  "/",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ body: createCourseSchema }),
  controller.createCourse,
);

courseRouter.get("/:id", validateRequest({ params: courseIdParamsSchema }), controller.getCourse);
courseRouter.patch(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: courseIdParamsSchema, body: updateCourseSchema }),
  controller.updateCourse,
);
courseRouter.delete(
  "/:id",
  checkAuth,
  checkRole("PLATFORM_ADMIN"),
  validateRequest({ params: courseIdParamsSchema }),
  controller.deleteCourse,
);
