import { apiGet, toQueryString } from "@/lib/api";
import type { ResourceListItem } from "@/features/resources/types";

export interface BrowseScope {
  collegeId: string;
  departmentId: string;
  semester: string;
}

export interface BrowseCourse {
  courseId: string;
  name: string;
  teacherProfileId: string | null;
  teacherName: string | null;
  categories: string[];
}

const query = <T>(path: string, values: object, signal?: AbortSignal) =>
  apiGet<T>(`${path}?${toQueryString(values)}`, signal);

export const fetchBrowseSemesters = (scope: Omit<BrowseScope, "semester">, signal?: AbortSignal) =>
  query<string[]>("/resources/browse/semesters", scope, signal);

export const fetchBrowseCourses = (scope: BrowseScope, signal?: AbortSignal) =>
  query<BrowseCourse[]>("/resources/browse/courses", scope, signal);

export const fetchBrowseFiles = (scope: BrowseScope & { courseId: string; teacherProfileId: string | null; categoryName: string }, signal?: AbortSignal) =>
  query<ResourceListItem[]>("/resources/browse/files", { ...scope, teacherProfileId: scope.teacherProfileId ?? "none" }, signal);