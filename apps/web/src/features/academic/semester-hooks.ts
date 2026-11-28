"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { resourceKeys } from "@/features/resources/hooks";
import {
  addSemesterCourse,
  createSemester,
  createSemesterCategory,
  fetchSemester,
  fetchSemesters,
  removeSemester,
  removeSemesterCategory,
  removeSemesterCourse,
  renameSemester,
  renameSemesterCategory,
  updateSemesterCourse,
} from "./semester-api";
import type { SemesterCourseMutation, SemesterDetail, SemesterListItem } from "./semester-types";

export const semesterKeys = {
  all: ["semesters"] as const,
  list: ["semesters", "list"] as const,
  detail: (id: string) => ["semesters", "detail", id] as const,
};

export const useSemesters = (enabled = true) => useQuery<SemesterListItem[]>({
  queryKey: semesterKeys.list,
  queryFn: ({ signal }) => fetchSemesters(signal),
  enabled,
});

export const useSemester = (id: string) => useQuery<SemesterDetail>({
  queryKey: semesterKeys.detail(id),
  queryFn: ({ signal }) => fetchSemester(id, signal),
  enabled: Boolean(id),
});

const useSemesterMutation = <TData, TVariables>(mutationFn: (variables: TVariables) => Promise<TData>, message: string) => {
  const queryClient = useQueryClient();
  return useMutation<TData, unknown, TVariables>({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: semesterKeys.all }),
        queryClient.invalidateQueries({ queryKey: resourceKeys.all }),
      ]);
      toast.success(message);
    },
  });
};

export const useCreateSemester = () => useSemesterMutation<string, { name: string }>(
  ({ name }) => createSemester(name).then((row) => row.id), "Semester created.",
);
export const useRenameSemester = () => useSemesterMutation<SemesterListItem, { id: string; name: string }>(
  ({ id, name }) => renameSemester(id, name), "Semester renamed.",
);
export const useRemoveSemester = () => useSemesterMutation<unknown, string>(removeSemester, "Semester removed.");
export const useAddSemesterCourse = () => useSemesterMutation<unknown, { semesterId: string; input: SemesterCourseMutation }>(
  ({ semesterId, input }) => addSemesterCourse(semesterId, input), "Course added.",
);
export const useUpdateSemesterCourse = () => useSemesterMutation<unknown, { id: string; input: { courseName?: string; teacherProfileId?: string | null } }>(
  ({ id, input }) => updateSemesterCourse(id, input), "Course updated.",
);
export const useRemoveSemesterCourse = () => useSemesterMutation<unknown, string>(removeSemesterCourse, "Course removed.");
export const useCreateSemesterCategory = () => useSemesterMutation<unknown, { semesterCourseId: string; name: string }>(
  ({ semesterCourseId, name }) => createSemesterCategory(semesterCourseId, name), "Category created.",
);
export const useRenameSemesterCategory = () => useSemesterMutation<unknown, { semesterCourseId: string; categoryId: string; name: string }>(
  ({ semesterCourseId, categoryId, name }) => renameSemesterCategory(semesterCourseId, categoryId, name), "Category renamed.",
);
export const useRemoveSemesterCategory = () => useSemesterMutation<unknown, { semesterCourseId: string; categoryId: string }>(
  ({ semesterCourseId, categoryId }) => removeSemesterCategory(semesterCourseId, categoryId), "Category removed.",
);
