-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "resources" DROP CONSTRAINT "resources_semesterCourseId_fkey";

-- DropForeignKey
ALTER TABLE "semester_courses" DROP CONSTRAINT "semester_courses_teacherProfileId_fkey";

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_semesterCourseId_fkey" FOREIGN KEY ("semesterCourseId") REFERENCES "semester_courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semester_courses" ADD CONSTRAINT "semester_courses_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "unique_category_course_name" RENAME TO "categories_semesterCourseId_name_key";

-- RenameIndex
ALTER INDEX "unique_semester_course" RENAME TO "semester_courses_semesterId_courseId_key";

-- RenameIndex
ALTER INDEX "unique_semester_id_department" RENAME TO "semesters_id_departmentId_key";

-- RenameIndex
ALTER INDEX "unique_semester_scope_name" RENAME TO "semesters_collegeId_departmentId_sessionId_name_key";
