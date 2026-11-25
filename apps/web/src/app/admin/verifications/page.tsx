"use client";

import { PageHeader } from "@/components/page-header";
import { RequireRole } from "@/components/require-role";
import { AdminNav } from "@/features/academic/components/admin-nav";
import { VerificationQueues } from "@/features/users/components/verification-queues";

export default function AdminVerificationsPage() {
  return (
    <RequireRole roles={["SUB_ADMIN", "CR", "CO_CR"]}>
      <div className="flex flex-col gap-6">
        <AdminNav />
        <PageHeader
          title="Verification queues"
          description="Approve or reject registrations. A CR decides the students of their batch, a Sub Admin decides the teachers of their college. Every decision is audited and rejection needs a reason."
        />
        <VerificationQueues />
      </div>
    </RequireRole>
  );
}
