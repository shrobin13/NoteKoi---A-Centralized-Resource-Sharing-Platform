import type { ProfileVerificationStatus, UserRoleType } from "@/features/auth/types";
import type { RoleAssignment } from "./types";

/** Display helpers shared by the Slice 2 screens (no logic lives here). */

export const roleLabels: Record<UserRoleType, string> = {
  CR: "CR",
  CO_CR: "Co-CR",
  SUB_ADMIN: "Sub Admin",
  PLATFORM_ADMIN: "Platform Admin",
};

export const verificationLabels: Record<ProfileVerificationStatus, string> = {
  PENDING_VERIFICATION: "Pending",
  ACTIVE: "Verified",
  REJECTED: "Rejected",
};

export function roleLabel(role: UserRoleType): string {
  return roleLabels[role];
}

export function verificationLabel(status: ProfileVerificationStatus): string {
  return verificationLabels[status];
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `College → Department → Session` (nulls dropped), for the role table. */
export function scopeLabel(role: RoleAssignment): string {
  const parts = [role.college?.name, role.department?.name, role.session?.name].filter(
    (part): part is string => Boolean(part),
  );

  return parts.length > 0 ? parts.join(" → ") : "Platform wide";
}

/** Badge tone per verification status. */
export function verificationVariant(
  status: ProfileVerificationStatus,
): "warning" | "success" | "destructive" {
  if (status === "ACTIVE") return "success";
  if (status === "REJECTED") return "destructive";

  return "warning";
}
