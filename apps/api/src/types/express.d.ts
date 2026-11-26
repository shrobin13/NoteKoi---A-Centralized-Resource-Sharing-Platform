import type { AuthRole, AuthUser } from "../lib/authz.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `checkAuth`; read it through `requireAuth(req)` inside controllers. */
      auth?: AuthUser;
      /** Extra fields some modules attach for audit logging. */
      authRole?: AuthRole;
      /** Set by `checkUploadAuth` when the file body came with an upload token (D21). */
      uploadToken?: { jti: string; expiresAt: number };
    }
  }
}

export {};
