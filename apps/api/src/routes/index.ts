import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { pingRedis } from "../lib/redis.js";
import { authRouter } from "../module/auth/auth.route.js";
import { collegeRouter } from "../module/college/college.route.js";
import { courseRouter } from "../module/course/course.route.js";
import { departmentRouter } from "../module/department/department.route.js";
import { deletionRouter } from "../module/deletion/deletion.route.js";
import { folderRouter } from "../module/folder/folder.route.js";
import { moderationRouter } from "../module/moderation/moderation.route.js";
import { notificationRouter } from "../module/notification/notification.route.js";
import { reportRouter } from "../module/report/report.route.js";
import { resourceRouter } from "../module/resource/resource.route.js";
import { sessionRouter } from "../module/session/session.route.js";
import { userRouter } from "../module/user/user.route.js";
import { sendResponse } from "../utils/sendResponse.js";

/**
 * Root router.
 * - `GET /health` (unversioned, for hosts and the Slice 0 gate)
 * - `GET/POST /api/v1/...` module routers are mounted here from Slice 1 on,
 *   e.g. `apiRouter.use("/api/v1/auth", authRouter)`.
 */
export const apiRouter = Router();

// Slice 1 modules. Everything except /health lives under /api/v1.
apiRouter.use("/api/v1/auth", authRouter);
apiRouter.use("/api/v1/colleges", collegeRouter);
apiRouter.use("/api/v1/departments", departmentRouter);

// Slice 2 modules (academic structure A.1–A.4).
apiRouter.use("/api/v1/sessions", sessionRouter);
apiRouter.use("/api/v1/courses", courseRouter);
apiRouter.use("/api/v1/users", userRouter);
apiRouter.use("/api/v1/folders", folderRouter);

// Slice 3 modules (resources and files).
apiRouter.use("/api/v1/resources", resourceRouter);
apiRouter.use("/api/v1/notifications", notificationRouter);
apiRouter.use("/api/v1/moderation", moderationRouter);
apiRouter.use("/api/v1/reports", reportRouter);
apiRouter.use("/api/v1/deletions", deletionRouter);

async function isDatabaseUp(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

apiRouter.get("/health", async (_req, res) => {
  const [database, cache] = await Promise.all([isDatabaseUp(), pingRedis()]);
  const healthy = database && cache;
  const status = { database: database ? "ok" : "down", redis: cache ? "ok" : "down" };

  if (!healthy) {
    res.status(503).json({
      success: false,
      message: "API is degraded",
      code: "DEPENDENCY_UNAVAILABLE",
      errors: [status],
    });
    return;
  }

  sendResponse(res, {
    message: "API is healthy",
    data: { ...status, uptimeSeconds: Math.round(process.uptime()) },
  });
});
