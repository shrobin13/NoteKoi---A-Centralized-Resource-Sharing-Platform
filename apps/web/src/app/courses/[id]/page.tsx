"use client";

import { useParams } from "next/navigation";
import { CourseResources } from "@/features/resources/components/course-resources";

export default function CourseResourcesPage() {
  const params = useParams<{ id: string }>();
  return <CourseResources courseId={params.id} />;
}