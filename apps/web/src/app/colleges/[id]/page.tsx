"use client";

import { useParams } from "next/navigation";
import { CollegeDetailView } from "@/features/academic/components/college-detail-view";

export default function CollegeDetailPage() {
  const params = useParams<{ id: string | string[] }>();
  const raw = params?.id;
  const collegeId = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");

  if (!collegeId) return null;

  return <CollegeDetailView collegeId={collegeId} />;
}
