import type { Prisma } from "../../generated/prisma/client.js";
import type { AudienceType } from "../../generated/prisma/enums.js";
import { isClassRepresentative, isPlatformAdmin, type AuthUser } from "./authz.js";

/**
 * S3-B1 — THE resource access matrix (Appendix A.3).
 *
 * Every read of `Resource` goes through this module. No audience decision is
 * allowed anywhere else, so there is exactly one place to audit when the matrix
 * changes. "Normal browsing" always means `state = APPROVED` **and** a current
 * version that is `APPROVED` (D10); the two non-browse entry points are
 * `buildOwnUploadsWhere` (the uploader's own rows, any state) and
 * `buildModerationQueueWhere` (a CR's own batch, items waiting for a decision).
 */

/** How the viewer reached the matrix. Derived from the token, never from input. */
export type ViewerRole = "guest" | "student" | "teacher" | "sub_admin" | "platform_admin";

/** A CR / Co-CR post, i.e. one batch the viewer moderates. */
export interface ModerationScope {
  collegeId: string;
  departmentId: string;
  sessionId: string;
}

export interface Viewer {
  role: ViewerRole;
  /** `null` for guests. */
  userId: string | null;
  /** The viewer's own college (profile first, role as fallback). */
  collegeId: string | null;
  /** Only set for students. */
  departmentId: string | null;
  /** Only set for students — PERMITTED is granted per session. */
  sessionId: string | null;
  /** Students: the "other colleges" opt-in toggle. */
  includeOtherColleges: boolean;
  /** Active CR / Co-CR posts. */
  moderates: ModerationScope[];
  /** Colleges where the viewer holds an active SUB_ADMIN post. */
  subAdminCollegeIds: string[];
  isPlatformAdmin: boolean;
}

export const GUEST_VIEWER: Viewer = {
  role: "guest",
  userId: null,
  collegeId: null,
  departmentId: null,
  sessionId: null,
  includeOtherColleges: false,
  moderates: [],
  subAdminCollegeIds: [],
  isPlatformAdmin: false,
};

const audienceBranch = (
  audience: AudienceType,
  extra: Prisma.ResourceWhereInput = {},
): Prisma.ResourceWhereInput => ({ audience, ...extra });

/**
 * Turns the authenticated user into a viewer. Role precedence follows A.4:
 * Platform Admin → Sub Admin → teacher → student; the profile decides the
 * college, the active roles decide duties.
 */
export const viewerFromAuth = (auth: AuthUser | null | undefined): Viewer => {
  if (!auth) return GUEST_VIEWER;

  const admin = isPlatformAdmin(auth.roles);
  const subAdminCollegeIds = auth.roles
    .filter((role) => role.role === "SUB_ADMIN" && role.collegeId)
    .map((role) => role.collegeId as string);

  const moderates: ModerationScope[] =
    auth.profile?.kind === "student" && isClassRepresentative(auth.roles)
      ? auth.roles
          .filter((role) => (role.role === "CR" || role.role === "CO_CR") && role.collegeId)
          .flatMap((role) =>
            role.departmentId && role.sessionId
              ? [{ collegeId: role.collegeId as string, departmentId: role.departmentId, sessionId: role.sessionId }]
              : [],
          )
      : [];

  const role: ViewerRole = admin
    ? "platform_admin"
    : subAdminCollegeIds.length > 0
      ? "sub_admin"
      : auth.profile?.kind === "teacher"
        ? "teacher"
        : auth.profile?.kind === "student"
          ? "student"
          : "guest";

  return {
    role,
    userId: auth.userId,
    collegeId: auth.profile?.collegeId ?? auth.roles.find((r) => r.collegeId)?.collegeId ?? null,
    departmentId: auth.profile?.kind === "student" ? auth.profile.departmentId : null,
    sessionId: auth.profile?.kind === "student" ? auth.profile.sessionId : null,
    includeOtherColleges: auth.profile?.kind === "student" ? auth.profile.includeOtherColleges : false,
    moderates,
    subAdminCollegeIds,
    isPlatformAdmin: admin,
  };
};

/**
 * The audience part of the matrix, without any state/version filter. Shared with
 * `buildReadableResourceWhere` so a detail read and a list read can never drift.
 */
export const buildAudienceOr = (viewer: Viewer): Prisma.ResourceWhereInput[] => {
  const branches: Prisma.ResourceWhereInput[] = [audienceBranch("PLATFORM")];

  switch (viewer.role) {
    case "guest":
      break;

    case "student": {
      // A.3 row 2/3/5/6: PERMITTED is granted per session, for the viewer's own
      // batch only. Grants are created for sessions of the resource's own
      // department, so a grant is enough — no extra college check.
      if (viewer.sessionId) {
        branches.push(
          audienceBranch("PERMITTED", { batchGrants: { some: { sessionId: viewer.sessionId } } }),
        );
      }

      // A.3 row 2: COLLEGE is same-college by default; row 3: the opt-in toggle
      // widens it to every college (read-only, never write access).
      if (viewer.includeOtherColleges) {
        branches.push(audienceBranch("COLLEGE"));
      } else if (viewer.collegeId) {
        branches.push(audienceBranch("COLLEGE", { collegeId: viewer.collegeId }));
      }
      break;
    }

    case "teacher": {
      // A.3 row 7/8: a teacher sees their own files (PRIVATE included) plus every
      // PLATFORM-approved file. Another teacher's PRIVATE/COLLEGE/PERMITTED is not
      // visible, even inside the same college.
      if (viewer.userId) {
        branches.push({ uploaderId: viewer.userId });
      }
      break;
    }

    case "sub_admin":
    case "platform_admin": {
      // A.3 row 9/11: routine browsing is PLATFORM only. Sub Admins reach other
      // items through the resolution path, Platform Admins through the logged
      // override — both are explicit, see `buildReadableResourceWhere`.
      if (viewer.userId) {
        branches.push({ uploaderId: viewer.userId });
      }
      break;
    }
  }

  return branches;
};

/** Normal browsing predicate: approved resource + approved current version. */
export const buildVisibilityWhere = (viewer: Viewer): Prisma.ResourceWhereInput => ({
  state: "APPROVED",
  currentVersion: { state: "APPROVED" },
  OR: buildAudienceOr(viewer),
});

/** The uploader's own rows, any state — "My uploads" only. */
export const buildOwnUploadsWhere = (viewer: Viewer): Prisma.ResourceWhereInput => {
  if (!viewer.userId) {
    // A guest has no own uploads; `id: { in: [] }` keeps the query type-safe and empty.
    return { id: { in: [] } };
  }

  return { uploaderId: viewer.userId, state: { not: "DELETED" } };
};

/** The CR / Co-CR moderation queue: student uploads waiting on their own batches. */
export const buildModerationQueueWhere = (viewer: Viewer): Prisma.ResourceWhereInput => ({
  state: { in: ["PENDING", "IN_REVIEW"] },
  uploaderType: "STUDENT",
  OR: viewer.moderates.map((scope) => ({ ...scope })),
});

/** True when the resource sits inside one of the viewer's moderation scopes. */
export const moderatesResource = (
  viewer: Viewer,
  resource: { collegeId: string; departmentId: string; sessionId: string; uploaderType: string },
): boolean =>
  resource.uploaderType === "STUDENT" &&
  viewer.moderates.some(
    (scope) =>
      scope.collegeId === resource.collegeId &&
      scope.departmentId === resource.departmentId &&
      scope.sessionId === resource.sessionId,
  );

/**
 * A single-resource read (detail + proxied download).
 *
 * Browse rules still apply, but the row no longer has to be `APPROVED`: the
 * uploader always reads their own file (including PENDING/REJECTED) and a CR
 * reads the student uploads of their own batches so they can decide on them.
 * `resolution` is the Sub Admin path (report / escalation handling) and
 * `override` is the Platform Admin exceptional read — both must be requested
 * explicitly and are audited by the caller (A.4).
 */
export const buildReadableResourceWhere = (
  viewer: Viewer,
  options: { resolution?: boolean; override?: boolean } = {},
): Prisma.ResourceWhereInput => {
  const branches: Prisma.ResourceWhereInput[] = buildAudienceOr(viewer).map((branch) => ({
    ...branch,
    state: "APPROVED",
    currentVersion: { state: "APPROVED" },
  }));

  // Own uploads, any state.
  if (viewer.userId) {
    branches.push({ uploaderId: viewer.userId });
  }

  // CR / Co-CR: the batches they moderate, any state (but student uploads only).
  for (const scope of viewer.moderates) {
    branches.push({ ...scope, uploaderType: "STUDENT" });
  }

  // Sub Admin resolving a report/escalation: COLLEGE + PERMITTED items of their
  // own college, never PRIVATE (A.3 row 10).
  if (options.resolution) {
    for (const collegeId of viewer.subAdminCollegeIds) {
      branches.push({ collegeId, audience: { in: ["COLLEGE", "PERMITTED"] } });
    }
  }

  // Platform Admin override: every item, any state (A.3 row 12).
  if (options.override && viewer.isPlatformAdmin) {
    branches.push({});
  }

  return { state: { not: "DELETED" }, OR: branches };
};

/** True when the viewer may edit / re-upload a row (uploader only, plus override). */
export const ownsResource = (viewer: Viewer, resource: { uploaderId: string }): boolean =>
  viewer.userId !== null && viewer.userId === resource.uploaderId;
