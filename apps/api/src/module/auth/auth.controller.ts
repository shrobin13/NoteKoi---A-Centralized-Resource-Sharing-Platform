import type { RequestHandler } from "express";
import { clearAuthCookie, setAuthCookie } from "../../lib/jwt.js";
import { signUploadToken } from "../../lib/uploadToken.js";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResendVerificationInput,
  ResetPasswordInput,
  VerifyEmailInput,
} from "./auth.interface.js";
import * as authService from "./auth.service.js";

/** POST /api/v1/auth/register */
export const register: RequestHandler = async (_req, res) => {
  const { body } = getValidated<RegisterInput, unknown, unknown>(res);
  const result = await authService.register(body);

  sendResponse(res, {
    statusCode: 201,
    message: result.verificationEmailSent
      ? "Account created. Enter the 6-digit code sent to your email."
      : "Account created, but the verification email could not be sent. Use “Resend code”.",
    data: result,
  });
};

/** POST /api/v1/auth/verify-email */
export const verifyEmail: RequestHandler = async (_req, res) => {
  const { body } = getValidated<VerifyEmailInput>(res);
  const result = await authService.verifyEmail(body);

  sendResponse(res, { message: result.message, data: result });
};

/** POST /api/v1/auth/resend-verification */
export const resendVerification: RequestHandler = async (_req, res) => {
  const { body } = getValidated<ResendVerificationInput>(res);
  const result = await authService.resendVerification(body);

  sendResponse(res, { message: result.message, data: result });
};

/** POST /api/v1/auth/login — sets the httpOnly cookie and returns the token for curl. */
export const login: RequestHandler = async (_req, res) => {
  const { body } = getValidated<LoginInput>(res);
  const session = await authService.login(body);

  setAuthCookie(res, { token: session.token, ttlSeconds: session.expiresInSeconds });

  sendResponse(res, {
    message: `Welcome back, ${session.user.name}.`,
    data: {
      user: session.user,
      token: session.token,
      tokenType: session.tokenType,
      expiresAt: session.expiresAt,
      expiresInSeconds: session.expiresInSeconds,
    },
  });
};

/** POST /api/v1/auth/logout — revokes the current token and clears the cookie. */
export const logout: RequestHandler = async (req, res) => {
  const result = await authService.logout(requireAuth(req));

  clearAuthCookie(res);

  sendResponse(res, { message: result.message, data: result });
};

/** GET /api/v1/auth/me */
export const me: RequestHandler = async (req, res) => {
  const auth = requireAuth(req);
  const user = await authService.buildMe(auth.userId);

  sendResponse(res, { message: "Current user", data: user });
};

/** POST /api/v1/auth/upload-token — short-lived bearer for a direct file upload (S3-B8/D21). */
export const uploadToken: RequestHandler = async (req, res) => {
  const auth = requireAuth(req);
  const signed = signUploadToken(auth.userId);

  sendResponse(res, {
    message: "Upload token issued",
    data: {
      token: signed.token,
      tokenType: "Bearer",
      expiresAt: signed.expiresAt,
      expiresInSeconds: signed.ttlSeconds,
    },
  });
};

/** POST /api/v1/auth/forgot-password */
export const forgotPassword: RequestHandler = async (_req, res) => {
  const { body } = getValidated<ForgotPasswordInput>(res);
  const result = await authService.forgotPassword(body);

  sendResponse(res, { message: result.message, data: result });
};

/** POST /api/v1/auth/reset-password */
export const resetPassword: RequestHandler = async (_req, res) => {
  const { body } = getValidated<ResetPasswordInput>(res);
  const result = await authService.resetPassword(body);

  sendResponse(res, { message: result.message, data: result });
};
