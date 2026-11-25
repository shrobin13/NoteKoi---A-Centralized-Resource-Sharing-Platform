"use client";

import { useParams } from "next/navigation";
import { DepartmentDetailView } from "@/features/academic/components/department-detail-view";

export default function DepartmentDetailPage() {
  const params = useParams<{ id: string | string[] }>();
  const raw = params?.id;
  const departmentId = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");

  if (!departmentId) return null;

  return <DepartmentDetailView departmentId={departmentId} />;
}
