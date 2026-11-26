import { RequireRole } from "@/components/require-role";
import { ModerationQueue } from "@/features/moderation/components/moderation-queue";

export default function ModerationPage() {
  return (
    <RequireRole roles={["CR", "CO_CR", "SUB_ADMIN"]}>
      <ModerationQueue />
    </RequireRole>
  );
}