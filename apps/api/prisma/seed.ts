/**
 * S1-B14 — development seed.
 *
 * Slice 1: the platform admin, one college + department + session + course, and
 * one ACTIVE demo account per role (student, CR, teacher, Sub Admin).
 * Slice 2: a second college (sharing one adopted department), a second session,
 * extra courses, and PENDING/REJECTED registrations for the verification queues.
 * Idempotent: run it as often as you like (`npm run db:seed`).
 *
 * All demo accounts share `SEED_PASSWORD` from apps/api/.env.
 */
import { config } from "../src/config/index.js";
import { hashPassword } from "../src/lib/hash.js";
import { prisma } from "../src/lib/prisma.js";

if (config.isProduction) {
  throw new Error("prisma/seed.ts is a development seed and refuses to run with NODE_ENV=production");
}

const seedPassword = config.seedPassword;

if (!seedPassword) {
  throw new Error("SEED_PASSWORD is missing. Add it to apps/api/.env (see .env.example).");
}

const DEMO = {
  college: "NoteKoi Demo College",
  secondCollege: "NoteKoi Demo Institute of Technology",
  department: "Computer Science",
  secondDepartment: "Electrical Engineering",
  session: "Session 2024-2025",
  nextSession: "Session 2025-2026",
  course: "Data Structures",
  secondCourse: "Algorithms",
  engineeringCourse: "Circuit Analysis",
} as const;

const ACCOUNTS = {
  admin: "admin@notekoi.local",
  student: "student@notekoi.local",
  cr: "cr@notekoi.local",
  teacher: "teacher@notekoi.local",
  subAdmin: "subadmin@notekoi.local",
  // Slice 2 demo rows for the verification queues.
  pendingStudent: "student2@notekoi.local",
  pendingStudentTwo: "student3@notekoi.local",
  rejectedStudent: "student4@notekoi.local",
  otherBatchStudent: "student5@notekoi.local",
  otherCollegeStudent: "student6@notekoi.local",
  pendingTeacher: "teacher2@notekoi.local",
  otherCollegeTeacher: "teacher3@notekoi.local",
  // S2-B6 demo: a verified student of the next batch, free of any CR role.
  appointableStudent: "student7@notekoi.local",
} as const;

const main = async (): Promise<void> => {
  const passwordHash = await hashPassword(seedPassword);
  const verifiedAt = new Date();

  const college = await prisma.college.upsert({
    where: { name: DEMO.college },
    update: { isActive: true },
    create: { name: DEMO.college },
    select: { id: true, name: true },
  });

  const department = await prisma.department.upsert({
    where: { name: DEMO.department },
    update: { isActive: true },
    create: { name: DEMO.department },
    select: { id: true, name: true },
  });

  await prisma.collegeDepartment.upsert({
    where: { unique_college_department: { collegeId: college.id, departmentId: department.id } },
    update: {},
    create: { collegeId: college.id, departmentId: department.id },
  });

  const session = await prisma.session.upsert({
    where: { unique_session_department_name: { departmentId: department.id, name: DEMO.session } },
    update: { isActive: true },
    create: {
      departmentId: department.id,
      name: DEMO.session,
      startDate: new Date("2024-09-01"),
      endDate: new Date("2025-08-31"),
    },
    select: { id: true, name: true },
  });

  const course = await prisma.course.upsert({
    where: { unique_course_department_name: { departmentId: department.id, name: DEMO.course } },
    update: { isActive: true },
    create: { departmentId: department.id, name: DEMO.course, semester: 3 },
    select: { id: true, name: true },
  });

  // ── Slice 2: second college, second session, extra courses (A.1–A.3) ──
  const secondCollege = await prisma.college.upsert({
    where: { name: DEMO.secondCollege },
    update: { isActive: true },
    create: { name: DEMO.secondCollege },
    select: { id: true, name: true },
  });

  const secondDepartment = await prisma.department.upsert({
    where: { name: DEMO.secondDepartment },
    update: { isActive: true },
    create: { name: DEMO.secondDepartment },
    select: { id: true, name: true },
  });

  // Both colleges adopt Computer Science; the second one also owns Electrical Engineering.
  for (const [collegeId, departmentId] of [
    [college.id, department.id],
    [secondCollege.id, department.id],
    [secondCollege.id, secondDepartment.id],
  ] as const) {
    await prisma.collegeDepartment.upsert({
      where: { unique_college_department: { collegeId, departmentId } },
      update: {},
      create: { collegeId, departmentId },
    });
  }

  const nextSession = await prisma.session.upsert({
    where: { unique_session_department_name: { departmentId: department.id, name: DEMO.nextSession } },
    update: { isActive: true },
    create: {
      departmentId: department.id,
      name: DEMO.nextSession,
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-08-31"),
    },
    select: { id: true, name: true },
  });

  const engineeringSession = await prisma.session.upsert({
    where: { unique_session_department_name: { departmentId: secondDepartment.id, name: DEMO.session } },
    update: { isActive: true },
    create: {
      departmentId: secondDepartment.id,
      name: DEMO.session,
      startDate: new Date("2024-09-01"),
      endDate: new Date("2025-08-31"),
    },
    select: { id: true },
  });

  await prisma.course.upsert({
    where: { unique_course_department_name: { departmentId: department.id, name: DEMO.secondCourse } },
    update: { isActive: true },
    create: { departmentId: department.id, name: DEMO.secondCourse, semester: 4 },
  });

  await prisma.course.upsert({
    where: { unique_course_department_name: { departmentId: secondDepartment.id, name: DEMO.engineeringCourse } },
    update: { isActive: true },
    create: { departmentId: secondDepartment.id, name: DEMO.engineeringCourse, semester: 1 },
  });

  const upsertUser = async (input: {
    email: string;
    name: string;
    type: "STUDENT" | "TEACHER" | "PLATFORM_ADMIN";
  }) =>
    prisma.user.upsert({
      where: { email: input.email },
      update: {
        name: input.name,
        passwordHash,
        type: input.type,
        accountStatus: "ACTIVE",
        emailVerifiedAt: verifiedAt,
      },
      create: {
        email: input.email,
        name: input.name,
        passwordHash,
        type: input.type,
        accountStatus: "ACTIVE",
        emailVerifiedAt: verifiedAt,
      },
      select: { id: true, email: true, type: true },
    });

  await prisma.$transaction(async (tx) => {
    // Platform Admin: no profile, one PLATFORM_ADMIN role.
    const admin = await tx.user.upsert({
      where: { email: ACCOUNTS.admin },
      update: { name: "Platform Admin", passwordHash, type: "PLATFORM_ADMIN", emailVerifiedAt: verifiedAt },
      create: {
        email: ACCOUNTS.admin,
        name: "Platform Admin",
        passwordHash,
        type: "PLATFORM_ADMIN",
        emailVerifiedAt: verifiedAt,
      },
      select: { id: true },
    });

    const existingAdminRole = await tx.userRole.findFirst({
      where: { userId: admin.id, role: "PLATFORM_ADMIN", revokedAt: null },
      select: { id: true },
    });

    if (!existingAdminRole) {
      await tx.userRole.create({
        data: { userId: admin.id, role: "PLATFORM_ADMIN", scope: "PLATFORM" },
      });
    }
  });

  const studentUser = await upsertUser({ email: ACCOUNTS.student, name: "Demo Student", type: "STUDENT" });

  await prisma.studentProfile.upsert({
    where: { userId: studentUser.id },
    update: {
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1001",
      includeOtherColleges: false,
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    create: {
      userId: studentUser.id,
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1001",
      includeOtherColleges: false,
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
  });

  const ensureRole = async (input: {
    userId: string;
    role: "CR" | "CO_CR" | "SUB_ADMIN" | "PLATFORM_ADMIN";
    scope: "DEPARTMENT_SESSION" | "COLLEGE" | "PLATFORM";
    collegeId?: string;
    departmentId?: string;
    sessionId?: string;
  }): Promise<void> => {
    const existing = await prisma.userRole.findFirst({
      where: { userId: input.userId, role: input.role, revokedAt: null },
      select: { id: true },
    });

    if (!existing) {
      await prisma.userRole.create({
        data: {
          userId: input.userId,
          role: input.role,
          scope: input.scope,
          collegeId: input.collegeId ?? null,
          departmentId: input.departmentId ?? null,
          sessionId: input.sessionId ?? null,
        },
      });
    }
  };

  /**
   * S2-B6 demo reset: the appointment screens change `UserRole` rows, so a
   * re-run drops every CR/Co-CR/Sub Admin row of the demo accounts before the
   * canonical ones are restored below. Only the demo accounts are touched and
   * the audit trail keeps the ids of the removed rows.
   */
  const demoEmails = Object.values(ACCOUNTS).filter((email) => email !== ACCOUNTS.admin);

  await prisma.userRole.deleteMany({
    where: {
      user: { email: { in: demoEmails } },
      role: { in: ["CR", "CO_CR", "SUB_ADMIN"] },
    },
  });

  // CR: a student of the demo batch with an active CR role.
  const crUser = await upsertUser({ email: ACCOUNTS.cr, name: "Demo CR", type: "STUDENT" });

  await prisma.studentProfile.upsert({
    where: { userId: crUser.id },
    update: {
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1002",
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    create: {
      userId: crUser.id,
      collegeId: college.id,
      departmentId: department.id,
      sessionId: session.id,
      regNo: "SEED-1002",
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
  });

  await ensureRole({
    userId: crUser.id,
    role: "CR",
    scope: "DEPARTMENT_SESSION",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
  });

  // Teacher: verified, belongs to one adopted department.
  const teacherUser = await upsertUser({ email: ACCOUNTS.teacher, name: "Demo Teacher", type: "TEACHER" });

  const teacherProfile = await prisma.teacherProfile.upsert({
    where: { userId: teacherUser.id },
    update: { collegeId: college.id, verificationStatus: "ACTIVE", verifiedAt },
    create: {
      userId: teacherUser.id,
      collegeId: college.id,
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    select: { id: true },
  });

  await prisma.teacherDepartment.upsert({
    where: { unique_teacher_department: { teacherProfileId: teacherProfile.id, departmentId: department.id } },
    update: {},
    create: { teacherProfileId: teacherProfile.id, departmentId: department.id },
  });

  // Sub Admin: a teacher of the college with the college-scoped role.
  const subAdminUser = await upsertUser({ email: ACCOUNTS.subAdmin, name: "Demo Sub Admin", type: "TEACHER" });

  const subAdminProfile = await prisma.teacherProfile.upsert({
    where: { userId: subAdminUser.id },
    update: { collegeId: college.id, verificationStatus: "ACTIVE", verifiedAt },
    create: {
      userId: subAdminUser.id,
      collegeId: college.id,
      verificationStatus: "ACTIVE",
      verifiedAt,
    },
    select: { id: true },
  });

  await prisma.teacherDepartment.upsert({
    where: {
      unique_teacher_department: { teacherProfileId: subAdminProfile.id, departmentId: department.id },
    },
    update: {},
    create: { teacherProfileId: subAdminProfile.id, departmentId: department.id },
  });

  await ensureRole({
    userId: subAdminUser.id,
    role: "SUB_ADMIN",
    scope: "COLLEGE",
    collegeId: college.id,
  });

  // ── Slice 2: rows for the verification queues (S2-B5 / S2-B6) ─────────
  /**
   * Re-running the seed resets these demo rows to their queue state, so the
   * click-through demo always starts from a known place.
   */
  const seedStudentProfile = async (input: {
    email: string;
    name: string;
    regNo: string;
    collegeId: string;
    departmentId: string;
    sessionId: string;
    status: "PENDING_VERIFICATION" | "REJECTED" | "ACTIVE";
    rejectedReason?: string;
  }): Promise<void> => {
    const user = await upsertUser({ email: input.email, name: input.name, type: "STUDENT" });

    const data = {
      collegeId: input.collegeId,
      departmentId: input.departmentId,
      sessionId: input.sessionId,
      regNo: input.regNo,
      includeOtherColleges: false,
      verificationStatus: input.status,
      verifiedAt: input.status === "ACTIVE" ? verifiedAt : null,
      verifiedById: null,
      rejectedReason: input.rejectedReason ?? null,
      rejectedById: null,
    };

    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: data,
      create: { userId: user.id, ...data },
    });
  };

  const seedTeacherProfile = async (input: {
    email: string;
    name: string;
    collegeId: string;
    departmentIds: string[];
  }): Promise<void> => {
    const user = await upsertUser({ email: input.email, name: input.name, type: "TEACHER" });

    const profile = await prisma.teacherProfile.upsert({
      where: { userId: user.id },
      update: {
        collegeId: input.collegeId,
        verificationStatus: "PENDING_VERIFICATION",
        verifiedAt: null,
        verifiedById: null,
        rejectedReason: null,
        rejectedById: null,
      },
      create: { userId: user.id, collegeId: input.collegeId, verificationStatus: "PENDING_VERIFICATION" },
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

  // CR queue: two pending registrations in the CR's own batch.
  await seedStudentProfile({
    email: ACCOUNTS.pendingStudent,
    name: "Pending Student One",
    regNo: "SEED-2001",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    status: "PENDING_VERIFICATION",
  });

  await seedStudentProfile({
    email: ACCOUNTS.pendingStudentTwo,
    name: "Pending Student Two",
    regNo: "SEED-2002",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    status: "PENDING_VERIFICATION",
  });

  // A rejected registration: shows the reason the CR left behind.
  await seedStudentProfile({
    email: ACCOUNTS.rejectedStudent,
    name: "Rejected Student",
    regNo: "SEED-2003",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
    status: "REJECTED",
    rejectedReason: "Registration number does not match the class list.",
  });

  // Same department, next session: outside the CR's batch scope.
  await seedStudentProfile({
    email: ACCOUNTS.otherBatchStudent,
    name: "Next Batch Student",
    regNo: "SEED-2004",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: nextSession.id,
    status: "PENDING_VERIFICATION",
  });

  // A second college entirely: only a Platform Admin sees this one.
  await seedStudentProfile({
    email: ACCOUNTS.otherCollegeStudent,
    name: "Engineering Student",
    regNo: "SEED-2005",
    collegeId: secondCollege.id,
    departmentId: secondDepartment.id,
    sessionId: engineeringSession.id,
    status: "PENDING_VERIFICATION",
  });

  // Sub Admin queue: one pending teacher in the demo college.
  await seedTeacherProfile({
    email: ACCOUNTS.pendingTeacher,
    name: "Pending Teacher",
    collegeId: college.id,
    departmentIds: [department.id],
  });

  // Outside the demo college: needs the Platform Admin.
  await seedTeacherProfile({
    email: ACCOUNTS.otherCollegeTeacher,
    name: "Engineering Teacher",
    collegeId: secondCollege.id,
    departmentIds: [secondDepartment.id],
  });

  // S2-B6 appointment demo: a verified student in the next batch (no CR yet).
  await seedStudentProfile({
    email: ACCOUNTS.appointableStudent,
    name: "Appointable Student",
    regNo: "SEED-2006",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: nextSession.id,
    status: "ACTIVE",
  });

  await ensureRole({
    userId: crUser.id,
    role: "CR",
    scope: "DEPARTMENT_SESSION",
    collegeId: college.id,
    departmentId: department.id,
    sessionId: session.id,
  });

  await ensureRole({
    userId: subAdminUser.id,
    role: "SUB_ADMIN",
    scope: "COLLEGE",
    collegeId: college.id,
  });

  console.log(
    [
      "",
      "✔ Seed complete (development only)",
      `  college:    ${college.name}`,
      `  department: ${department.name}`,
      `  session:    ${session.name}`,
      `  course:     ${course.name}`,
      "",
      "  demo accounts (same password: SEED_PASSWORD in apps/api/.env):",
      `    platform admin  ${ACCOUNTS.admin}`,
      `    student         ${ACCOUNTS.student}`,
      `    CR              ${ACCOUNTS.cr}`,
      `    teacher         ${ACCOUNTS.teacher}`,
      `    sub admin       ${ACCOUNTS.subAdmin}`,
      "",
      "  Slice 2 verification queues:",
      `    CR queue (${college.name} · ${department.name} · ${session.name}):`,
      `      pending   ${ACCOUNTS.pendingStudent}, ${ACCOUNTS.pendingStudentTwo}`,
      `      rejected  ${ACCOUNTS.rejectedStudent}`,
      "    outside the CR's batch (Platform Admin only):",
      `      ${ACCOUNTS.otherBatchStudent} (${nextSession.name}), ${ACCOUNTS.otherCollegeStudent} (${secondCollege.name} · ${secondDepartment.name})`,
      `    Sub Admin queue (${college.name}): pending ${ACCOUNTS.pendingTeacher}`,
      `    outside the Sub Admin's college: ${ACCOUNTS.otherCollegeTeacher} (${secondCollege.name} · ${secondDepartment.name})`,
      "",
      "  Slice 2 role appointments:",
      `    CR of ${department.name} · ${session.name}: ${ACCOUNTS.cr}`,
      `    Sub Admin of ${college.name}: ${ACCOUNTS.subAdmin}`,
      `    free batch to appoint into (${department.name} · ${nextSession.name}): ${ACCOUNTS.appointableStudent}`,
      `    Sub Admin candidates are verified teachers of the college: ${ACCOUNTS.teacher}`,
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

