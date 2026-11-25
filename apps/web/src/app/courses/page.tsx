import { CourseDirectory } from "@/features/academic/components/course-directory";

export const metadata = {
  title: "Courses — NoteKoi",
  description: "Search courses by department and semester.",
};

export default function CoursesPage() {
  return <CourseDirectory />;
}
