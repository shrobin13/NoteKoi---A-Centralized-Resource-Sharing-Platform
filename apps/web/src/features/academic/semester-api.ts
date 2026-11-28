import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { SemesterCourseMutation, SemesterDetail, SemesterListItem } from "./semester-types";

export const fetchSemesters = (signal?: AbortSignal): Promise<SemesterListItem[]> => apiGet("/semesters", signal);
export const fetchSemester = (id: string, signal?: AbortSignal): Promise<SemesterDetail> => apiGet(`/semesters/${id}`, signal);
export const createSemester = (name: string): Promise<SemesterListItem> => apiPost<SemesterListItem>("/semesters", { name }).then((response) => response.data);
export const renameSemester = (id: string, name: string): Promise<SemesterListItem> => apiPatch(`/semesters/${id}`, { name });
export const removeSemester = (id: string): Promise<unknown> => apiDelete(`/semesters/${id}`);
export const addSemesterCourse = (semesterId: string, input: SemesterCourseMutation): Promise<unknown> =>
  apiPost(`/semesters/${semesterId}/courses`, input).then((response) => response.data);
export const updateSemesterCourse = (id: string, input: { courseName?: string; teacherProfileId?: string | null }): Promise<unknown> =>
  apiPatch(`/semesters/semester-courses/${id}`, input);
export const removeSemesterCourse = (id: string): Promise<unknown> => apiDelete(`/semesters/semester-courses/${id}`);
export const createSemesterCategory = (semesterCourseId: string, name: string): Promise<unknown> =>
  apiPost(`/semesters/semester-courses/${semesterCourseId}/categories`, { name }).then((response) => response.data);
export const renameSemesterCategory = (semesterCourseId: string, categoryId: string, name: string): Promise<unknown> =>
  apiPatch(`/semesters/semester-courses/${semesterCourseId}/categories/${categoryId}`, { name });
export const removeSemesterCategory = (semesterCourseId: string, categoryId: string): Promise<unknown> =>
  apiDelete(`/semesters/semester-courses/${semesterCourseId}/categories/${categoryId}`);
