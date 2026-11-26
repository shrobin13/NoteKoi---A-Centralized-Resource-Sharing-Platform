import { RequireAuth } from "@/components/auth-guard";
import { MyUploads } from "@/features/resources/components/my-uploads";

export default function MyUploadsPage() {
  return (
    <RequireAuth>
      <MyUploads />
    </RequireAuth>
  );
}