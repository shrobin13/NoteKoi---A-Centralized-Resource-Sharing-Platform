import type { RequestHandler } from "express";
import { requireAuth } from "../../middleware/checkAuth.js";
import { getValidated } from "../../middleware/validateRequest.js";
import { sendResponse } from "../../utils/sendResponse.js";
import * as userService from "./user.service.js";
import type {
  AppointCrInput,
  AppointSubAdminInput,
  AssignTeacherDepartmentsInput,
  PeopleListQueryInput,
  RejectVerificationInput,
  RevokeRoleInput,
  RoleListQueryInput,
  UpdateMeInput,
  UpdateStudentProfileInput,
  VerificationListQueryInput,
} from "./user.validation.js";

type ProfileParams = { profileId: string };
type RoleParams = { roleId: string };
type RejectBody = RejectVerificationInput;

/** GET /api/v1/users/me */
export const getMe: RequestHandler = async (req, res) => {
  const me = await userService.getMe(requireAuth(req));

  sendResponse(res, { message: "Your account", data: me });
};

/** PATCH /api/v1/users/me */
export const updateMe: RequestHandler = async (req, res) => {
  const { body } = getValidated<UpdateMeInput>(res);
  const me = await userService.updateMe(requireAuth(req), body);

  sendResponse(res, { message: "Account updated", data: me });
};

/** PATCH /api/v1/users/me/student-profile */
export const updateStudentProfile: RequestHandler = async (req, res) => {
  const { body } = getValidated<UpdateStudentProfileInput>(res);
  const me = await userService.updateStudentProfile(requireAuth(req), body);

  sendResponse(res, { message: "Student profile updated", data: me });
};

/** GET /api/v1/users/verification/students */
export const listStudentVerifications: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, VerificationListQueryInput>(res);
  const students = await userService.listStudentVerifications(requireAuth(req), query);

  sendResponse(res, { message: "Student registrations", data: students, meta: { total: students.length } });
};

/** POST /api/v1/users/verification/students/:profileId/approve */
export const approveStudent: RequestHandler = async (req, res) => {
  const { params } = getValidated<unknown, unknown, ProfileParams>(res);
  const decision = await userService.approveStudent(requireAuth(req), params.profileId);

  sendResponse(res, { message: "Student verified", data: decision });
};

/** POST /api/v1/users/verification/students/:profileId/reject */
export const rejectStudent: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<RejectBody, unknown, ProfileParams>(res);
  const decision = await userService.rejectStudent(requireAuth(req), params.profileId, body.reason);

  sendResponse(res, { message: "Student registration rejected", data: decision });
};

/** GET /api/v1/users/verification/teachers */
export const listTeacherVerifications: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, VerificationListQueryInput>(res);
  const teachers = await userService.listTeacherVerifications(requireAuth(req), query);

  sendResponse(res, { message: "Teacher registrations", data: teachers, meta: { total: teachers.length } });
};

/** POST /api/v1/users/verification/teachers/:profileId/approve */
export const approveTeacher: RequestHandler = async (req, res) => {
  const { params } = getValidated<unknown, unknown, ProfileParams>(res);
  const decision = await userService.approveTeacher(requireAuth(req), params.profileId);

  sendResponse(res, { message: "Teacher verified", data: decision });
};

/** POST /api/v1/users/verification/teachers/:profileId/reject */
export const rejectTeacher: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<RejectBody, unknown, ProfileParams>(res);
  const decision = await userService.rejectTeacher(requireAuth(req), params.profileId, body.reason);

  sendResponse(res, { message: "Teacher registration rejected", data: decision });
};

/** PUT /api/v1/users/teachers/:profileId/departments */
export const assignTeacherDepartments: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<AssignTeacherDepartmentsInput, unknown, ProfileParams>(res);
  const result = await userService.assignTeacherDepartments(requireAuth(req), params.profileId, body);

  sendResponse(res, { message: "Teacher departments updated", data: result });
};

/** GET /api/v1/users/students */
export const listStudents: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, PeopleListQueryInput>(res);
  const students = await userService.listStudents(requireAuth(req), query);

  sendResponse(res, { message: "Students", data: students, meta: { total: students.length } });
};

/** GET /api/v1/users/teachers */
export const listTeachers: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, PeopleListQueryInput>(res);
  const teachers = await userService.listTeachers(requireAuth(req), query);

  sendResponse(res, { message: "Teachers", data: teachers, meta: { total: teachers.length } });
};

/** GET /api/v1/users/roles */
export const listRoles: RequestHandler = async (req, res) => {
  const { query } = getValidated<unknown, RoleListQueryInput>(res);
  const roles = await userService.listRoles(requireAuth(req), query);

  sendResponse(res, { message: "Role assignments", data: roles, meta: { total: roles.length } });
};

/** POST /api/v1/users/roles */
export const appointCr: RequestHandler = async (req, res) => {
  const { body } = getValidated<AppointCrInput>(res);
  const role = await userService.appointCr(requireAuth(req), body);

  sendResponse(res, {
    message: body.role === "CO_CR" ? "Co-CR appointed" : "CR appointed",
    data: role,
    statusCode: 201,
  });
};

/** POST /api/v1/users/roles/sub-admin */
export const appointSubAdmin: RequestHandler = async (req, res) => {
  const { body } = getValidated<AppointSubAdminInput>(res);
  const role = await userService.appointSubAdmin(requireAuth(req), body);

  sendResponse(res, { message: "Sub Admin appointed", data: role, statusCode: 201 });
};

/** POST /api/v1/users/roles/:roleId/revoke */
export const revokeRole: RequestHandler = async (req, res) => {
  const { params, body } = getValidated<RevokeRoleInput, unknown, RoleParams>(res);
  const result = await userService.revokeRole(requireAuth(req), params.roleId, body.reason);

  sendResponse(res, { message: "Role revoked", data: result });
};
