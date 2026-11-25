"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

/**
 * S2-F3 — shared "give a reason" panel for the verification queues.
 * The API requires 5…500 characters, so the check happens before the request.
 */
export function RejectForm({
  title,
  isPending,
  onCancel,
  onSubmit,
}: {
  title: string;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = reason.trim();

    if (trimmed.length < 5) {
      setError("Give the reason (at least 5 characters)");
      return;
    }

    setError(null);
    await onSubmit(trimmed);
  };

  return (
    <form className="flex w-full flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3" onSubmit={handleSubmit}>
      <label className="text-sm font-medium" htmlFor={`${title}-reject-reason`}>
        {title}
      </label>
      <textarea
        id={`${title}-reject-reason`}
        rows={2}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Explain what is wrong so the person can fix it"
        maxLength={500}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error ? <FieldError>{error}</FieldError> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={isPending}>
          {isPending ? "Saving…" : "Confirm rejection"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
