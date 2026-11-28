"use client";

import { useTheme } from "next-themes";
import {
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  MoreHorizontal,
  Moon,
  Search,
  Settings,
  Sun,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLogout, useMe } from "@/features/auth/hooks/use-auth";
import { useMarkAllNotificationsRead, useNotifications, useUnreadNotificationCount } from "@/features/notifications/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getErrorMessage } from "@/lib/api";
import { useCreateSemester, useRemoveSemester, useRenameSemester, useSemesters } from "@/features/academic/semester-hooks";
import type { SemesterListItem } from "@/features/academic/semester-types";

const AUTH_ROUTES = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "U";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const semesters = useSemesters(Boolean(me.data));
  const createSemester = useCreateSemester();
  const removeSemester = useRemoveSemester();
  const renameSemester = useRenameSemester();
  const unread = useUnreadNotificationCount(Boolean(me.data));
  const notifications = useNotifications(1, false);
  const markAll = useMarkAllNotificationsRead();
  const logout = useLogout();
  const { resolvedTheme, setTheme } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [semesterDialog, setSemesterDialog] = useState<"create" | "rename" | "remove" | null>(null);
  const [semesterName, setSemesterName] = useState("");
  const [semesterToRename, setSemesterToRename] = useState<SemesterListItem | null>(null);
  const [semesterToRemove, setSemesterToRemove] = useState<SemesterListItem | null>(null);
  const [semesterError, setSemesterError] = useState("");

  useEffect(() => setThemeReady(true), []);

  const isAuthPage = AUTH_ROUTES.some((route) => pathname === route);
  if (isAuthPage) return <>{children}</>;

  const user = me.data;
  const profile = user?.profile;
  const department = profile?.kind === "student" ? profile.department.name : profile?.kind === "teacher" ? profile.departments.map((item) => item.name).join(", ") : "";
  const session = profile?.kind === "student" ? profile.session.name : "";
  const sessionLabel = session.startsWith(`${department}, `)
    ? session.slice(department.length + 2)
    : session.startsWith(`${department} `)
      ? session.slice(department.length + 1)
      : session;
  const isCr = user?.roles.some((role) => role.role === "CR" || role.role === "CO_CR") ?? false;

  const openSemesterDialog = (type: "create" | "rename", semester?: SemesterListItem) => {
    setSemesterError("");
    setSemesterToRename(semester ?? null);
    setSemesterName(semester?.name ?? "");
    setSemesterDialog(type);
  };

  const openRemoveSemesterDialog = (semester: SemesterListItem) => {
    setSemesterError("");
    setSemesterToRemove(semester);
    setSemesterDialog("remove");
  };

  const submitSemesterDialog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSemesterError("");
    try {
      if (semesterDialog === "create") {
        const id = await createSemester.mutateAsync({ name: semesterName.trim() });
        setSemesterDialog(null);
        router.push(`/semesters/${id}`);
      } else if (semesterDialog === "rename" && semesterToRename) {
        await renameSemester.mutateAsync({ id: semesterToRename.id, name: semesterName.trim() });
        setSemesterDialog(null);
      } else if (semesterDialog === "remove" && semesterToRemove) {
        const previousIndex = semesters.data?.findIndex((item) => item.id === semesterToRemove.id) ?? -1;
        await removeSemester.mutateAsync(semesterToRemove.id);
        setSemesterDialog(null);
        const refreshed = await semesters.refetch();
        const remaining = refreshed.data ?? [];
        const nearest = remaining[previousIndex > 0 ? previousIndex - 1 : 0];
        router.push(nearest ? `/semesters/${nearest.id}` : "/semesters");
      }
    } catch (error) {
      setSemesterError(getErrorMessage(error));
    }
  };

  const onLogout = async () => {
    try {
      await logout.mutateAsync();
      await queryClient.invalidateQueries();
      toast.success("Signed out");
      router.push("/login");
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  };

  const sidebar = (
    <div className="flex h-full flex-col px-3 py-4">
      <Link href="/dashboard" className="flex h-[44px] items-center gap-2 px-3 pb-4" aria-label="NoteKoi dashboard">
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-[14px] font-bold text-primary-foreground">N</span>
        <span className="text-[18px] font-bold leading-none">NoteKoi</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Main navigation">
        <Link href="/dashboard" className={cn("shell-nav-item", pathname === "/dashboard" && "active")}>
          <Home /> <span>Dashboard</span>
        </Link>
        <Link href={semesters.data?.[0] ? `/semesters/${semesters.data[0].id}` : "/semesters"} className={cn("shell-nav-item", pathname.startsWith("/semesters") && "active")}>
          <LayoutGrid /> <span>Semesters</span><ChevronDown className="ml-auto" />
        </Link>
        {semesters.data?.map((semester) => <div className="semester-nav-row" key={semester.id}>
          <Link href={`/semesters/${semester.id}`} className={cn("semester-link", pathname === `/semesters/${semester.id}` && "active")}>{semester.name}</Link>
          {isCr ? <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="semester-nav-more" aria-label={`Manage ${semester.name}`}><MoreHorizontal /></button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => openSemesterDialog("rename", semester)}>Rename</DropdownMenuItem>
              <DropdownMenuItem className="danger-action" disabled={semester._count.courses > 0 || removeSemester.isPending} onSelect={() => openRemoveSemesterDialog(semester)}>
                Remove
                {semester._count.courses > 0 ? <small>Only an empty semester can be removed. Remove its courses first.</small> : null}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : null}
        </div>)}
        {isCr ? <button type="button" className="semester-link semester-create-link" onClick={() => openSemesterDialog("create")}>+ New semester</button> : null}
        <Link href="/colleges" className={cn("shell-nav-item", pathname.startsWith("/colleges") && "active")}>
          <Building2 /> <span>Other departments and colleges</span>
        </Link>
        <Link href="/my-uploads" className={cn("shell-nav-item", pathname === "/my-uploads" && "active")}>
          <Upload /> <span>My uploads</span>
        </Link>
      </nav>

      {user ? (
        <div className="relative border-t border-border pt-3">
          {profileOpen ? (
            <div className="profile-popup">
              <Link href="/dashboard" onClick={() => setProfileOpen(false)}>Profile</Link>
              <Link href="/dashboard#account" onClick={() => setProfileOpen(false)}>Account settings</Link>
              <Link href="/dashboard#help" onClick={() => setProfileOpen(false)}>Help</Link>
              <div className="my-1 border-t border-border" />
              <button type="button" className="text-destructive" onClick={() => void onLogout()}>Log out</button>
            </div>
          ) : null}
          <button type="button" className="profile-row" onClick={() => setProfileOpen((value) => !value)}>
            <span className="profile-avatar">{initials(user.name)}</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[13px] font-bold">{user.name}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{[department, sessionLabel].filter(Boolean).join(", ")}</span>
            </span>
            <ChevronDown className="size-4 shrink-0" />
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="app-sidebar">{sidebar}</aside>

      {drawerOpen ? (
        <div className="mobile-drawer" role="dialog" aria-modal="true">
          <button type="button" aria-label="Close menu" className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer-panel">
            {sidebar}
            <button type="button" className="drawer-close" aria-label="Close menu" onClick={() => setDrawerOpen(false)}><X /></button>
          </aside>
        </div>
      ) : null}

      <header className="app-topbar">
        <button type="button" className="mobile-menu-button" aria-label="Open menu" onClick={() => setDrawerOpen(true)}><Menu /></button>
        <form className="relative min-w-0 flex-1" onSubmit={(event) => event.preventDefault()}>
          <Search className="global-search-icon" />
          <input className="global-search" aria-label="Search" placeholder={pathname.startsWith("/colleges") ? "Search all colleges and departments" : "Search notes, courses, teachers"} />
        </form>
        <span className="topbar-spacer" />
        <button type="button" className="topbar-icon-button" aria-label="Toggle dark mode" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {themeReady && resolvedTheme === "dark" ? <Sun /> : <Moon />}
        </button>
        <div className="relative">
          <button type="button" className="topbar-icon-button" aria-label="Notifications" onClick={() => setNotificationsOpen((value) => !value)}>
            <Bell />
            {(unread.data ?? 0) > 0 ? <span className="notification-dot" /> : null}
          </button>
          {notificationsOpen ? (
            <div className="bell-panel">
              <div className="bell-header"><strong>Notifications</strong><button type="button" onClick={() => markAll.mutate()} disabled={!unread.data}>Mark all as read</button></div>
              <div className="notification-strip">UNREAD</div>
              {(notifications.data?.items.filter((item) => !item.readAt) ?? []).map((item) => (
                <Link href="/my-uploads" key={item.id} className="notification-item unread">
                  <strong>{item.type.includes("APPROVED") ? "Approved" : item.type.includes("REJECTED") ? "Rejected" : "Shared"}</strong>
                  <span>{item.payload.resourceTitle ?? item.payload.reason ?? "Resource update"}</span>
                  <small>{item.payload.resourceId ? "Opens My uploads" : "Opens semester"}, {new Date(item.createdAt).toLocaleString()}</small>
                </Link>
              ))}
              <div className="notification-strip">READ</div>
              {(notifications.data?.items.filter((item) => item.readAt) ?? []).map((item) => (
                <Link href="/my-uploads" key={item.id} className="notification-item">
                  <strong>{item.type.includes("APPROVED") ? "Approved" : item.type.includes("REJECTED") ? "Rejected" : "Shared"}</strong>
                  <span>{item.payload.resourceTitle ?? item.payload.reason ?? "Resource update"}</span>
                  <small>{item.payload.resourceId ? "Opens My uploads" : "Opens semester"}, {new Date(item.createdAt).toLocaleString()}</small>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mobile-page-title">{pathname === "/dashboard" ? "Dashboard" : pathname.startsWith("/courses") || pathname.startsWith("/semesters") ? "Semesters" : "NoteKoi"}</div>
      </header>

      <main className="app-main"><div className="app-content">{children}</div></main>

      <nav className="mobile-tabs" aria-label="Mobile navigation">
        <Link href="/dashboard" className={pathname === "/dashboard" ? "active" : ""}><Home />Home</Link>
        <Link href={semesters.data?.[0] ? `/semesters/${semesters.data[0].id}` : "/semesters"} className={pathname.startsWith("/semesters") || pathname.startsWith("/courses") ? "active" : ""}><LayoutGrid />Semesters</Link>
        <Link href="/colleges" className={pathname.startsWith("/colleges") ? "active" : ""}><Building2 />Others</Link>
        <Link href="/upload" className={pathname === "/upload" ? "active" : ""}><Upload />Uploads</Link>
      </nav>

      {semesterDialog ? <div className="semester-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !createSemester.isPending && !renameSemester.isPending && !removeSemester.isPending) setSemesterDialog(null); }}>
        <section className="semester-dialog shell-semester-dialog" role="dialog" aria-modal="true" aria-labelledby="shell-semester-dialog-title">
          <div className="semester-dialog-header"><h2 id="shell-semester-dialog-title">{semesterDialog === "create" ? "New semester" : semesterDialog === "rename" ? "Rename semester" : "Remove semester"}</h2><button type="button" aria-label="Close dialog" disabled={removeSemester.isPending} onClick={() => setSemesterDialog(null)}><X /></button></div>
          <form onSubmit={submitSemesterDialog}>
            {semesterDialog === "remove" ? <p className="dialog-confirm-copy">Remove <strong>{semesterToRemove?.name}</strong>?</p> : <label className="dialog-field"><span>Semester name</span><input autoFocus value={semesterName} onChange={(event) => setSemesterName(event.target.value)} placeholder="Semester 3" required minLength={2} maxLength={80} /></label>}
            {semesterError ? <p className="dialog-error" role="alert">{semesterError}</p> : null}
            <div className="semester-dialog-actions"><Button type="button" variant="outline" disabled={createSemester.isPending || renameSemester.isPending || removeSemester.isPending} onClick={() => setSemesterDialog(null)}>Cancel</Button><Button type="submit" variant={semesterDialog === "remove" ? "destructive" : "default"} disabled={createSemester.isPending || renameSemester.isPending || removeSemester.isPending || (semesterDialog !== "remove" && semesterName.trim().length < 2)}>{removeSemester.isPending ? "Removing…" : createSemester.isPending || renameSemester.isPending ? "Saving…" : semesterDialog === "remove" ? "Remove" : "Save"}</Button></div>
          </form>
        </section>
      </div> : null}
    </div>
  );
}
