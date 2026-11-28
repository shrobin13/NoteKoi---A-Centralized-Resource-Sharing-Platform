export interface SemesterListItem {
  id: string;
  name: string;
  collegeId: string;
  departmentId: string;
  sessionId: string;
  collegeDepartment: { college: { name: string }; department: { name: string } };
  session: { name: string };
  _count: { courses: number };
}

export interface SemesterCategory {
  id: string;
  name: string;
  isSystem: boolean;
  fileCount: number;
}

export interface SemesterCourse {
  id: string;
  courseId: string;
  name: string;
  teacherProfileId: string | null;
  teacherName: string | null;
  fileCount: number;
  categories: SemesterCategory[];
}

export interface SemesterDetail {
  id: string;
  name: string;
  college: string;
  department: string;
  session: string;
  courses: SemesterCourse[];
}

export interface SemesterCourseMutation {
  courseId?: string;
  courseName?: string;
  semesterNumber?: number;
  teacherProfileId?: string | null;
}
