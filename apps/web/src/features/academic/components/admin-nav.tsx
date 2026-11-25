"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useHasRole } from "@/components/require-role";
import type { UserRoleType } from "@/features/auth/types";
import { cn } from "@/lib/utils";

interface AdminLink {
  href: string;
  label: string;
  /** Roles that may open the screen. A Platform Admin always passes (A.4). */
  roles: UserRoleType[];
}

const ADMIN_LINKS: AdminLink[] = [
  { href: "/admin/colleges", label: "Colleges", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/departments", label: "Departments", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/sessions", label: "Sessions", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/courses", label: "Courses", roles: ["PLATFORM_ADMIN"] },
  { href: "/admin/verifications", label: "Verifications", roles: ["SUB_ADMIN", "CR", "CO_CR"] },
  { href: "/admin/roles", label: "Roles", roles: ["SUB_ADMIN"] },
  { href: "/admin/sub-admins", label: "Sub Admins", roles: ["PLATFORM_ADMIN"] },
];

/** Shared sub-navigation for the console; each link is shown only to roles that can open it. */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Administration sections">
      {ADMIN_LINKS.map((link) => (
        <AdminNavLink key={link.href} link={link} pathname={pathname} />
      ))}
    </nav>
  );
}

function AdminNavLink({ link, pathname }: { link: AdminLink; pathname: string }) {
  const allowed = useHasRole(link.roles);

  if (!allowed) return null;

  const isCurrent = pathname === link.href;

  return (
    <Link
      href={link.href}
      aria-current={isCurrent ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        isCurrent
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {link.label}
    </Link>
  );
}
