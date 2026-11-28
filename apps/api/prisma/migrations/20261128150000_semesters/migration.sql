CREATE TABLE "semesters" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "semester_courses" (
    "id" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "name" TEXT,
    "teacherProfileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "semester_courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "semesterCourseId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "resources"
    ADD COLUMN "semesterCourseId" UUID,
    ADD COLUMN "categoryId" UUID;

CREATE UNIQUE INDEX "unique_semester_scope_name"
    ON "semesters"("collegeId", "departmentId", "sessionId", "name");
CREATE UNIQUE INDEX "unique_semester_id_department"
    ON "semesters"("id", "departmentId");
CREATE INDEX "idx_semester_scope"
    ON "semesters"("collegeId", "departmentId", "sessionId");

CREATE UNIQUE INDEX "unique_semester_course"
    ON "semester_courses"("semesterId", "courseId");
CREATE INDEX "idx_semester_course_course"
    ON "semester_courses"("courseId");
CREATE INDEX "idx_semester_course_teacher"
    ON "semester_courses"("teacherProfileId");

CREATE UNIQUE INDEX "unique_category_course_name"
    ON "categories"("semesterCourseId", "name");
CREATE INDEX "idx_category_semester_course"
    ON "categories"("semesterCourseId");
CREATE INDEX "idx_resource_semester_course_category"
    ON "resources"("semesterCourseId", "categoryId");

ALTER TABLE "semesters"
    ADD CONSTRAINT "semesters_collegeId_departmentId_fkey"
    FOREIGN KEY ("collegeId", "departmentId") REFERENCES "college_departments"("collegeId", "departmentId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "semesters_sessionId_departmentId_fkey"
    FOREIGN KEY ("sessionId", "departmentId") REFERENCES "sessions"("id", "departmentId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "semesters_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "semester_courses"
    ADD CONSTRAINT "semester_courses_semesterId_fkey"
    FOREIGN KEY ("semesterId") REFERENCES "semesters"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "semester_courses_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "courses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "semester_courses_teacherProfileId_fkey"
    FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "categories"
    ADD CONSTRAINT "categories_semesterCourseId_fkey"
    FOREIGN KEY ("semesterCourseId") REFERENCES "semester_courses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "categories_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "resources"
    ADD CONSTRAINT "resources_semesterCourseId_fkey"
    FOREIGN KEY ("semesterCourseId") REFERENCES "semester_courses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "resources_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
