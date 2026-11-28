import { RequireAuth } from "@/components/auth-guard";
import { SemesterIndex } from "@/features/academic/components/semester-index";

export default function SemestersPage() {
  return <RequireAuth><SemesterIndex /></RequireAuth>;
}
