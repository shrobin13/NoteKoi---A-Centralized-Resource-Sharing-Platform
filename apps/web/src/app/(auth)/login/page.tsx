"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/features/auth/hooks/use-auth";
import { loginSchema, type LoginValues } from "@/features/auth/schemas";
import { ApiError } from "@/lib/api";

/**
 * DEV ONLY — the demo-accounts panel under the form (DEMO ACCOUNTS table in the
 * playbook, Section 6; the list lives in `features/auth/demo-accounts.ts`).
 *
 * Both operands are inlined at build time: `NODE_ENV` is `"production"` for
 * `next build`, and `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS` comes from
 * `apps/web/.env.local` (`false` in `.env.example`, unset on Vercel). In a
 * production build this folds to `null`: the panel is never rendered and its
 * `import()` never runs, and `demo-accounts.ts` wraps the dataset in the same
 * constant, so it ships as `[]` — no `@notekoi.local` address is emitted into
 * `.next/static` or `.next/server` (checked with `findstr`). The panel's own
 * data-free chunk may still be emitted; nothing references or fetches it.
 */
const showDemoAccounts =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === "true";

const DemoAccountsPanel = showDemoAccounts
  ? dynamic(() =>
      import("@/features/auth/components/demo-accounts-panel").then((module) => module.DemoAccountsPanel),
    )
  : null;

export default function LoginPage() {
  const router = useRouter();
  const login = useLogin();
  const [blockedEmail, setBlockedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  /** DEV ONLY: a demo row fills the email field — the password stays a human input. */
  const pickDemoAccount = (email: string) => {
    setValue("email", email, { shouldValidate: true, shouldDirty: true });
    setFocus("password");
    toast.success("Email filled in — type the seed password to sign in.");
  };

  const onSubmit = handleSubmit(async (values) => {
    setBlockedEmail(null);

    try {
      const session = await login.mutateAsync(values);
      toast.success(`Welcome back, ${session.user.name}.`);
      router.push("/dashboard");
    } catch (error) {
      if (!(error instanceof ApiError)) {
        toast.error("Something went wrong. Please try again.");
        return;
      }

      if (error.code === "EMAIL_NOT_VERIFIED") {
        setBlockedEmail(values.email);
        return;
      }

      toast.error(error.message);
    }
  });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use the email you registered with.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {blockedEmail ? (
            <Alert variant="warning">
              <AlertTitle>Verify your email first</AlertTitle>
              <AlertDescription>
                We sent a 6-digit code to {blockedEmail}.{" "}
                <Link
                  href={`/verify-email?email=${encodeURIComponent(blockedEmail)}`}
                  className="font-medium underline underline-offset-4"
                >
                  Enter the code
                </Link>
              </AlertDescription>
            </Alert>
          ) : null}

          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <FormField id="login-email" label="Email" error={errors.email?.message}>
              <Input id="login-email" type="email" autoComplete="email" {...register("email")} />
            </FormField>

            <FormField id="login-password" label="Password" error={errors.password?.message}>
              <Input id="login-password" type="password" autoComplete="current-password" {...register("password")} />
            </FormField>

            <Button type="submit" disabled={isSubmitting || login.isPending}>
              {isSubmitting || login.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <Link href="/forgot-password" className="text-muted-foreground underline underline-offset-4">
              Forgot your password?
            </Link>
            <Link href="/register" className="font-medium underline underline-offset-4">
              Create an account
            </Link>
          </div>
        </CardContent>
      </Card>

      {DemoAccountsPanel ? <DemoAccountsPanel onPick={pickDemoAccount} /> : null}
    </div>
  );
}
