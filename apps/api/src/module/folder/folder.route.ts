import { Router } from "express";
import { checkAuth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import * as controller from "./folder.controller.js";
import {
  createFolderSchema,
  folderIdParamsSchema,
  listFoldersQuerySchema,
  updateFolderSchema,
} from "./folder.validation.js";

export const folderRouter = Router();

folderRouter.use(checkAuth);

folderRouter.get("/", validateRequest({ query: listFoldersQuerySchema }), controller.listFolders);
folderRouter.post("/", validateRequest({ body: createFolderSchema }), controller.createFolder);
folderRouter.patch(
  "/:id",
  validateRequest({ params: folderIdParamsSchema, body: updateFolderSchema }),
  controller.updateFolder,
);
folderRouter.delete("/:id", validateRequest({ params: folderIdParamsSchema }), controller.deleteFolder);