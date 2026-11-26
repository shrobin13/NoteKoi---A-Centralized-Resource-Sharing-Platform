"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/auth-guard";
import { useHasRole } from "@/components/require-role";
import { EmptyState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMe } from "@/features/auth/hooks/use-auth";
import type { Me } from "@/features/auth/types";

const titleCase = (value: string): string =>
  value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");

function ProfileCard({ user }: { user: Me }) {
  const profile = user.profile;

  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Platform administrators have no student or teacher profile.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const details: { label: string; value: string }[] =
    profile.kind === "student"
      ? [
          { label: "College", value: profile.college.name },
          { label: "Department", value: profile.department.name },
          { label: "Session", value: profile.session.name },
          { label: "Registration no.", value: profile.regNo },
        ]
      : [
          { label: "College", value: profile.college.name },
          { label: "Departments", value: profile.departments.map((row) => row.name).join(", ") || "—" },
        ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{profile.kind === "student" ? "Student profile" : "Teacher profile"}</CardTitle>
        <CardDescription>Verification status: {titleCase(profile.verificationStatus)}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {details.map((row) => (
            <div key={row.label} className="flex flex-col">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{row.label}</dt>
              <dd className="text-sm font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * S2 entry points. The public directories are open to everybody; every admin
 * screen appears only for the role that can open it (`useHasRole` mirrors
 * `checkRole`, and a Platform Admin passes every check).
 */
function Shortcuts({ canUpload, canManageFiles }: { canUpload: boolean; canManageFiles: boolean }) {
  const canManageStructure = useHasRole(["PLATFORM_ADMIN"]);
  const canVerify = useHasRole(["SUB_ADMIN", "CR", "CO_CR"]);
  const canManageRoles = useHasRole(["SUB_ADMIN"]);
  const canManageSubAdmins = useHasRole(["PLATFORM_ADMIN"]);

  const links: { href: string; label: string }[] = [
    { href: "/my-uploads", label: "My uploads" },
    { href: "/colleges", label: "Browse colleges" },
    { href: "/departments", label: "Browse departments" },
    { href: "/courses", label: "Browse courses" },
  ];

  if (canVerify) links.push({ href: "/admin/verifications", label: "Verification queues" });
  if (canVerify || canManageRoles) links.push({ href: "/admin/moderation", label: "Moderation queue" });
  if (canUpload) links.push({ href: "/upload", label: "Upload a resource" });
  if (canManageRoles) links.push({ href: "/admin/roles", label: "Roles & representatives" });
  if (canManageFiles) links.push({ href: "/my-files", label: "My files" });
  if (canManageSubAdmins) links.push({ href: "/admin/sub-admins", label: "Sub Admins" });
  if (canManageStructure) {
    links.push({ href: "/admin/colleges", label: "Manage colleges" });
    links.push({ href: "/admin/departments", label: "Manage departments" });
    links.push({ href: "/admin/sessions", label: "Manage sessions" });
    links.push({ href: "/admin/courses", label: "Manage courses" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shortcuts</CardTitle>
        <CardDescription>The screens your roles can open right now.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const me = useMe();
  const user = me.data;

  if (!user) return null;

  const verification = user.profile?.verificationStatus;
  const rejectedReason = user.profile?.rejectedReason;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Hello, {user.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{titleCase(user.type)}</Badge>
          <Badge variant={user.accountStatus === "ACTIVE" ? "success" : "destructive"}>
            {titleCase(user.accountStatus)}
          </Badge>
          <Badge variant={user.emailVerifiedAt ? "secondary" : "warning"}>
            {user.emailVerifiedAt ? "Email verified" : "Email not verified"}
          </Badge>
          <span className="text-muted-foreground">{user.email}</span>
        </div>
      </div>

      {verification === "PENDING_VERIFICATION" ? (
        <Alert variant="warning">
          <AlertTitle>Waiting for verification</AlertTitle>
          <AlertDescription>
            {user.type === "TEACHER"
              ? "Your college Sub Admin has to verify your teacher profile before you can upload."
              : "Your class representative has to verify your student profile before you can upload."}{" "}
            You can already browse once resources exist.
          </AlertDescription>
        </Alert>
      ) : null}

      {verification === "REJECTED" ? (
        <Alert variant="destructive">
          <AlertTitle>Profile rejected</AlertTitle>
          <AlertDescription>{rejectedReason ?? "Ask your college administration for details."}</AlertDescription>
        </Alert>
      ) : null}

      {verification === "ACTIVE" ? (
        <Alert variant="success">
          <AlertTitle>Profile verified</AlertTitle>
          <AlertDescription>Your verified account can upload course resources.</AlertDescription>
        </Alert>
      ) : null}

      <Shortcuts
        canUpload={(user.profile?.kind === "student" || user.profile?.kind === "teacher") && verification === "ACTIVE"}
        canManageFiles={user.profile?.kind === "teacher" && verification === "ACTIVE"}
      />

      <ProfileCard user={user} />

      <Card>
        <CardHeader>
          <CardTitle>Active roles</CardTitle>
          <CardDescription>Roles loaded from the database for this request.</CardDescription>
        </CardHeader>
        <CardContent>
          {user.roles.length === 0 ? (
            <EmptyState title="No special roles" description="You have the standard permissions of your account type." />
          ) : (
            <ul className="flex flex-col gap-2">
              {user.roles.map((role) => (
                <li key={role.id} className="rounded-md border px-3 py-2 text-sm">
                  <span className="font-medium">{titleCase(role.role)}</span>
                  <span className="text-muted-foreground"> · {titleCase(role.scope)}</span>
                  <div className="text-xs text-muted-foreground">
                    {[role.college?.name, role.department?.name, role.session?.name].filter(Boolean).join(" · ") ||
                      "Platform-wide"}
                    {role.expiresAt ? ` · expires ${new Date(role.expiresAt).toLocaleDateString()}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
