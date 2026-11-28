/**
 * Development seed (S1-B14, expanded into the full demo dataset).
 *
 * What it creates
 * - College A "NoteKoi Demo College": departments CSE + EEE, three sessions, five courses.
 * - College B "Second Demo College": adopts CSE only, one session.
 * - One account per rule the app can exercise: platform admin, two Sub Admins, four
 *   CR/Co-CR holders, students in every state/batch/college (ACTIVE, PENDING, REJECTED,
 *   unverified email, suspended, other college with and without includeOtherColleges),
 *   and teachers (single, multi-department, pending, other college).
 * - Twelve resources: every audience paired with PENDING, APPROVED, and REJECTED.
 *
 * Idempotent: every run tears the demo namespace down and rebuilds it, so the printed
 * table always matches the database (`npm run db:seed` as often as you like).
 * Development only: it refuses to run with NODE_ENV=production.
 *
 * Every account uses `SEED_PASSWORD` from apps/api/.env — the password is never printed.
 */
import { randomUUID } from "node:crypto";
import { config } from "../src/config/index.js";
import { removeStoredFile, sha256, storeFile, type StoredObject } from "../src/lib/drive.js";
import { hashPassword } from "../src/lib/hash.js";
import { prisma } from "../src/lib/prisma.js";
import type { AudienceType, UploaderType } from "../generated/prisma/enums.js";

if (config.isProduction) {
  throw new Error("prisma/seed.ts is a development seed and refuses to run with NODE_ENV=production");
}

const seedPassword = config.seedPassword;

if (!seedPassword) {
  throw new Error("SEED_PASSWORD is missing. Add it to apps/api/.env (see .env.example).");
}

const DEMO_EMAIL_DOMAIN = "@notekoi.local";
const demoEmail = (localPart: string): string => `${localPart}${DEMO_EMAIL_DOMAIN}`;

/** Structure names; the printed table and the playbook quote them verbatim. */
const COLLEGE_A = "NoteKoi Demo College";
const COLLEGE_B = "Second Demo College";
const DEPT_CSE = "CSE";
const DEPT_EEE = "EEE";
const SESSION_CSE_2021_22 = "CSE 2021-22";
const SESSION_CSE_2022_23 = "CSE 2022-23";
const SESSION_EEE_2022_23 = "EEE 2022-23";

/** The account list is the contract — everything below is built from it. */
const ACCOUNTS = {
  admin: demoEmail("admin"),
  subAdminA: demoEmail("subadmin"),
  subAdminB: demoEmail("subadmin-b"),
  cr: demoEmail("cr"),
  coCr: demoEmail("cocr"),
  crOld: demoEmail("cr-old"),
  crEee: demoEmail("cr-eee"),
  student1: demoEmail("student1"),
  student2: demoEmail("student2"),
  studentOld: demoEmail("student-old"),
  studentEee: demoEmail("student-eee"),
  studentB: demoEmail("student-b"),
  studentBOptIn: demoEmail("student-b-optin"),
  studentPending: demoEmail("student-pending"),
  studentRejected: demoEmail("student-rejected"),
  studentNoEmail: demoEmail("student-noemail"),
  teacher1: demoEmail("teacher1"),
  teacher2: demoEmail("teacher2"),
  teacherMulti: demoEmail("teacher-multi"),
  teacherDiscrete: demoEmail("teacher-discrete"),
  teacherB: demoEmail("teacher-b"),
  teacherPending: demoEmail("teacher-pending"),
  suspended: demoEmail("suspended"),
} as const;

/**
 * The S1/S2 seed shipped a different layout (`student@`, `student7@`, a second college called
 * "NoteKoi Demo Institute of Technology", the departments "Computer Science"/"Electrical
 * Engineering"). None of it may survive a run of this script, otherwise the printed demo table
 * would lie about what is actually in the database. `student2`/`teacher2` are excluded on
 * purpose: those local parts exist in the new layout too and are simply re-seeded.
 */
const LEGACY_ACCOUNT_EMAILS = [
  "student",
  "student3",
  "student4",
  "student5",
  "student6",
  "student7",
  "teacher",
  "teacher3",
].map(demoEmail);

const LEGACY_COLLEGES = ["NoteKoi Demo Institute of Technology"];
const LEGACY_DEPARTMENTS = ["Computer Science", "Electrical Engineering"];
const LEGACY_SESSIONS = ["Session 2024-2025", "Session 2025-2026"];
const LEGACY_COURSES = ["Data Structures", "Algorithms", "Circuit Analysis"];

type DemoRow = {
  email: string;
  role: string;
  college: string;
  department: string;
  session: string;
  note: string;
};

/** Printed at the end of the run and copied into the playbook (Section 6 → DEMO ACCOUNTS). */
const DEMO_ROWS: readonly DemoRow[] = [
  {
    email: ACCOUNTS.admin,
    role: "Platform Admin",
    college: "—",
    department: "—",
    session: "—",
    note: "every /admin/* screen, Sub Admin appointment + emergency replacement, `?status=all`",
  },
  {
    email: ACCOUNTS.subAdminA,
    role: "Sub Admin (TEACHER)",
    college: "College A",
    department: "CSE",
    session: "—",
    note: "teacher queue, appoint/revoke CR + Co-CR, teacher departments",
  },
  {
    email: ACCOUNTS.subAdminB,
    role: "Sub Admin (TEACHER)",
    college: "College B",
    department: "CSE",
    session: "—",
    note: "same screens, College B scope only — College A rows must be invisible",
  },
  {
    email: ACCOUNTS.cr,
    role: "CR (ACTIVE student)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "approve/reject student-pending; the queue holds this batch only",
  },
  {
    email: ACCOUNTS.coCr,
    role: "Co-CR (ACTIVE student)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "identical powers; the Co-CR slot is taken → 409 ROLE_SLOT_TAKEN",
  },
  {
    email: ACCOUNTS.crOld,
    role: "CR (ACTIVE student)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2021_22,
    note: "old batch: must not see the 2022-23 queue",
  },
  {
    email: ACCOUNTS.crEee,
    role: "CR (ACTIVE student)",
    college: "College A",
    department: "EEE",
    session: SESSION_EEE_2022_23,
    note: "EEE queue only",
  },
  {
    email: ACCOUNTS.student1,
    role: "Student (ACTIVE)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "plain student: no admin link, 403 FORBIDDEN_ROLE on /users/*",
  },
  {
    email: ACCOUNTS.student2,
    role: "Student (ACTIVE)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "second seat of the batch (a second approve/reject target)",
  },
  {
    email: ACCOUNTS.studentOld,
    role: "Student (ACTIVE)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2021_22,
    note: "other batch: invisible to cr, visible to cr-old",
  },
  {
    email: ACCOUNTS.studentEee,
    role: "Student (ACTIVE)",
    college: "College A",
    department: "EEE",
    session: SESSION_EEE_2022_23,
    note: "other department: invisible to cr",
  },
  {
    email: ACCOUNTS.studentB,
    role: "Student (ACTIVE)",
    college: "College B",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "other college, includeOtherColleges OFF",
  },
  {
    email: ACCOUNTS.studentBOptIn,
    role: "Student (ACTIVE)",
    college: "College B",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "includeOtherColleges ON (from S3: cross-college read-only)",
  },
  {
    email: ACCOUNTS.studentPending,
    role: "Student (PENDING_VERIFICATION)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "sits in the CR queue; approve → ACTIVE",
  },
  {
    email: ACCOUNTS.studentRejected,
    role: "Student (REJECTED)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "shows the stored rejected reason",
  },
  {
    email: ACCOUNTS.studentNoEmail,
    role: "Student (email NOT verified)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "login → 403 EMAIL_NOT_VERIFIED",
  },
  {
    email: ACCOUNTS.teacher1,
    role: "Teacher (ACTIVE)",
    college: "College A",
    department: "CSE",
    session: "—",
    note: "S3 uploader; also a Sub Admin candidate",
  },
  {
    email: ACCOUNTS.teacher2,
    role: "Teacher (ACTIVE)",
    college: "College A",
    department: "CSE",
    session: "—",
    note: "second teacher of the same department",
  },
  {
    email: ACCOUNTS.teacherMulti,
    role: "Teacher (ACTIVE)",
    college: "College A",
    department: "CSE + EEE",
    session: "—",
    note: "two taught departments (1–20 rule)",
  },
  {
    email: ACCOUNTS.teacherB,
    role: "Teacher (ACTIVE)",
    college: "College B",
    department: "CSE",
    session: "—",
    note: "other-college teacher",
  },
  {
    email: ACCOUNTS.teacherDiscrete,
    role: "Teacher (ACTIVE)",
    college: "College A",
    department: "CSE",
    session: "—",
    note: "assigned to Discrete Math in Semester 3",
  },
  {
    email: ACCOUNTS.teacherPending,
    role: "Teacher (PENDING_VERIFICATION)",
    college: "College A",
    department: "CSE",
    session: "—",
    note: "Sub Admin approves, then assigns 1–2 departments",
  },
  {
    email: ACCOUNTS.suspended,
    role: "Student (SUSPENDED)",
    college: "College A",
    department: "CSE",
    session: SESSION_CSE_2022_23,
    note: "login → 403 ACCOUNT_SUSPENDED",
  },
];

const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    const message = error.message
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    const code = (error as { code?: unknown }).code;
    const prefix = typeof code === "string" ? `${code}: ` : "";
    return `${prefix}${message ?? error.name}`;
  }
  return String(error);
};


interface DemoResourceSeed {
  key: string;
  uploaderId: string;
  uploaderType: UploaderType;
  collegeId: string;
  departmentId: string;
  courseId: string;
  sessionId: string | null;
  audience: AudienceType;
  state: "PENDING" | "APPROVED" | "REJECTED";
  grantSessionIds?: string[];
  semesterCourseId?: string;
  categoryId?: string;
  title?: string;
  resourceType?: string;
  mimeType?: string;
  fileExtension?: string;
  fileSizeBytes?: number;
}

const seedDemoResource = async (sample: DemoResourceSeed): Promise<void> => {
  const mimeType = sample.mimeType ?? "application/pdf";
  const extension = sample.fileExtension ?? "pdf";
  const payload = Buffer.from(`NoteKoi demo resource ${sample.key}\n`, "utf8");
  const buffer = sample.fileSizeBytes
    ? Buffer.alloc(Math.max(payload.length, sample.fileSizeBytes))
    : Buffer.concat([Buffer.from("%PDF-1.4\n"), payload]);
  payload.copy(buffer);
  const contentHash = sha256(buffer);
  const existingFile = await prisma.physicalFile.findUnique({
    where: { contentHash },
    select: { id: true },
  });
  const physicalFileId = existingFile?.id ?? randomUUID();
  let stored: StoredObject | null = null;

  if (!existingFile) {
    stored = await storeFile({
      buffer,
      fileName: `${sample.key}.${extension}`,
      mimeType,
      fileId: physicalFileId,
    });
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (stored) {
        await tx.physicalFile.create({
          data: {
            id: physicalFileId,
            contentHash,
            sizeBytes: BigInt(buffer.length),
            mimeType,
            storageProvider: stored.provider,
            driveFileId: stored.provider === "GOOGLE_DRIVE" ? stored.fileId : null,
            driveFolderId: stored.folderId,
            driveWebViewLink: stored.webViewLink,
            driveWebContentLink: stored.webContentLink,
          },
        });
      }

      const resource = await tx.resource.create({
        data: {
          uploaderId: sample.uploaderId,
          uploaderType: sample.uploaderType,
          collegeId: sample.collegeId,
          departmentId: sample.departmentId,
          courseId: sample.courseId,
          semesterCourseId: sample.semesterCourseId ?? null,
          categoryId: sample.categoryId ?? null,
          sessionId: sample.sessionId,
          title: sample.title ?? `Demo ${sample.audience} ${sample.state} ${sample.key}`,
          description: `Seeded ${sample.state.toLowerCase()} ${sample.audience.toLowerCase()} sample`,
          tags: `demo,${sample.audience.toLowerCase()},${sample.state.toLowerCase()}`,
          resourceType: sample.resourceType ?? "NOTES",
          audience: sample.audience,
          state: sample.state,
        },
        select: { id: true },
      });

      const version = await tx.resourceVersion.create({
        data: {
          resourceId: resource.id,
          versionNo: 1,
          physicalFileId,
          state: sample.state,
          rejectionReason: sample.state === "REJECTED" ? "Seeded rejection for moderation demos." : null,
          uploadedById: sample.uploaderId,
        },
        select: { id: true },
      });

      await tx.resource.update({ where: { id: resource.id }, data: { currentVersionId: version.id } });

      if (sample.grantSessionIds?.length) {
        await tx.resourceBatchGrant.createMany({
          data: sample.grantSessionIds.map((sessionId) => ({
            resourceId: resource.id,
            sessionId,
            collegeId: sample.collegeId,
            departmentId: sample.departmentId,
            grantedById: sample.uploaderId,
          })),
        });
      }
    });
  } catch (error) {
    if (stored) {
      await removeStoredFile({
        id: physicalFileId,
        storageProvider: stored.provider,
        driveFileId: stored.provider === "GOOGLE_DRIVE" ? stored.fileId : null,
      }).catch(() => undefined);
    }

    throw error;
  }
};

const seedDemoResources = async (samples: readonly DemoResourceSeed[]): Promise<void> => {
  const audiences: AudienceType[] = ["PRIVATE", "COLLEGE", "PERMITTED", "PLATFORM"];
  const states: DemoResourceSeed["state"][] = ["PENDING", "APPROVED", "REJECTED"];
  const expected = new Set(audiences.flatMap((audience) => states.map((state) => `${audience}:${state}`)));
  const actual = new Set(samples.map((sample) => `${sample.audience}:${sample.state}`));

  if (actual.size !== expected.size || [...expected].some((entry) => !actual.has(entry))) {
    throw new Error("Demo resources must cover each audience/state combination exactly once");
  }

  for (const sample of samples) await seedDemoResource(sample);

  const demoUserIds = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const count = await prisma.resource.count({ where: { uploaderId: { in: demoUserIds.map((user) => user.id) } } });

  if (count !== samples.length) {
    throw new Error(`Expected ${samples.length} demo resources after seeding, found ${count}`);
  }
};

/**
 * Wipes the demo namespace so a re-run rebuilds exactly the table above:
 * 1. every role row and profile of an `@notekoi.local` account (the S2 screens mutate them),
 * 2. the academic rows the older seed layout created,
 * 3. the accounts of that older layout, when nothing references them yet.
 *
 * Accounts outside `@notekoi.local` (a human's own registrations, the smoke-test rows) are
 * never touched. When such a row still points at a legacy structure the structure is
 * deactivated instead — the same "delete" the API performs.
 */
const resetDemoResources = async (): Promise<void> => {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((user) => user.id);

  if (demoUserIds.length === 0) return;

  const demoResources = await prisma.resource.findMany({
    where: { uploaderId: { in: demoUserIds } },
    select: { id: true },
  });
  const resourceIds = demoResources.map((resource) => resource.id);
  const files = resourceIds.length > 0
    ? await prisma.physicalFile.findMany({
        where: { versions: { some: { resourceId: { in: resourceIds } } } },
        select: { id: true, storageProvider: true, driveFileId: true },
      })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { userId: { in: demoUserIds } } });

    if (resourceIds.length === 0) return;

    await tx.moderationEscalation.deleteMany({ where: { resourceId: { in: resourceIds } } });
    await tx.report.deleteMany({ where: { resourceId: { in: resourceIds } } });
    await tx.deletionRequest.deleteMany({ where: { resourceId: { in: resourceIds } } });
    await tx.comment.deleteMany({ where: { resourceId: { in: resourceIds } } });
    await tx.resourceBatchGrant.deleteMany({ where: { resourceId: { in: resourceIds } } });
    await tx.resource.updateMany({ where: { id: { in: resourceIds } }, data: { currentVersionId: null } });
    await tx.resourceVersion.deleteMany({ where: { resourceId: { in: resourceIds } } });
    await tx.resource.deleteMany({ where: { id: { in: resourceIds } } });
  });

  for (const file of files) {
    const remainingReferences = await prisma.resourceVersion.count({ where: { physicalFileId: file.id } });
    if (remainingReferences > 0) continue;

    await removeStoredFile({ id: file.id, storageProvider: file.storageProvider, driveFileId: file.driveFileId });
    await prisma.physicalFile.deleteMany({ where: { id: file.id } });
  }
};

const resetDemoNamespace = async (): Promise<void> => {
  const demoAccount = { email: { endsWith: DEMO_EMAIL_DOMAIN } };

  await resetDemoResources();

  const demoUsers = await prisma.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } }, select: { id: true } });
  const demoUserIds = demoUsers.map((user) => user.id);
  const demoSemesters = await prisma.semester.findMany({ where: { createdById: { in: demoUserIds } }, select: { id: true } });
  const demoSemesterIds = demoSemesters.map((semester) => semester.id);
  if (demoSemesterIds.length > 0) {
    const demoSemesterCourses = await prisma.semesterCourse.findMany({ where: { semesterId: { in: demoSemesterIds } }, select: { id: true } });
    const demoSemesterCourseIds = demoSemesterCourses.map((entry) => entry.id);
    await prisma.$transaction(async (tx) => {
      await tx.resource.updateMany({ where: { semesterCourseId: { in: demoSemesterCourseIds } }, data: { semesterCourseId: null, categoryId: null } });
      await tx.category.deleteMany({ where: { semesterCourseId: { in: demoSemesterCourseIds } } });
      await tx.semesterCourse.deleteMany({ where: { id: { in: demoSemesterCourseIds } } });
      await tx.semester.deleteMany({ where: { id: { in: demoSemesterIds } } });
    });
  }

  const roles = await prisma.userRole.deleteMany({ where: { user: demoAccount } });
  const students = await prisma.studentProfile.deleteMany({ where: { user: demoAccount } });
  const teachers = await prisma.teacherProfile.deleteMany({ where: { user: demoAccount } });

  let retiredAccounts = 0;

  try {
    const retired = await prisma.user.deleteMany({ where: { email: { in: LEGACY_ACCOUNT_EMAILS } } });
    retiredAccounts = retired.count;
  } catch (error) {
    // An audit row (or anything else a human created) still points at the account: keep it,
    // but make sure it can never be signed into and that it has no profile left.
    await prisma.user.updateMany({
      where: { email: { in: LEGACY_ACCOUNT_EMAILS } },
      data: { accountStatus: "SUSPENDED" },
    });
    console.warn("  ! old demo accounts are still referenced, so they were suspended instead:", describeError(error));
  }

  const legacyDepartments = await prisma.department.findMany({
    where: { name: { in: LEGACY_DEPARTMENTS } },
    select: { id: true },
  });
  const legacyDepartmentIds = legacyDepartments.map((department) => department.id);

  const retireLegacy = async (
    label: string,
    remove: () => Promise<{ count: number }>,
    deactivate?: () => Promise<{ count: number }>,
  ): Promise<void> => {
    try {
      const result = await remove();
      if (result.count > 0) console.log(`  · removed ${result.count} legacy ${label}`);
      return;
    } catch (error) {
      if (!deactivate) {
        console.warn(`  ! kept legacy ${label}: ${describeError(error)}`);
        return;
      }

      const result = await deactivate();
      console.warn(
        `  ! legacy ${label} still referenced (${describeError(error)}) — deactivated ${result.count} instead`,
      );
    }
  };

  if (legacyDepartmentIds.length > 0) {
    const legacySessions = { departmentId: { in: legacyDepartmentIds }, name: { in: LEGACY_SESSIONS } };
    const legacyCourses = { departmentId: { in: legacyDepartmentIds }, name: { in: LEGACY_COURSES } };

    await retireLegacy(
      "sessions",
      () => prisma.session.deleteMany({ where: legacySessions }),
      () => prisma.session.updateMany({ where: legacySessions, data: { isActive: false } }),
    );
    await retireLegacy(
      "courses",
      () => prisma.course.deleteMany({ where: legacyCourses }),
      () => prisma.course.updateMany({ where: legacyCourses, data: { isActive: false } }),
    );
    await retireLegacy("college-department links", () =>
      prisma.collegeDepartment.deleteMany({ where: { departmentId: { in: legacyDepartmentIds } } }),
    );
  }

  await retireLegacy(
    "colleges",
    () => prisma.college.deleteMany({ where: { name: { in: LEGACY_COLLEGES } } }),
    () => prisma.college.updateMany({ where: { name: { in: LEGACY_COLLEGES } }, data: { isActive: false } }),
  );
  await retireLegacy(
    "departments",
    () => prisma.department.deleteMany({ where: { name: { in: LEGACY_DEPARTMENTS } } }),
    () =>
      prisma.department.updateMany({ where: { name: { in: LEGACY_DEPARTMENTS } }, data: { isActive: false } }),
  );

  console.log(
    `  · demo namespace reset: ${roles.count} role rows, ${students.count} student profiles, ` +
      `${teachers.count} teacher profiles, ${retiredAccounts} old accounts removed`,
  );
};

const main = async (): Promise<void> => {
  const passwordHash = await hashPassword(seedPassword);
  const verifiedAt = new Date();

  await resetDemoNamespace();

  // ── Small builders ─────────────────────────────────────────────────────────────
  const upsertCollege = (name: string) =>
    prisma.college.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
      select: { id: true, name: true },
    });

  const upsertDepartment = (name: string) =>
    prisma.department.upsert({
      where: { name },
      update: { isActive: true },
      create: { name },
      select: { id: true, name: true },
    });

  const adopt = (collegeId: string, departmentId: string) =>
    prisma.collegeDepartment.upsert({
      where: { unique_college_department: { collegeId, departmentId } },
      update: {},
      create: { collegeId, departmentId },
    });

  const upsertSession = (departmentId: string, name: string, start: string, end: string) =>
    prisma.session.upsert({
      where: { unique_session_department_name: { departmentId, name } },
      update: { isActive: true, startDate: new Date(start), endDate: new Date(end) },
      create: { departmentId, name, startDate: new Date(start), endDate: new Date(end) },
      select: { id: true, name: true },
    });

  const upsertCourse = (departmentId: string, name: string, semester: number) =>
    prisma.course.upsert({
      where: { unique_course_department_name: { departmentId, name } },
      update: { isActive: true, semester },
      create: { departmentId, name, semester },
    });

  const upsertUser = (input: {
    email: string;
    name: string;
    type: "STUDENT" | "TEACHER" | "PLATFORM_ADMIN";
    emailVerified?: boolean;
    accountStatus?: "ACTIVE" | "SUSPENDED";
  }) => {
    const data = {
      name: input.name,
      passwordHash,
      type: input.type,
      accountStatus: input.accountStatus ?? ("ACTIVE" as const),
      emailVerifiedAt: input.emailVerified === false ? null : verifiedAt,
    };

    return prisma.user.upsert({
      where: { email: input.email },
      update: data,
      create: { email: input.email, ...data },
      select: { id: true, email: true },
    });
  };

  const seedStudent = async (input: {
    userId: string;
    regNo: string;
    collegeId: string;
    departmentId: string;
    sessionId: string;
    status: "PENDING_VERIFICATION" | "REJECTED" | "ACTIVE";
    includeOtherColleges?: boolean;
    rejectedReason?: string;
    rejectedById?: string;
  }): Promise<void> => {
    const rejected = input.status === "REJECTED";

    const data = {
      collegeId: input.collegeId,
      departmentId: input.departmentId,
      sessionId: input.sessionId,
      regNo: input.regNo,
      includeOtherColleges: input.includeOtherColleges ?? false,
      verificationStatus: input.status,
      verifiedAt: input.status === "ACTIVE" ? verifiedAt : null,
      verifiedById: null,
      rejectedReason: rejected ? (input.rejectedReason ?? null) : null,
      rejectedById: rejected ? (input.rejectedById ?? null) : null,
    };

    await prisma.studentProfile.upsert({
      where: { userId: input.userId },
      update: data,
      create: { userId: input.userId, ...data },
    });
  };

  const seedTeacher = async (input: {
    userId: string;
    collegeId: string;
    departmentIds: string[];
    status: "PENDING_VERIFICATION" | "ACTIVE";
  }): Promise<void> => {
    const profile = await prisma.teacherProfile.upsert({
      where: { userId: input.userId },
      update: {
        collegeId: input.collegeId,
        verificationStatus: input.status,
        verifiedAt: input.status === "ACTIVE" ? verifiedAt : null,
        verifiedById: null,
        rejectedReason: null,
        rejectedById: null,
      },
      create: {
        userId: input.userId,
        collegeId: input.collegeId,
        verificationStatus: input.status,
        verifiedAt: input.status === "ACTIVE" ? verifiedAt : null,
      },
      select: { id: true },
    });

    for (const departmentId of input.departmentIds) {
      await prisma.teacherDepartment.upsert({
        where: { unique_teacher_department: { teacherProfileId: profile.id, departmentId } },
        update: {},
        create: { teacherProfileId: profile.id, departmentId },
      });
    }
  };

  const assignRole = async (input: {
    userId: string;
    role: "CR" | "CO_CR" | "SUB_ADMIN" | "PLATFORM_ADMIN";
    scope: "DEPARTMENT_SESSION" | "COLLEGE" | "PLATFORM";
    collegeId?: string;
    departmentId?: string;
    sessionId?: string;
    assignedById?: string;
  }): Promise<void> => {
    // The namespace reset above removed every demo role row, so a plain create is enough.
    await prisma.userRole.create({
      data: {
        userId: input.userId,
        role: input.role,
        scope: input.scope,
        collegeId: input.collegeId ?? null,
        departmentId: input.departmentId ?? null,
        sessionId: input.sessionId ?? null,
        assignedById: input.assignedById ?? null,
        appointmentType: "STANDARD",
      },
    });
  };

  // ── Academic structure ────────────────────────────────────────────────────────
  const collegeA = await upsertCollege(COLLEGE_A);
  const collegeB = await upsertCollege(COLLEGE_B);

  const cse = await upsertDepartment(DEPT_CSE);
  const eee = await upsertDepartment(DEPT_EEE);

  // College B adopts CSE only — that is what makes the cross-college rules testable.
  await adopt(collegeA.id, cse.id);
  await adopt(collegeA.id, eee.id);
  await adopt(collegeB.id, cse.id);

  const cse2021 = await upsertSession(cse.id, SESSION_CSE_2021_22, "2021-09-01", "2022-08-31");
  const cse2022 = await upsertSession(cse.id, SESSION_CSE_2022_23, "2022-09-01", "2023-08-31");
  const eee2022 = await upsertSession(eee.id, SESSION_EEE_2022_23, "2022-09-01", "2023-08-31");

  const courses = {
    dataStructures: await upsertCourse(cse.id, "Data Structures", 3),
    algorithms: await upsertCourse(cse.id, "Algorithms", 4),
    digitalLogic: await upsertCourse(cse.id, "Digital Logic", 3),
    discreteMath: await upsertCourse(cse.id, "Discrete Math", 3),
    operatingSystems: await upsertCourse(cse.id, "Operating Systems", 5),
    circuitAnalysis: await upsertCourse(eee.id, "Circuit Analysis", 1),
    digitalElectronics: await upsertCourse(eee.id, "Digital Electronics", 3),
  };

  // ── Accounts (each one is forced back to the state the table describes) ───────
  const users = {
    admin: await upsertUser({ email: ACCOUNTS.admin, name: "Platform Admin", type: "PLATFORM_ADMIN" }),
    subAdminA: await upsertUser({ email: ACCOUNTS.subAdminA, name: "Sub Admin A", type: "TEACHER" }),
    subAdminB: await upsertUser({ email: ACCOUNTS.subAdminB, name: "Sub Admin B", type: "TEACHER" }),
    // College A, CSE 2022-23 (the batch the CR screens are demonstrated on).
    cr: await upsertUser({ email: ACCOUNTS.cr, name: "Demo CR", type: "STUDENT" }),
    coCr: await upsertUser({ email: ACCOUNTS.coCr, name: "Demo Co-CR", type: "STUDENT" }),
    student1: await upsertUser({ email: ACCOUNTS.student1, name: "Demo Student One", type: "STUDENT" }),
    student2: await upsertUser({ email: ACCOUNTS.student2, name: "Demo Student Two", type: "STUDENT" }),
    studentPending: await upsertUser({
      email: ACCOUNTS.studentPending,
      name: "Pending Student",
      type: "STUDENT",
    }),
    studentRejected: await upsertUser({
      email: ACCOUNTS.studentRejected,
      name: "Rejected Student",
      type: "STUDENT",
    }),
    studentNoEmail: await upsertUser({
      email: ACCOUNTS.studentNoEmail,
      name: "Unverified Email Student",
      type: "STUDENT",
      emailVerified: false,
    }),
    suspended: await upsertUser({
      email: ACCOUNTS.suspended,
      name: "Suspended Student",
      type: "STUDENT",
      accountStatus: "SUSPENDED",
    }),
    // Other batches / departments of College A.
    crOld: await upsertUser({ email: ACCOUNTS.crOld, name: "Old Batch CR", type: "STUDENT" }),
    studentOld: await upsertUser({ email: ACCOUNTS.studentOld, name: "Old Batch Student", type: "STUDENT" }),
    crEee: await upsertUser({ email: ACCOUNTS.crEee, name: "EEE CR", type: "STUDENT" }),
    studentEee: await upsertUser({ email: ACCOUNTS.studentEee, name: "EEE Student", type: "STUDENT" }),
    // College B (adopts CSE only).
    studentB: await upsertUser({ email: ACCOUNTS.studentB, name: "Other College Student", type: "STUDENT" }),
    studentBOptIn: await upsertUser({
      email: ACCOUNTS.studentBOptIn,
      name: "Other College Opt-In Student",
      type: "STUDENT",
    }),
    // Teachers.
    teacher1: await upsertUser({ email: ACCOUNTS.teacher1, name: "Prof. Karim", type: "TEACHER" }),
    teacher2: await upsertUser({ email: ACCOUNTS.teacher2, name: "Dr. Sultana", type: "TEACHER" }),
    teacherMulti: await upsertUser({
      email: ACCOUNTS.teacherMulti,
      name: "Prof. Hasan",
      type: "TEACHER",
    }),
    teacherDiscrete: await upsertUser({ email: ACCOUNTS.teacherDiscrete, name: "Dr. Rahman", type: "TEACHER" }),
    teacherB: await upsertUser({ email: ACCOUNTS.teacherB, name: "Other College Teacher", type: "TEACHER" }),
    teacherPending: await upsertUser({
      email: ACCOUNTS.teacherPending,
      name: "Pending Teacher",
      type: "TEACHER",
    }),
  };

  // ── Student profiles: College A / CSE 2022-23 (the CR's batch) ────────────────
  const cse2022Batch = { collegeId: collegeA.id, departmentId: cse.id, sessionId: cse2022.id } as const;

  await seedStudent({ userId: users.student1.id, regNo: "A-CSE-2201", ...cse2022Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.student2.id, regNo: "A-CSE-2202", ...cse2022Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.cr.id, regNo: "A-CSE-2203", ...cse2022Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.coCr.id, regNo: "A-CSE-2204", ...cse2022Batch, status: "ACTIVE" });
  await seedStudent({
    userId: users.studentPending.id,
    regNo: "A-CSE-2205",
    ...cse2022Batch,
    status: "PENDING_VERIFICATION",
  });
  await seedStudent({
    userId: users.studentRejected.id,
    regNo: "A-CSE-2206",
    ...cse2022Batch,
    status: "REJECTED",
    rejectedReason: "Registration number does not match the class list.",
    rejectedById: users.cr.id,
  });
  await seedStudent({ userId: users.studentNoEmail.id, regNo: "A-CSE-2207", ...cse2022Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.suspended.id, regNo: "A-CSE-2208", ...cse2022Batch, status: "ACTIVE" });

  // ── Student profiles: the other batches, the other department, the other college ──
  const cse2021Batch = { collegeId: collegeA.id, departmentId: cse.id, sessionId: cse2021.id } as const;
  const eee2022Batch = { collegeId: collegeA.id, departmentId: eee.id, sessionId: eee2022.id } as const;
  const collegeBBatch = { collegeId: collegeB.id, departmentId: cse.id, sessionId: cse2022.id } as const;

  await seedStudent({ userId: users.studentOld.id, regNo: "A-CSE-2101", ...cse2021Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.crOld.id, regNo: "A-CSE-2102", ...cse2021Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.studentEee.id, regNo: "A-EEE-2201", ...eee2022Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.crEee.id, regNo: "A-EEE-2202", ...eee2022Batch, status: "ACTIVE" });
  await seedStudent({ userId: users.studentB.id, regNo: "B-CSE-2201", ...collegeBBatch, status: "ACTIVE" });
  await seedStudent({
    userId: users.studentBOptIn.id,
    regNo: "B-CSE-2202",
    ...collegeBBatch,
    status: "ACTIVE",
    includeOtherColleges: true,
  });

  // ── Teacher profiles ─────────────────────────────────────────────────────────
  await seedTeacher({
    userId: users.teacher1.id,
    collegeId: collegeA.id,
    departmentIds: [cse.id],
    status: "ACTIVE",
  });
  await seedTeacher({
    userId: users.teacher2.id,
    collegeId: collegeA.id,
    departmentIds: [cse.id],
    status: "ACTIVE",
  });
  await seedTeacher({
    userId: users.teacherMulti.id,
    collegeId: collegeA.id,
    departmentIds: [cse.id, eee.id],
    status: "ACTIVE",
  });
  await seedTeacher({
    userId: users.teacherDiscrete.id,
    collegeId: collegeA.id,
    departmentIds: [cse.id],
    status: "ACTIVE",
  });
  await seedTeacher({
    userId: users.subAdminA.id,
    collegeId: collegeA.id,
    departmentIds: [cse.id],
    status: "ACTIVE",
  });
  await seedTeacher({
    userId: users.subAdminB.id,
    collegeId: collegeB.id,
    departmentIds: [cse.id],
    status: "ACTIVE",
  });
  await seedTeacher({
    userId: users.teacherB.id,
    collegeId: collegeB.id,
    departmentIds: [cse.id],
    status: "ACTIVE",
  });
  await seedTeacher({
    userId: users.teacherPending.id,
    collegeId: collegeA.id,
    departmentIds: [cse.id],
    status: "PENDING_VERIFICATION",
  });

  // ── Roles: exactly one active holder per slot, like the API enforces (D9) ────
  await assignRole({ userId: users.admin.id, role: "PLATFORM_ADMIN", scope: "PLATFORM" });
  await assignRole({
    userId: users.subAdminA.id,
    role: "SUB_ADMIN",
    scope: "COLLEGE",
    collegeId: collegeA.id,
    assignedById: users.admin.id,
  });
  await assignRole({
    userId: users.subAdminB.id,
    role: "SUB_ADMIN",
    scope: "COLLEGE",
    collegeId: collegeB.id,
    assignedById: users.admin.id,
  });

  const assignCr = (userId: string, departmentId: string, sessionId: string) =>
    assignRole({
      userId,
      role: "CR",
      scope: "DEPARTMENT_SESSION",
      collegeId: collegeA.id,
      departmentId,
      sessionId,
      assignedById: users.subAdminA.id,
    });

  await assignCr(users.cr.id, cse.id, cse2022.id);
  await assignRole({
    userId: users.coCr.id,
    role: "CO_CR",
    scope: "DEPARTMENT_SESSION",
    collegeId: collegeA.id,
    departmentId: cse.id,
    sessionId: cse2022.id,
    assignedById: users.subAdminA.id,
  });
  await assignCr(users.crOld.id, cse.id, cse2021.id);
  await assignCr(users.crEee.id, eee.id, eee2022.id);

  const semesterRows = await Promise.all([1, 2, 3, 4].map((number) =>
    prisma.semester.upsert({
      where: { unique_semester_scope_name: { collegeId: collegeA.id, departmentId: cse.id, sessionId: cse2022.id, name: `Semester ${number}` } },
      update: {},
      create: { collegeId: collegeA.id, departmentId: cse.id, sessionId: cse2022.id, name: `Semester ${number}`, createdById: users.cr.id },
    }),
  ));
  const semesterThree = semesterRows[2];
  if (!semesterThree) throw new Error("Semester 3 seed row is missing");
  const teacherProfiles = await prisma.teacherProfile.findMany({
    where: { userId: { in: [users.teacher1.id, users.teacher2.id, users.teacherMulti.id, users.teacherDiscrete.id] } },
    select: { id: true, userId: true },
  });
  const teacherProfileId = new Map(teacherProfiles.map((profile) => [profile.userId, profile.id]));
  const semesterCourseRows = await Promise.all([
    { courseId: courses.dataStructures.id, teacherId: users.teacher1.id },
    { courseId: courses.algorithms.id, teacherId: users.teacher2.id },
    { courseId: courses.digitalLogic.id, teacherId: users.teacherMulti.id },
    { courseId: courses.discreteMath.id, teacherId: users.teacherDiscrete.id },
  ].map(({ courseId, teacherId }) => prisma.semesterCourse.upsert({
    where: { unique_semester_course: { semesterId: semesterThree.id, courseId } },
    update: { teacherProfileId: teacherProfileId.get(teacherId) ?? null },
    create: { semesterId: semesterThree.id, courseId, teacherProfileId: teacherProfileId.get(teacherId) ?? null },
  })));
  const categoryIds = new Map<string, string>();
  for (const semesterCourse of semesterCourseRows) {
    for (const name of ["Student notes", "Question bank", "Assignments", "Books"]) {
      const category = await prisma.category.upsert({
        where: { unique_category_course_name: { semesterCourseId: semesterCourse.id, name } },
        update: { createdById: users.cr.id },
        create: { semesterCourseId: semesterCourse.id, name, createdById: users.cr.id },
        select: { id: true },
      });
      categoryIds.set(`${semesterCourse.courseId}:${name}`, category.id);
    }
  }

  const demoResourceSamples: DemoResourceSeed[] = [
    { key: "private-pending", uploaderId: users.teacher1.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.dataStructures.id, sessionId: null, audience: "PRIVATE", state: "PENDING" },
    { key: "private-approved", uploaderId: users.teacherMulti.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.algorithms.id, sessionId: null, audience: "PRIVATE", state: "APPROVED" },
    { key: "private-rejected", uploaderId: users.subAdminA.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.operatingSystems.id, sessionId: null, audience: "PRIVATE", state: "REJECTED" },
    { key: "college-pending", uploaderId: users.student1.id, uploaderType: "STUDENT", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.dataStructures.id, sessionId: cse2022.id, audience: "COLLEGE", state: "PENDING" },
    { key: "college-approved", uploaderId: users.student2.id, uploaderType: "STUDENT", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.algorithms.id, sessionId: cse2022.id, audience: "COLLEGE", state: "APPROVED" },
    { key: "college-rejected", uploaderId: users.studentBOptIn.id, uploaderType: "STUDENT", collegeId: collegeB.id, departmentId: cse.id, courseId: courses.dataStructures.id, sessionId: cse2022.id, audience: "COLLEGE", state: "REJECTED" },
    { key: "permitted-pending", uploaderId: users.student1.id, uploaderType: "STUDENT", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.operatingSystems.id, sessionId: cse2022.id, audience: "PERMITTED", state: "PENDING", grantSessionIds: [cse2022.id] },
    { key: "permitted-approved", uploaderId: users.teacher1.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.dataStructures.id, sessionId: null, audience: "PERMITTED", state: "APPROVED", grantSessionIds: [cse2021.id, cse2022.id] },
    { key: "permitted-rejected", uploaderId: users.teacherMulti.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.algorithms.id, sessionId: null, audience: "PERMITTED", state: "REJECTED", grantSessionIds: [cse2021.id] },
    { key: "platform-pending", uploaderId: users.cr.id, uploaderType: "STUDENT", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.dataStructures.id, sessionId: cse2022.id, audience: "PLATFORM", state: "PENDING" },
    { key: "platform-approved", uploaderId: users.cr.id, uploaderType: "STUDENT", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.algorithms.id, sessionId: cse2022.id, audience: "PLATFORM", state: "APPROVED" },
    { key: "platform-rejected", uploaderId: users.subAdminA.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.operatingSystems.id, sessionId: null, audience: "PLATFORM", state: "REJECTED" },
    { key: "semester-trees-pptx", title: "Trees and graphs", uploaderId: users.teacher1.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.dataStructures.id, semesterCourseId: semesterCourseRows[0]?.id, sessionId: null, audience: "PERMITTED", state: "APPROVED", grantSessionIds: [cse2022.id], resourceType: "SLIDES", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", fileExtension: "pptx", fileSizeBytes: 8_200_000 },
    { key: "semester-arrays-pdf", title: "Arrays and lists lecture", uploaderId: users.teacher2.id, uploaderType: "TEACHER", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.algorithms.id, semesterCourseId: semesterCourseRows[1]?.id, sessionId: null, audience: "PERMITTED", state: "APPROVED", grantSessionIds: [cse2022.id], resourceType: "SLIDES", mimeType: "application/pdf", fileExtension: "pdf", fileSizeBytes: 2_400_000 },
    { key: "semester-stacks-docx", title: "Stacks and queues", uploaderId: users.student1.id, uploaderType: "STUDENT", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.dataStructures.id, semesterCourseId: semesterCourseRows[0]?.id, categoryId: categoryIds.get(`${courses.dataStructures.id}:Student notes`), sessionId: cse2022.id, audience: "COLLEGE", state: "APPROVED", resourceType: "NOTES", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileExtension: "docx", fileSizeBytes: 640_000 },
    { key: "semester-sort-question-png", title: "Sorting practice questions", uploaderId: users.cr.id, uploaderType: "STUDENT", collegeId: collegeA.id, departmentId: cse.id, courseId: courses.algorithms.id, semesterCourseId: semesterCourseRows[1]?.id, categoryId: categoryIds.get(`${courses.algorithms.id}:Question bank`), sessionId: cse2022.id, audience: "COLLEGE", state: "APPROVED", resourceType: "QUESTION_BANK", mimeType: "image/png", fileExtension: "png", fileSizeBytes: 1_800_000 },
  ];

  await seedDemoResources(demoResourceSamples);

  // ── Handoff: print the table the playbook quotes (Section 6 → DEMO ACCOUNTS) ──
  const table = [
    "| account | role / state | college | department | session | what to test with it |",
    "| --- | --- | --- | --- | --- | --- |",
    ...DEMO_ROWS.map(
      (row) => `| ${row.email} | ${row.role} | ${row.college} | ${row.department} | ${row.session} | ${row.note} |`,
    ),
  ];

  console.log(
    [
      "",
      "✔ Seed complete (development only) — idempotent, safe to re-run",
      `  College A: ${collegeA.name} · ${cse.name} + ${eee.name} · ${cse2021.name} / ${cse2022.name} / ${eee2022.name}`,
      `  College B: ${collegeB.name} · ${cse.name} only · ${cse2022.name}`,
      "  Courses: CSE → Data Structures, Algorithms, Operating Systems · EEE → Circuit Analysis, Digital Electronics",
      "  Resources: 12 samples (PRIVATE/COLLEGE/PERMITTED/PLATFORM × PENDING/APPROVED/REJECTED).",
      "  Every account signs in with SEED_PASSWORD from apps/api/.env (never printed).",
      "",
      ...table,
      "",
      "  Slots already taken: a CR in every College A batch, a Co-CR next to cr@, and one Sub Admin per",
      "  college — appointing again answers 409 ROLE_SLOT_TAKEN / SUB_ADMIN_EXISTS. Revoke first",
      "  (cr-old@ frees CSE 2021-22) to walk the successful appointment path.",
      "",
    ].join("\n"),
  );
};

main()
  .catch((error: unknown) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
