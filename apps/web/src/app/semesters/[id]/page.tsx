"use client";

import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/auth-guard";
import { SemesterWorkspace } from "@/features/academic/components/semester-workspace";

export default function SemesterPage() {
  const params = useParams<{ id: string }>();
  return <RequireAuth><SemesterWorkspace semesterId={params.id} /></RequireAuth>;
}
