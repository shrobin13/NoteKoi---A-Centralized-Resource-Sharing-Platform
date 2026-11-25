"use client";

import { RequireRole } from "@/components/require-role";
import { AdminNav } from "@/features/academic/components/admin-nav";
import { DepartmentAdmin } from "@/features/academic/components/department-admin";

export default function AdminDepartmentsPage() {
  return (
    <RequireRole roles={["PLATFORM_ADMIN"]}>
      <div className="flex flex-col gap-6">
        <AdminNav />
        <DepartmentAdmin />
      </div>
    </RequireRole>
  );
}
