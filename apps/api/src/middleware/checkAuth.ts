import type { Request, RequestHandler } from "express";
import type { ProfileVerificationStatus } from "../../generated/prisma/enums.js";
import { AppError } from "../utils/AppError.js";
import { getActiveRoles, type AuthProfile, type AuthUser } from "../lib/authz.js";
import { ACCESS_TOKEN_COOKIE, isAccessTokenDenied, verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

/** Every controller/middleware after `checkAuth` reads the user through this. */
export const requireAuth = (req: Request): AuthUser => {
  if (!req.auth) {
    throw AppError.unauthorized("Sign in to continue", "NOT_AUTHENTICATED");
  }

  return req.auth;
};

/** Reads `Authorization: Bearer <token>`; shared with the upload-token guard (S3-B8). */
export const bearerToken = (req: Request): string | undefined => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) return undefined;

  const token = header.slice("Bearer ".length).trim();

  return token.length > 0 ? token : undefined;
};

const tokenFromRequest = (req: Request): string | undefined => {
  const cookieToken = req.cookies?.[ACCESS_TOKEN_COOKIE] as unknown;

  if (typeof cookieToken === "string" && cookieToken.length > 0) return cookieToken;

  return bearerToken(req);
};

interface ProfileRow {
  id: string;
  collegeId: string;
  departmentId: string;
  sessionId: string;
  regNo: string;
  includeOtherColleges: boolean;
  verificationStatus: ProfileVerificationStatus;
}

interface TeacherProfileRow {
  id: string;
  collegeId: string;
  verificationStatus: ProfileVerificationStatus;
  teacherDepartments: { departmentId: string }[];
}

const toAuthProfile = (
  student: ProfileRow | null,
  teacher: TeacherProfileRow | null,
): AuthProfile | null => {
  if (student) {
    return {
      kind: "student",
      id: student.id,
      collegeId: student.collegeId,
      departmentId: student.departmentId,
      sessionId: student.sessionId,
      regNo: student.regNo,
      includeOtherColleges: student.includeOtherColleges,
      verificationStatus: student.verificationStatus,
    };
  }

  if (teacher) {
    return {
      kind: "teacher",
      id: teacher.id,
      collegeId: teacher.collegeId,
      departmentIds: teacher.teacherDepartments.map((row) => row.departmentId),
      verificationStatus: teacher.verificationStatus,
    };
  }

  return null;
};

/**
 * S1-B5 — authenticates a request.
 * 1. token from the `accessToken` cookie or `Authorization: Bearer`
 * 2. signature + expiry
 * 3. Redis denylist (`deny:{jti}`); Redis down = 503 (fail closed)
 * 4. user (not SUSPENDED, email verified), profile and active roles from the DB
 */
export const resolveAuthUser = async (req: Request): Promise<AuthUser> => {
  const token = tokenFromRequest(req);

  if (!token) {
    throw AppError.unauthorized("Sign in to continue", "NOT_AUTHENTICATED");
  }

  const claims = verifyAccessToken(token);

  if (await isAccessTokenDenied(claims.jti)) {
    throw AppError.unauthorized("Your session has ended. Please sign in again.", "TOKEN_REVOKED");
  }

  const identity = await loadAuthUserById(claims.sub);

  return { ...identity, jti: claims.jti, tokenExpiresAt: claims.exp };
};

/**
 * Loads the account a token points at: not suspended, email verified, with the
 * profile and the active roles. Shared by the session and upload-token paths
 * (S3-B8) so both apply exactly the same account rules.
 */
export const loadAuthUserById = async (
  userId: string,
): Promise<Omit<AuthUser, "jti" | "tokenExpiresAt">> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      type: true,
      accountStatus: true,
      emailVerifiedAt: true,
      studentProfile: {
        select: {
          id: true,
          collegeId: true,
          departmentId: true,
          sessionId: true,
          regNo: true,
          includeOtherColleges: true,
          verificationStatus: true,
        },
      },
      teacherProfile: {
        select: {
          id: true,
          collegeId: true,
          verificationStatus: true,
          teacherDepartments: { select: { departmentId: true } },
        },
      },
    },
  });

  if (!user) {
    throw AppError.unauthorized("This account no longer exists", "ACCOUNT_NOT_FOUND");
  }

  if (user.accountStatus === "SUSPENDED") {
    throw AppError.forbidden("Your account is suspended. Contact your college Sub Admin.", "ACCOUNT_SUSPENDED");
  }

  if (!user.emailVerifiedAt) {
    throw AppError.forbidden("Verify your email address to continue", "EMAIL_NOT_VERIFIED");
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    accountStatus: user.accountStatus,
    emailVerifiedAt: user.emailVerifiedAt,
    profile: toAuthProfile(user.studentProfile, user.teacherProfile),
    roles: await getActiveRoles(user.id),
  };
};


/** Hard guard: `401 NOT_AUTHENTICATED` when no usable session is presented. */
export const checkAuth: RequestHandler = async (req, _res, next) => {
  try {
    req.auth = await resolveAuthUser(req);
    next();
  } catch (error) {
    next(error);
  }
};
