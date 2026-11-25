"use client";

import { RequireRole } from "@/components/require-role";
import { AdminNav } from "@/features/academic/components/admin-nav";
import { CollegeAdmin } from "@/features/academic/components/college-admin";

export default function AdminCollegesPage() {
  return (
    <RequireRole roles={["PLATFORM_ADMIN"]}>
      <div className="flex flex-col gap-6">
        <AdminNav />
        <CollegeAdmin />
      </div>
    </RequireRole>
  );
}
