"use client";

import { ShieldAlert } from "lucide-react";
import { RequireAuth } from "@/components/auth-guard";
import { LoadingState } from "@/components/states";
import { useMe } from "@/features/auth/hooks/use-auth";
import type { UserRoleType } from "@/features/auth/types";

/**
 * S2-F3/F4 route guard for role-gated screens.
 *
 * Mirrors `checkRole` on the API: a PLATFORM_ADMIN passes every check (A.4).
 * This is convenience only — the server stays the authority (7C rule 4).
 */
export function RequireRole({ roles, children }: { roles: UserRoleType[]; children: React.ReactNode }) {
  return (
    <RequireAuth>
      <RoleGate roles={roles}>{children}</RoleGate>
    </RequireAuth>
  );
}

function RoleGate({ roles, children }: { roles: UserRoleType[]; children: React.ReactNode }) {
  const me = useMe();

  if (me.isPending) {
    return <LoadingState label="Checking your permissions…" />;
  }

  const heldRoles = me.data?.roles ?? [];
  const allowed = heldRoles.some((item) => item.role === "PLATFORM_ADMIN" || roles.includes(item.role));

  if (!allowed) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <ShieldAlert className="size-5" aria-hidden />
        <p className="font-medium">You do not have access to this screen</p>
        <p className="text-sm">
          Your account holds no active role that can open it. Ask a Platform Admin if you believe this is a
          mistake.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/** True when the signed-in user holds one of `roles` (Platform Admin counts as holding all). */
export function useHasRole(roles: UserRoleType[]): boolean {
  const me = useMe();

  return (me.data?.roles ?? []).some((item) => item.role === "PLATFORM_ADMIN" || roles.includes(item.role));
}
