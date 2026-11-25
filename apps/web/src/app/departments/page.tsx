import { DepartmentDirectory } from "@/features/academic/components/department-directory";

export const metadata = {
  title: "Departments — NoteKoi",
  description: "Browse departments, sessions and courses across colleges.",
};

export default function DepartmentsPage() {
  return <DepartmentDirectory />;
}
