"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_ACCOUNT_GROUPS } from "../demo-accounts";

/**
 * DEV ONLY — the "Demo accounts" panel under the login form.
 *
 * `app/(auth)/login/page.tsx` is the only importer, and it owns the build-time
 * gate (`NODE_ENV !== "production" && NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === "true"`),
 * so a production build never renders this card. The list itself lives in
 * `../demo-accounts.ts` (one file, kept in sync with `DEMO_ROWS` in the seed) and
 * folds to `[]` outside development — no seed address is bundled.
 *
 * A row click fills the email field and nothing else — the password is typed by
 * the human from `SEED_PASSWORD` in `apps/api/.env` and is never shown or stored.
 */
export function DemoAccountsPanel({ onPick }: { onPick: (email: string) => void }) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Demo accounts
          <Badge variant="warning">dev only</Badge>
        </CardTitle>
        <CardDescription>
          Seeded by <code className="font-mono">npm run db:seed</code>. Click an account to fill the email field, then
          type the seed password yourself (<code className="font-mono">SEED_PASSWORD</code> in{" "}
          <code className="font-mono">apps/api/.env</code>) — it is never displayed here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {DEMO_ACCOUNT_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
            <p className="text-xs text-muted-foreground">{group.description}</p>
            <ul className="flex flex-col gap-1">
              {group.accounts.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => onPick(account.email)}
                    className="flex w-full flex-col items-start gap-1 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm">{account.email}</span>
                      <Badge variant="secondary">{account.role}</Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">{account.note}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
