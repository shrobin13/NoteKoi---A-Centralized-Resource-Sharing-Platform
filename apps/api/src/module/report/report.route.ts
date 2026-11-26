import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./report.controller.js";
import { fileReportSchema, listReportsQuerySchema, reportIdParamsSchema } from "./report.validation.js";

export const reportRouter = Router();

reportRouter.post("/", checkAuth, validateRequest({ body: fileReportSchema }), controller.fileReport);
reportRouter.get("/", checkAuth, validateRequest({ query: listReportsQuerySchema }), controller.listReports);
reportRouter.post(
  "/:id/resolve",
  checkAuth,
  validateRequest({ params: reportIdParamsSchema }),
  controller.resolveReport,
);
reportRouter.post(
  "/:id/dismiss",
  checkAuth,
  validateRequest({ params: reportIdParamsSchema }),
  controller.dismissReport,
);