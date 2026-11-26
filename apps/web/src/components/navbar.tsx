"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Bell, BookOpen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLogout, useMe } from "@/features/auth/hooks/use-auth";
import { useUnreadNotificationCount } from "@/features/notifications/hooks";
import { cn } from "@/lib/utils";

const AUTH_ROUTES = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password"];

const roleLabel = (role: string): string =>
  role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const unreadNotifications = useUnreadNotificationCount(Boolean(me.data));
  const logout = useLogout();

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

  const isAuthPage = AUTH_ROUTES.some((route) => pathname === route);
  const roles = me.data?.roles ?? [];

  return (
    <header className="border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <BookOpen className="size-5" aria-hidden />
          NoteKoi
        </Link>

        <nav className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {me.isPending ? <Skeleton className="h-8 w-40" /> : null}

          {me.data ? (
            <>
              <Link
                href="/dashboard"
                className={cn(
                  "rounded-md px-3 py-2 font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
                  pathname === "/dashboard" && "bg-accent text-foreground",
                )}
              >
                Dashboard
              </Link>

              <Button asChild variant="ghost" size="icon" title="Notifications" className="relative">
                <Link
                  href="/notifications"
                  aria-label={`Notifications${unreadNotifications.data ? `, ${unreadNotifications.data} unread` : ""}`}
                >
                  <Bell aria-hidden />
                  {unreadNotifications.data ? (
                    <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 text-destructive-foreground">
                      {unreadNotifications.data > 9 ? "9+" : unreadNotifications.data}
                    </span>
                  ) : null}
                </Link>
              </Button>

              {roles.map((role) => (
                <Badge key={role.id} variant="outline">
                  {roleLabel(role.role)}
                </Badge>
              ))}

              <span className="hidden px-2 text-muted-foreground sm:inline">{me.data.name}</span>

              <Button variant="outline" size="sm" onClick={onLogout} disabled={logout.isPending}>
                {logout.isPending ? "Signing out…" : "Sign out"}
              </Button>
            </>
          ) : null}

          {!me.isPending && !me.data ? (
            isAuthPage ? (
              <Link href="/" className="px-3 py-2 text-muted-foreground hover:text-foreground">
                Home
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-md px-3 py-2 font-medium hover:bg-accent">
                  Sign in
                </Link>
                <Button asChild size="sm">
                  <Link href="/register">Create account</Link>
                </Button>
              </>
            )
          ) : null}
        </nav>
      </div>
    </header>
  );
}
