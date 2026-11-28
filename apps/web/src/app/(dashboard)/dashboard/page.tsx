"use client";

import Link from "next/link";
import { Bell, Building2, LayoutGrid, Plus, Upload, UserRound } from "lucide-react";
import { RequireAuth } from "@/components/auth-guard";
import { useMe } from "@/features/auth/hooks/use-auth";

function DashboardContent() {
  const me = useMe();
  const user = me.data;
  if (!user) return null;

  const profile = user.profile;
  const college = profile?.kind === "student" ? profile.college.name : profile?.kind === "teacher" ? profile.college.name : "";
  const department = profile?.kind === "student" ? profile.department.name : profile?.kind === "teacher" ? profile.departments.map((item) => item.name).join(", ") : "";
  const session = profile?.kind === "student" ? profile.session.name : "";
  const roleLabel = user.roles.some((role) => role.role === "CR" || role.role === "CO_CR") ? "CR" : user.type === "STUDENT" ? "Student" : user.type === "TEACHER" ? "Teacher" : "Admin";

  const shortcuts = [
    { href: "/semesters", title: "Semesters", description: "Open the notes for each semester, course and teacher.", icon: LayoutGrid },
    { href: "/colleges", title: "Other departments and colleges", description: "Browse what other departments and colleges share.", icon: Building2 },
    { href: "/my-uploads", title: "My uploads", description: "See what is approved, in review or rejected.", icon: Upload },
    { href: "/upload", title: "Upload a file", description: "Add notes to a semester and course.", icon: Plus },
    { href: "/notifications", title: "Notifications", description: "Review results, shares and replies in one place.", icon: Bell },
    { href: "/dashboard#profile", title: "Profile and settings", description: "Your details, verification and preferences.", icon: UserRound },
  ] as const;

  return (
    <div className="dashboard-page">
      <section className="welcome-card">
        <h1>Welcome back, {user.name}</h1>
        <p>NoteKoi keeps your class notes organised by semester and course. Files you upload are checked by your CR before your batch can see them.</p>
        <div className="badge-row">
          {college ? <span className="neutral-chip">{college}</span> : null}
          {department ? <span className="neutral-chip">{department}</span> : null}
          {session ? <span className="neutral-chip">{session}</span> : null}
          <span className="role-chip">{roleLabel}</span>
        </div>
      </section>

      <h2 className="shortcuts-title">Shortcuts</h2>
      <div className="shortcuts-grid">
        {shortcuts.map(({ href, title, description, icon: Icon }) => (
          <Link href={href} key={title} className="shortcut-card">
            <span className="shortcut-icon"><Icon /></span>
            <strong>{title}</strong>
            <span className="shortcut-description">{description}</span>
          </Link>
        ))}
      </div>
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
