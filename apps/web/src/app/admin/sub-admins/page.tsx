"use client";

import { PageHeader } from "@/components/page-header";
import { RequireRole } from "@/components/require-role";
import { AdminNav } from "@/features/academic/components/admin-nav";
import { SubAdminAppointment, SubAdminList } from "@/features/users/components/sub-admin-appointment";

export default function AdminSubAdminsPage() {
  return (
    <RequireRole roles={["PLATFORM_ADMIN"]}>
      <div className="flex flex-col gap-6">
        <AdminNav />
        <PageHeader
          title="Sub Admins"
          description="One Sub Admin per college (D9). They verify that college's teachers and manage its CRs. An emergency replacement removes the current holder in the same step and is audited."
        />
        <SubAdminAppointment />
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Current Sub Admins</h2>
          <SubAdminList />
        </section>
      </div>
    </RequireRole>
  );
}
