import type { RequestHandler } from "express";
import { resolveAuthUser } from "./checkAuth.js";

/**
 * S2-B1 — public list endpoints that show more to a privileged viewer
 * (`?status=all` for admins). A valid session is attached when present;
 * anything else (no cookie, expired token, Redis outage) degrades to guest,
 * so a public page never 401s because of a stale browser cookie.
 *
 * Never use it where the viewer decides *whose* data is returned — those
 * routes use `checkAuth` + `checkRole`.
 */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    req.auth = await resolveAuthUser(req);
  } catch {
    req.auth = undefined;
  }

  next();
};
