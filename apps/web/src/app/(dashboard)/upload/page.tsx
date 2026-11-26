import { RequireAuth } from "@/components/auth-guard";
import { ResourceUploadForm } from "@/features/resources/components/resource-upload-form";

export default function UploadPage() {
  return (
    <RequireAuth>
      <ResourceUploadForm />
    </RequireAuth>
  );
}