/**
 * DEV ONLY — the `@notekoi.local` accounts created by `apps/api/prisma/seed.ts`.
 *
 * Mirrors `DEMO_ROWS` in the seed (and the playbook, Section 6 → DEMO ACCOUNTS):
 * if an account changes there, change it here too. Only the email, the role and
 * a short "what to test" note are kept — the seed password is NEVER stored here:
 * the login page fills the email field only and the human types `SEED_PASSWORD`
 * from `apps/api/.env`.
 *
 * Reached exclusively through `features/auth/components/demo-accounts-panel.tsx`,
 * which `app/(auth)/login/page.tsx` imports inside the same build-time constant
 * used below. In a production bundle that constant is a literal `false`, so the
 * ternary only ever yields `[]` and the minifier drops the dataset — no
 * `@notekoi.local` address is emitted (check with
 * `findstr /s /i "notekoi.local" apps\web\.next\static\*.*`). Keep the data
 * *inside* that ternary: that is the one shape the minifier deletes reliably.
 */
const DEMO_EMAIL_DOMAIN = "@notekoi.local";

const demoEmail = (localPart: string): string => `${localPart}${DEMO_EMAIL_DOMAIN}`;

export type DemoAccount = {
  email: string;
  /** Role the account holds, in the admin UI's words (CR, Co-CR, Sub Admin, …). */
  role: string;
  /** One line: what this account is there to prove. */
  note: string;
};

export type DemoAccountGroup = {
  title: string;
  description: string;
  accounts: readonly DemoAccount[];
};

const row = (localPart: string, role: string, note: string): DemoAccount => ({
  email: demoEmail(localPart),
  role,
  note,
});

const group = (title: string, description: string, accounts: readonly DemoAccount[]): DemoAccountGroup => ({
  title,
  description,
  accounts,
});

/**
 * 22 accounts, grouped the way the login panel lists them
 * (Admins 3 · CR/Co-CR 4 · Students 6 · Teachers 4 · Edge cases 5).
 * Every one of them signs in with `SEED_PASSWORD`.
 */
export const DEMO_ACCOUNT_GROUPS: readonly DemoAccountGroup[] =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS === "true"
    ? [
        group("Admins", "Platform Admin and one Sub Admin per college.", [
          row("admin", "Platform Admin", "Every /admin/* screen, Sub Admin appointment + emergency, ?status=all"),
          row("subadmin", "Sub Admin · College A", "Teacher queue, appoint/revoke CR + Co-CR, teacher departments"),
          row("subadmin-b", "Sub Admin · College B", "Same screens, College B scope only — College A rows hidden"),
        ]),
        group("CR / Co-CR", "Batch representatives — every seeded batch already holds its CR, so 409s come first.", [
          row("cr", "CR · CSE 2022-23", "Approve/reject student-pending; the queue holds this batch only"),
          row("cocr", "Co-CR · CSE 2022-23", "Identical powers; the Co-CR slot is taken → 409 ROLE_SLOT_TAKEN"),
          row("cr-old", "CR · CSE 2021-22", "Old batch: must not see the 2022-23 queue"),
          row("cr-eee", "CR · EEE 2022-23", "EEE queue only"),
        ]),
        group("Students", "Verified students across both colleges, departments and batches.", [
          row("student1", "Student · CSE 2022-23", "Plain student: no admin link, 403 FORBIDDEN_ROLE on /users/*"),
          row("student2", "Student · CSE 2022-23", "Second seat of the batch (a second approve/reject target)"),
          row("student-old", "Student · CSE 2021-22", "Other batch: invisible to cr, visible to cr-old"),
          row("student-eee", "Student · EEE 2022-23", "Other department: invisible to cr"),
          row("student-b", "Student · College B", "Other college, includeOtherColleges OFF"),
          row("student-b-optin", "Student · College B", "includeOtherColleges ON (from S3: cross-college read-only)"),
        ]),
        group("Teachers", "Verified teachers — S3 uploaders and Sub Admin candidates.", [
          row("teacher1", "Teacher · CSE", "S3 uploader; also a Sub Admin candidate"),
          row("teacher2", "Teacher · CSE", "Second teacher of the same department"),
          row("teacher-multi", "Teacher · CSE + EEE", "Two taught departments (1–20 rule)"),
          row("teacher-b", "Teacher · College B", "Other-college teacher"),
        ]),
        group("Edge cases", "Non-happy-path states — each one lands on a specific error code or queue.", [
          row("student-pending", "Student · PENDING_VERIFICATION", "Sits in the CR queue; approve → ACTIVE"),
          row("student-rejected", "Student · REJECTED", "Shows the stored rejected reason"),
          row("student-noemail", "Student · email not verified", "Login → 403 EMAIL_NOT_VERIFIED"),
          row("teacher-pending", "Teacher · PENDING_VERIFICATION", "Sub Admin approves, then assigns 1–2 departments"),
          row("suspended", "Student · SUSPENDED", "Login → 403 ACCOUNT_SUSPENDED"),
        ]),
      ]
    : [];
