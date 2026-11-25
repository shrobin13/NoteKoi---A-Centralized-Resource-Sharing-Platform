"use client";

import { RequireRole } from "@/components/require-role";
import { AdminNav } from "@/features/academic/components/admin-nav";
import { CourseAdmin } from "@/features/academic/components/course-admin";

export default function AdminCoursesPage() {
  return (
    <RequireRole roles={["PLATFORM_ADMIN"]}>
      <div className="flex flex-col gap-6">
        <AdminNav />
        <CourseAdmin />
      </div>
    </RequireRole>
  );
}
