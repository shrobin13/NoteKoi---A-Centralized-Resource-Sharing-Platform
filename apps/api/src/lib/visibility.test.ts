import { describe, expect, it } from "vitest";
import type { Prisma } from "../../generated/prisma/client.js";
import type { AudienceType } from "../../generated/prisma/enums.js";
import type { AuthUser } from "./authz.js";
import {
  GUEST_VIEWER,
  buildModerationQueueWhere,
  buildOwnUploadsWhere,
  buildReadableResourceWhere,
  buildVisibilityWhere,
  moderatesResource,
  ownsResource,
  viewerFromAuth,
  type Viewer,
} from "./visibility.js";


/**
 * S3-B1 — one `it()` per cell of the Appendix A.3 matrix.
 *
 * The matrix is expressed as data, so a cell can only be "implemented" by the
 * where-builder; these tests read the produced where fragment and assert which
 * audience branches the cell can reach.
 */

interface BranchShape {
  audience?: AudienceType | { in?: readonly AudienceType[] };
  collegeId?: string;
  departmentId?: string;
  sessionId?: string;
  uploaderId?: string;
  uploaderType?: string;
  state?: string;
  currentVersion?: { state?: string };
  batchGrants?: { some?: { sessionId?: string } };
}

const branches = (where: Prisma.ResourceWhereInput): BranchShape[] =>
  (where.OR ?? []) as unknown as BranchShape[];

const branchFor = (where: Prisma.ResourceWhereInput, audience: AudienceType): BranchShape | undefined =>
  branches(where).find((branch) => branch.audience === audience);

const hasAudience = (where: Prisma.ResourceWhereInput, audience: AudienceType): boolean =>
  branchFor(where, audience) !== undefined;

const owns = (where: Prisma.ResourceWhereInput, userId: string): boolean =>
  (where as { uploaderId?: unknown }).uploaderId === userId ||
  branches(where).some((branch) => branch.uploaderId === userId);

const COLLEGE_A = "college-a";
const COLLEGE_B = "college-b";
const CSE = "dept-cse";
const CSE_2022 = "session-cse-2022";
const CSE_2021 = "session-cse-2021";

const guest = GUEST_VIEWER;

const studentSameCollege = (over: Partial<Viewer> = {}): Viewer => ({
  role: "student",
  userId: "student-1",
  collegeId: COLLEGE_A,
  departmentId: CSE,
  sessionId: CSE_2022,
  includeOtherColleges: false,
  moderates: [],
  subAdminCollegeIds: [],
  isPlatformAdmin: false,
  ...over,
});

const studentOtherCollege = (over: Partial<Viewer> = {}): Viewer =>
  studentSameCollege({ userId: "student-b", collegeId: COLLEGE_B, ...over });

const cr = (over: Partial<Viewer> = {}): Viewer =>
  studentSameCollege({
    userId: "cr-1",
    moderates: [{ collegeId: COLLEGE_A, departmentId: CSE, sessionId: CSE_2022 }],
    ...over,
  });

const crOldBatch = (): Viewer =>
  cr({
    userId: "cr-old",
    sessionId: CSE_2021,
    moderates: [{ collegeId: COLLEGE_A, departmentId: CSE, sessionId: CSE_2021 }],
  });

const teacher = (over: Partial<Viewer> = {}): Viewer => ({
  role: "teacher",
  userId: "teacher-1",
  collegeId: COLLEGE_A,
  departmentId: null,
  sessionId: null,
  includeOtherColleges: false,
  moderates: [],
  subAdminCollegeIds: [],
  isPlatformAdmin: false,
  ...over,
});

const subAdmin = (): Viewer =>
  teacher({ role: "sub_admin", userId: "sub-admin-a", subAdminCollegeIds: [COLLEGE_A] });

const platformAdmin = (): Viewer =>
  teacher({ role: "platform_admin", userId: "admin", collegeId: null, isPlatformAdmin: true });

// ── Row 1 — Guest ──────────────────────────────────────────────────────────────
describe("A.3 row 1 — Guest", () => {
  const where = buildVisibilityWhere(guest);

  it("PRIVATE: no", () => expect(hasAudience(where, "PRIVATE")).toBe(false));
  it("COLLEGE: no", () => expect(hasAudience(where, "COLLEGE")).toBe(false));
  it("PERMITTED: no", () => expect(hasAudience(where, "PERMITTED")).toBe(false));
  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 2 — Student, same college ─────────────────────────────────────────────
describe("A.3 row 2 — Student, same college", () => {
  const viewer = studentSameCollege();
  const where = buildVisibilityWhere(viewer);

  it("PRIVATE: no", () => expect(hasAudience(where, "PRIVATE")).toBe(false));

  it("COLLEGE: yes, pinned to the viewer's own college", () => {
    expect(branchFor(where, "COLLEGE")?.collegeId).toBe(COLLEGE_A);
  });

  it("PERMITTED: yes, only through a grant on the viewer's own session", () => {
    expect(branchFor(where, "PERMITTED")?.batchGrants?.some?.sessionId).toBe(CSE_2022);
  });

  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 3 — Student, other college ────────────────────────────────────────────
describe("A.3 row 3 — Student, other college", () => {
  const optOut = buildVisibilityWhere(studentOtherCollege({ includeOtherColleges: false }));
  const optIn = buildVisibilityWhere(studentOtherCollege({ includeOtherColleges: true }));

  it("PRIVATE: no", () => expect(hasAudience(optOut, "PRIVATE")).toBe(false));

  it("COLLEGE: no for the other colleges while the toggle is off", () => {
    // Own college only: the branch is pinned, so College A's COLLEGE rows stay out.
    const branch = branchFor(optOut, "COLLEGE");
    expect(branch?.collegeId).toBe(COLLEGE_B);
  });

  it("COLLEGE: yes for every college once the toggle is on", () => {
    const branch = branchFor(optIn, "COLLEGE");
    expect(branch).toBeDefined();
    expect(branch?.collegeId).toBeUndefined();
  });

  it("PERMITTED: yes when the viewer's own session holds a grant", () => {
    expect(branchFor(optOut, "PERMITTED")?.batchGrants?.some?.sessionId).toBe(CSE_2022);
  });

  it("PLATFORM: yes", () => expect(hasAudience(optOut, "PLATFORM")).toBe(true));
});

// ── Row 4 — Student, own upload ───────────────────────────────────────────────
describe("A.3 row 4 — Student, own upload", () => {
  const viewer = studentSameCollege();

  it("PRIVATE: n/a — own rows are read through the uploader column, not the matrix", () => {
    expect(hasAudience(buildVisibilityWhere(viewer), "PRIVATE")).toBe(false);
    expect(owns(buildOwnUploadsWhere(viewer), "student-1")).toBe(true);
  });

  it("COLLEGE: yes — a student's own COLLEGE upload sits in their own college", () => {
    expect(branchFor(buildVisibilityWhere(viewer), "COLLEGE")?.collegeId).toBe(COLLEGE_A);
  });

  it("PERMITTED: n/a — the uploader branch of a single-resource read covers it", () => {
    expect(owns(buildReadableResourceWhere(viewer), "student-1")).toBe(true);
  });

  it("PLATFORM: yes", () => expect(hasAudience(buildVisibilityWhere(viewer), "PLATFORM")).toBe(true));
});

// ── Row 5 — CR / Co-CR, own department + session ──────────────────────────────
describe("A.3 row 5 — CR / Co-CR, own batch", () => {
  const viewer = cr();
  const where = buildVisibilityWhere(viewer);

  it("PRIVATE: no", () => expect(hasAudience(where, "PRIVATE")).toBe(false));

  it("COLLEGE: yes (full — the moderation scope reaches PENDING student uploads)", () => {
    expect(branchFor(where, "COLLEGE")?.collegeId).toBe(COLLEGE_A);
    const queue = buildModerationQueueWhere(viewer);
    expect(queue.OR).toEqual([{ collegeId: COLLEGE_A, departmentId: CSE, sessionId: CSE_2022 }]);
    expect(
      moderatesResource(viewer, {
        collegeId: COLLEGE_A,
        departmentId: CSE,
        sessionId: CSE_2022,
        uploaderType: "STUDENT",
      }),
    ).toBe(true);
  });

  it("PERMITTED: yes when the CR's own session holds a grant", () => {
    expect(branchFor(where, "PERMITTED")?.batchGrants?.some?.sessionId).toBe(CSE_2022);
  });

  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 6 — CR / Co-CR, another scope ─────────────────────────────────────────
describe("A.3 row 6 — CR / Co-CR, other batch", () => {
  const viewer = crOldBatch();
  const where = buildVisibilityWhere(viewer);

  it("PRIVATE: no", () => expect(hasAudience(where, "PRIVATE")).toBe(false));

  it("COLLEGE: yes for their own college, exactly like a student", () => {
    expect(branchFor(where, "COLLEGE")?.collegeId).toBe(COLLEGE_A);
  });

  it("PERMITTED: yes for their own session only, like a student", () => {
    expect(branchFor(where, "PERMITTED")?.batchGrants?.some?.sessionId).toBe(CSE_2021);
  });

  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 7 — Teacher, own upload ───────────────────────────────────────────────
describe("A.3 row 7 — Teacher, own upload", () => {
  const viewer = teacher();
  const where = buildVisibilityWhere(viewer);

  it("PRIVATE: yes — the uploader branch covers every state of their own file", () => {
    expect(owns(where, "teacher-1")).toBe(true);
  });

  it("COLLEGE: n/a — teachers never publish COLLEGE, no COLLEGE branch exists", () => {
    expect(hasAudience(where, "COLLEGE")).toBe(false);
  });

  it("PERMITTED: yes — their own PERMITTED file is reachable through the uploader branch", () => {
    expect(owns(where, "teacher-1")).toBe(true);
  });

  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 8 — Teacher, another teacher's upload ─────────────────────────────────
describe("A.3 row 8 — Teacher, another teacher's upload", () => {
  const viewer = teacher();
  const where = buildVisibilityWhere(viewer);

  it("PRIVATE: no", () => expect(hasAudience(where, "PRIVATE")).toBe(false));

  it("COLLEGE: no, not even inside the same college", () => {
    expect(hasAudience(where, "COLLEGE")).toBe(false);
  });

  it("PERMITTED: no", () => expect(hasAudience(where, "PERMITTED")).toBe(false));

  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 9 — Sub Admin, routine browse ─────────────────────────────────────────
describe("A.3 row 9 — Sub Admin, routine browse", () => {
  const where = buildVisibilityWhere(subAdmin());

  it("PRIVATE: no", () => expect(hasAudience(where, "PRIVATE")).toBe(false));
  it("COLLEGE: no", () => expect(hasAudience(where, "COLLEGE")).toBe(false));
  it("PERMITTED: no", () => expect(hasAudience(where, "PERMITTED")).toBe(false));
  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 10 — Sub Admin, queued / reported item ────────────────────────────────
describe("A.3 row 10 — Sub Admin, resolving an item", () => {
  const resolution = buildReadableResourceWhere(subAdmin(), { resolution: true });
  const routine = buildVisibilityWhere(subAdmin());

  it("PRIVATE: no, never — resolution stops at COLLEGE/PERMITTED", () => {
    expect(branches(resolution).some((branch) => branch.audience === "PRIVATE")).toBe(false);
  });

  it("COLLEGE: yes inside their own college while resolving", () => {
    const branch = branches(resolution).find(
      (candidate) =>
        candidate.collegeId === COLLEGE_A &&
        typeof candidate.audience === "object" &&
        candidate.audience?.in?.includes("COLLEGE"),
    );
    expect(branch).toBeDefined();
  });

  it("PERMITTED: yes inside their own college while resolving", () => {
    const branch = branches(resolution).find(
      (candidate) =>
        candidate.collegeId === COLLEGE_A &&
        typeof candidate.audience === "object" &&
        candidate.audience?.in?.includes("PERMITTED"),
    );
    expect(branch).toBeDefined();
  });

  it("PLATFORM: yes", () => expect(hasAudience(routine, "PLATFORM")).toBe(true));
});

// ── Row 11 — Platform Admin, routine browse ───────────────────────────────────
describe("A.3 row 11 — Platform Admin, routine browse", () => {
  const where = buildVisibilityWhere(platformAdmin());

  it("PRIVATE: no", () => expect(hasAudience(where, "PRIVATE")).toBe(false));
  it("COLLEGE: no", () => expect(hasAudience(where, "COLLEGE")).toBe(false));
  it("PERMITTED: no", () => expect(hasAudience(where, "PERMITTED")).toBe(false));
  it("PLATFORM: yes", () => expect(hasAudience(where, "PLATFORM")).toBe(true));
});

// ── Row 12 — Platform Admin, exceptional override ─────────────────────────────
describe("A.3 row 12 — Platform Admin override", () => {
  const override = buildReadableResourceWhere(platformAdmin(), { override: true });
  const routine = buildVisibilityWhere(platformAdmin());

  it("PRIVATE: yes, the override branch matches every row", () => {
    expect(branches(override).some((branch) => Object.keys(branch).length === 0)).toBe(true);
  });

  it("COLLEGE: yes through the same override branch", () => {
    expect(branches(override).some((branch) => Object.keys(branch).length === 0)).toBe(true);
  });

  it("PERMITTED: yes through the same override branch", () => {
    expect(branches(override).some((branch) => Object.keys(branch).length === 0)).toBe(true);
  });

  it("PLATFORM: yes, and routine browsing stays PLATFORM-only", () => {
    expect(hasAudience(routine, "PLATFORM")).toBe(true);
    expect(hasAudience(routine, "PRIVATE")).toBe(false);
  });
});

// ── Viewer derivation + non-browse entry points ───────────────────────────────
const authUser = (over: Partial<AuthUser> = {}): AuthUser => ({
  userId: "user-1",
  jti: "jti-1",
  tokenExpiresAt: 0,
  name: "Demo",
  email: "demo@college-a.edu",
  type: "STUDENT",
  accountStatus: "ACTIVE",
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  profile: {
    kind: "student",
    id: "profile-1",
    collegeId: COLLEGE_A,
    departmentId: CSE,
    sessionId: CSE_2022,
    regNo: "A-CSE-2201",
    includeOtherColleges: false,
    verificationStatus: "ACTIVE",
  },
  roles: [],
  ...over,
});

describe("viewerFromAuth", () => {
  it("a missing token becomes the guest viewer", () => {
    expect(viewerFromAuth(null).role).toBe("guest");
    expect(viewerFromAuth(undefined).userId).toBeNull();
  });

  it("a student keeps their college, department and session", () => {
    const viewer = viewerFromAuth(authUser());
    expect(viewer).toMatchObject({
      role: "student",
      collegeId: COLLEGE_A,
      departmentId: CSE,
      sessionId: CSE_2022,
      includeOtherColleges: false,
    });
  });

  it("the other-college toggle is read from the profile", () => {
    const viewer = viewerFromAuth(
      authUser({
        profile: {
          kind: "student",
          id: "profile-b",
          collegeId: COLLEGE_B,
          departmentId: CSE,
          sessionId: CSE_2022,
          regNo: "B-CSE-2202",
          includeOtherColleges: true,
          verificationStatus: "ACTIVE",
        },
      }),
    );

    expect(viewer.includeOtherColleges).toBe(true);
    expect(viewerFromAuth(authUser()).includeOtherColleges).toBe(false);
  });

  it("a CR moderates exactly the batches named by their active CR / Co-CR posts", () => {
    const viewer = viewerFromAuth(
      authUser({
        roles: [
          {
            id: "role-1",
            role: "CR",
            scope: "DEPARTMENT_SESSION",
            collegeId: COLLEGE_A,
            departmentId: CSE,
            sessionId: CSE_2022,
            expiresAt: null,
            collegeName: null,
            departmentName: null,
            sessionName: null,
          },
        ],
      }),
    );

    expect(viewer.role).toBe("student");
    expect(viewer.moderates).toEqual([
      { collegeId: COLLEGE_A, departmentId: CSE, sessionId: CSE_2022 },
    ]);
  });

  it("a teacher profile without a CR post moderates nothing", () => {
    const viewer = viewerFromAuth(
      authUser({
        type: "TEACHER",
        profile: {
          kind: "teacher",
          id: "teacher-profile",
          collegeId: COLLEGE_A,
          departmentIds: [CSE],
          verificationStatus: "ACTIVE",
        },
      }),
    );

    expect(viewer.role).toBe("teacher");
    expect(viewer.moderates).toEqual([]);
    expect(viewer.departmentId).toBeNull();
  });

  it("a SUB_ADMIN post wins over the teacher profile and records the college", () => {
    const viewer = viewerFromAuth(
      authUser({
        type: "TEACHER",
        profile: {
          kind: "teacher",
          id: "sub-admin-profile",
          collegeId: COLLEGE_A,
          departmentIds: [CSE],
          verificationStatus: "ACTIVE",
        },
        roles: [
          {
            id: "role-2",
            role: "SUB_ADMIN",
            scope: "COLLEGE",
            collegeId: COLLEGE_A,
            departmentId: null,
            sessionId: null,
            expiresAt: null,
            collegeName: null,
            departmentName: null,
            sessionName: null,
          },
        ],
      }),
    );

    expect(viewer.role).toBe("sub_admin");
    expect(viewer.subAdminCollegeIds).toEqual([COLLEGE_A]);
  });

  it("a PLATFORM_ADMIN post wins over every other role (A.4)", () => {
    const viewer = viewerFromAuth(
      authUser({
        type: "PLATFORM_ADMIN",
        profile: null,
        roles: [
          {
            id: "role-3",
            role: "PLATFORM_ADMIN",
            scope: "PLATFORM",
            collegeId: null,
            departmentId: null,
            sessionId: null,
            expiresAt: null,
            collegeName: null,
            departmentName: null,
            sessionName: null,
          },
        ],
      }),
    );

    expect(viewer.role).toBe("platform_admin");
    expect(viewer.isPlatformAdmin).toBe(true);
  });
});

describe("non-browse entry points", () => {
  it("a guest owns no uploads", () => {
    expect(buildOwnUploadsWhere(guest)).toEqual({ id: { in: [] } });
  });

  it("own uploads never filter by state except DELETED", () => {
    expect(buildOwnUploadsWhere(studentSameCollege())).toEqual({
      uploaderId: "student-1",
      state: { not: "DELETED" },
    });
  });

  it("the moderation queue is empty when the viewer moderates nothing", () => {
    expect(buildModerationQueueWhere(teacher()).OR).toEqual([]);
  });

  it("every read excludes DELETED rows", () => {
    expect(buildReadableResourceWhere(studentSameCollege()).state).toEqual({ not: "DELETED" });
  });

  it("only the uploader may edit or re-upload", () => {
    expect(ownsResource(studentSameCollege(), { uploaderId: "student-1" })).toBe(true);
    expect(ownsResource(studentSameCollege(), { uploaderId: "student-2" })).toBe(false);
    expect(ownsResource(guest, { uploaderId: "student-1" })).toBe(false);
  });
});
