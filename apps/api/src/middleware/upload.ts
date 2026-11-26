import type { RequestHandler } from "express";
import multer, { MulterError } from "multer";
import { config } from "../config/index.js";
import { AppError } from "../utils/AppError.js";

/**
 * S3-B3 — multipart parsing for the upload routes.
 *
 * Files are buffered in memory (multer `memoryStorage`) and never written to
 * disk by Express: `lib/drive.ts` is the only writer, and the 50 MB cap from
 * `MAX_UPLOAD_MB` is enforced here before a single byte reaches the storage
 * layer. The MIME/extension allow-list is Q2 in the playbook
 * (pdf, doc/docx, ppt/pptx, png/jpg).
 */

export interface AllowedFileType {
  mimeType: string;
  extensions: readonly string[];
}

export const ALLOWED_FILE_TYPES: readonly AllowedFileType[] = [
  { mimeType: "application/pdf", extensions: ["pdf"] },
  { mimeType: "application/msword", extensions: ["doc"] },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
  },
  { mimeType: "application/vnd.ms-powerpoint", extensions: ["ppt"] },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: ["pptx"],
  },
  { mimeType: "image/png", extensions: ["png"] },
  { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"] },
];

/** Lower-case extension without the dot, or `""` when the name has none. */
export const extensionOf = (fileName: string): string => {
  const dot = fileName.lastIndexOf(".");

  if (dot <= 0 || dot === fileName.length - 1) return "";

  return fileName.slice(dot + 1).toLowerCase();
};

/** MIME type *and* extension must both be on the allow-list. */
const isAllowedFile = (file: { mimetype?: string; originalname?: string }): boolean => {
  const match = ALLOWED_FILE_TYPES.find((type) => type.mimeType === file.mimetype);

  if (!match) return false;

  return match.extensions.includes(extensionOf(file.originalname ?? ""));
};

const unsupportedType = (): AppError =>
  AppError.badRequest(
    `Unsupported file type. Allowed: ${ALLOWED_FILE_TYPES.map((type) => type.extensions.join("/")).join(", ")}`,
    "UNSUPPORTED_FILE_TYPE",
  );

const megabytes = (bytes: number): number => Math.max(1, Math.round(bytes / (1024 * 1024)));

const uploadWith = (maxBytes: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, callback) => {
      if (!isAllowedFile(file)) {
        callback(unsupportedType());

        return;
      }

      callback(null, true);
    },
  });

/**
 * Accepts exactly one file on `fieldName` and turns multer's failures into the
 * project error contract (`AppError` → `{ success:false, message, code }`).
 * `maxBytes` is injectable so a test can prove the cap without a 50 MB body.
 */
export const singleFile = (
  fieldName = "file",
  maxBytes = config.maxUploadBytes,
): RequestHandler => {
  const parse = uploadWith(maxBytes).single(fieldName);

  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      if (!error) {
        next();

        return;
      }

      if (error instanceof AppError) {
        next(error);

        return;
      }

      if (error instanceof MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          next(
            AppError.badRequest(
              `File is too large. The limit is ${megabytes(maxBytes)} MB`,
              "FILE_TOO_LARGE",
            ),
          );

          return;
        }

        next(AppError.badRequest(`Upload rejected: ${error.message}`, "INVALID_UPLOAD"));

        return;
      }

      next(error);
    });
  };
};
