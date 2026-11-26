import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as folderService from "./folder.service.js";
import type { CreateFolderInput, ListFoldersQuery, UpdateFolderInput } from "./folder.validation.js";

interface FolderIdParams {
  id: string;
}

export const listFolders: RequestHandler = async (req, res) => {
  const { query } = getValidated<never, ListFoldersQuery>(res);
  const result = await folderService.listFolders(requireAuth(req), query);

  sendResponse(res, { message: "Folders loaded", data: result.items });
};

export const createFolder: RequestHandler = async (req, res) => {
  const { body } = getValidated<CreateFolderInput>(res);
  const folder = await folderService.createFolder(requireAuth(req), body);

  sendResponse(res, { message: "Folder created", data: folder, statusCode: 201 });
};

export const updateFolder: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<UpdateFolderInput, never, FolderIdParams>(res);
  const folder = await folderService.updateFolder(requireAuth(req), params.id, body);

  sendResponse(res, { message: "Folder updated", data: folder });
};

export const deleteFolder: RequestHandler = async (req, res) => {
  const { params } = getValidated<never, never, FolderIdParams>(res);
  const result = await folderService.deleteFolder(requireAuth(req), params.id);

  sendResponse(res, { message: "Folder deleted", data: result });
};