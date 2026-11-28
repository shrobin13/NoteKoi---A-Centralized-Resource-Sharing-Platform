"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { useSemesters } from "../semester-hooks";

export function SemesterIndex() {
  const router = useRouter();
  const semesters = useSemesters();

  useEffect(() => {
    const first = semesters.data?.[0];
    if (first) router.replace(`/semesters/${first.id}`);
  }, [router, semesters.data]);

  if (semesters.isPending || semesters.data?.length) return <LoadingState label="Loading semesters…" />;
  if (semesters.isError) return <ErrorState title="Could not load semesters" description={semesters.error instanceof Error ? semesters.error.message : undefined} onRetry={() => void semesters.refetch()} />;
  return <EmptyState title="No semesters yet" description="Your class representative has not created a semester for this batch." />;
}
