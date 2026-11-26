import { RequireAuth } from "@/components/auth-guard";
import { MyFiles } from "@/features/folders/components/my-files";

export default function MyFilesPage() {
  return (
    <RequireAuth>
      <MyFiles />
    </RequireAuth>
  );
}