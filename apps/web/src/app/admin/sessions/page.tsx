"use client";

import { RequireRole } from "@/components/require-role";
import { AdminNav } from "@/features/academic/components/admin-nav";
import { SessionAdmin } from "@/features/academic/components/session-admin";

export default function AdminSessionsPage() {
  return (
    <RequireRole roles={["PLATFORM_ADMIN"]}>
      <div className="flex flex-col gap-6">
        <AdminNav />
        <SessionAdmin />
      </div>
    </RequireRole>
  );
}
