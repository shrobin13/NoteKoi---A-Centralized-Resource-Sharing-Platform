"use client";

import { RequireRole } from "@/components/require-role";
import { CrGovernance } from "@/features/governance/components/cr-governance";
import { PlatformGovernance } from "@/features/governance/components/platform-governance";
import { useMe } from "@/features/auth/hooks/use-auth";

export default function GovernancePage() {
  const me = useMe();
  const isPlatformAdmin = me.data?.roles.some((role) => role.role === "PLATFORM_ADMIN") ?? false;

  return (
    <RequireRole roles={["CR", "CO_CR", "SUB_ADMIN", "PLATFORM_ADMIN"]}>
      <div className="flex flex-col gap-6">
        <CrGovernance />
        <PlatformGovernance platformAdmin={isPlatformAdmin} />
      </div>
    </RequireRole>
  );
}
