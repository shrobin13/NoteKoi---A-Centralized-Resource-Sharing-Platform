-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProfileVerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "UserRoleType" AS ENUM ('CR', 'CO_CR', 'SUB_ADMIN', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('DEPARTMENT_SESSION', 'COLLEGE', 'PLATFORM');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('STANDARD', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ResourceState" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('PRIVATE', 'COLLEGE', 'PERMITTED', 'PLATFORM');

-- CreateEnum
CREATE TYPE "VersionState" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('GOOGLE_DRIVE', 'LOCAL', 'S3');

-- CreateEnum
CREATE TYPE "DriveAccessType" AS ENUM ('PRIVATE', 'ANYONE_READ');

-- CreateEnum
CREATE TYPE "FolderState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('RESOURCE_APPROVED', 'RESOURCE_REJECTED', 'RESOURCE_SHARED', 'RESOURCE_DELETED', 'DELETION_APPROVED', 'DELETION_DENIED');

-- CreateTable
CREATE TABLE "colleges" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colleges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "college_departments" (
    "id" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "adoptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "college_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "semester" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "regNo" TEXT NOT NULL,
    "verificationStatus" "ProfileVerificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "rejectedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "UserRoleType" NOT NULL,
    "scope" "RoleScope" NOT NULL,
    "collegeId" UUID,
    "departmentId" UUID,
    "sessionId" UUID,
    "assignedById" UUID,
    "appointmentType" "AppointmentType" NOT NULL DEFAULT 'STANDARD',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "reason" TEXT,
    "revokedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "verificationStatus" "ProfileVerificationStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "rejectedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_departments" (
    "id" UUID NOT NULL,
    "teacherProfileId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionRequest" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationEscalation" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "reportId" UUID,
    "deletionRequestId" UUID,
    "escalatedById" UUID NOT NULL,
    "assignedToId" UUID,
    "reason" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "justification" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "courseId" UUID,
    "sessionId" UUID,
    "folderId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "tags" TEXT,
    "resourceType" TEXT NOT NULL,
    "audience" "AudienceType" NOT NULL,
    "state" "ResourceState" NOT NULL DEFAULT 'PENDING',
    "currentVersionId" UUID,
    "promotedById" UUID,
    "promotedAt" TIMESTAMP(3),
    "deletionFlaggedById" UUID,
    "deletionFlaggedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_versions" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "physicalFileId" UUID,
    "externalUrl" TEXT,
    "state" "VersionState" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID NOT NULL,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_files" (
    "id" UUID NOT NULL,
    "contentHash" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL,
    "driveFileId" TEXT,
    "driveFolderId" TEXT,
    "driveWebViewLink" TEXT,
    "driveWebContentLink" TEXT,
    "driveAccessType" "DriveAccessType" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" UUID,
    "ownerId" UUID NOT NULL,
    "courseId" UUID,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "state" "FolderState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_batch_grants" (
    "id" UUID NOT NULL,
    "resourceId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "grantedById" UUID NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_batch_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "colleges_name_key" ON "colleges"("name");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE INDEX "idx_college_department" ON "college_departments"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "college_departments_collegeId_departmentId_key" ON "college_departments"("collegeId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_departmentId_name_key" ON "sessions"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_id_departmentId_key" ON "sessions"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_departmentId_name_key" ON "courses"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "courses_id_departmentId_key" ON "courses"("id", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_userId_key" ON "student_profiles"("userId");

-- CreateIndex
CREATE INDEX "idx_student_department_session" ON "student_profiles"("departmentId", "sessionId");

-- CreateIndex
CREATE INDEX "idx_student_verification_status" ON "student_profiles"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "student_profiles_collegeId_regNo_key" ON "student_profiles"("collegeId", "regNo");

-- CreateIndex
CREATE INDEX "idx_user_role_user_revoked" ON "user_roles"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "idx_user_role_college_role_revoked" ON "user_roles"("collegeId", "role", "revokedAt");

-- CreateIndex
CREATE INDEX "idx_user_role_department_session_role" ON "user_roles"("departmentId", "sessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_userId_key" ON "teacher_profiles"("userId");

-- CreateIndex
CREATE INDEX "idx_teacher_verification_status" ON "teacher_profiles"("collegeId", "verificationStatus");

-- CreateIndex
CREATE INDEX "idx_teacher_department" ON "teacher_departments"("departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_departments_teacherProfileId_departmentId_key" ON "teacher_departments"("teacherProfileId", "departmentId");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_resourceId_idx" ON "Report"("resourceId");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- CreateIndex
CREATE INDEX "DeletionRequest_status_createdAt_idx" ON "DeletionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeletionRequest_resourceId_idx" ON "DeletionRequest"("resourceId");

-- CreateIndex
CREATE INDEX "DeletionRequest_requesterId_idx" ON "DeletionRequest"("requesterId");

-- CreateIndex
CREATE INDEX "ModerationEscalation_status_createdAt_idx" ON "ModerationEscalation"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationEscalation_resourceId_idx" ON "ModerationEscalation"("resourceId");

-- CreateIndex
CREATE INDEX "ModerationEscalation_assignedToId_status_idx" ON "ModerationEscalation"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Comment_resourceId_createdAt_idx" ON "Comment"("resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "audit_log_actor_created_at_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "notification_user_read_created_at_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "resources_currentVersionId_key" ON "resources"("currentVersionId");

-- CreateIndex
CREATE INDEX "idx_resource_college_department_session" ON "resources"("collegeId", "departmentId", "sessionId");

-- CreateIndex
CREATE INDEX "idx_resource_uploader" ON "resources"("uploaderId");

-- CreateIndex
CREATE INDEX "idx_resource_folder" ON "resources"("folderId");

-- CreateIndex
CREATE INDEX "idx_resource_course" ON "resources"("courseId");

-- CreateIndex
CREATE INDEX "idx_resource_audience_state" ON "resources"("audience", "state");

-- CreateIndex
CREATE INDEX "idx_resource_state_department_session_createdAt" ON "resources"("state", "departmentId", "sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "resources_id_collegeId_departmentId_key" ON "resources"("id", "collegeId", "departmentId");

-- CreateIndex
CREATE INDEX "idx_resource_version_physical_file" ON "resource_versions"("physicalFileId");

-- CreateIndex
CREATE INDEX "idx_resource_version_state" ON "resource_versions"("state");

-- CreateIndex
CREATE UNIQUE INDEX "resource_versions_resourceId_versionNo_key" ON "resource_versions"("resourceId", "versionNo");

-- CreateIndex
CREATE UNIQUE INDEX "resource_versions_id_resourceId_key" ON "resource_versions"("id", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "physical_files_contentHash_key" ON "physical_files"("contentHash");

-- CreateIndex
CREATE INDEX "idx_folder_parent" ON "folders"("parentId");

-- CreateIndex
CREATE INDEX "idx_folder_owner" ON "folders"("ownerId");

-- CreateIndex
CREATE INDEX "idx_folder_course" ON "folders"("courseId");

-- CreateIndex
CREATE INDEX "idx_resource_batch_grant_session" ON "resource_batch_grants"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "resource_batch_grants_resourceId_sessionId_key" ON "resource_batch_grants"("resourceId", "sessionId");

-- AddForeignKey
ALTER TABLE "college_departments" ADD CONSTRAINT "college_departments_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_departments" ADD CONSTRAINT "college_departments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_collegeId_departmentId_fkey" FOREIGN KEY ("collegeId", "departmentId") REFERENCES "college_departments"("collegeId", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_sessionId_departmentId_fkey" FOREIGN KEY ("sessionId", "departmentId") REFERENCES "sessions"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_departments" ADD CONSTRAINT "teacher_departments_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_departments" ADD CONSTRAINT "teacher_departments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeletionRequest" ADD CONSTRAINT "DeletionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscalation" ADD CONSTRAINT "ModerationEscalation_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscalation" ADD CONSTRAINT "ModerationEscalation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscalation" ADD CONSTRAINT "ModerationEscalation_deletionRequestId_fkey" FOREIGN KEY ("deletionRequestId") REFERENCES "DeletionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscalation" ADD CONSTRAINT "ModerationEscalation_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationEscalation" ADD CONSTRAINT "ModerationEscalation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "colleges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "resource_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_deletionFlaggedById_fkey" FOREIGN KEY ("deletionFlaggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_collegeId_departmentId_fkey" FOREIGN KEY ("collegeId", "departmentId") REFERENCES "college_departments"("collegeId", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_physicalFileId_fkey" FOREIGN KEY ("physicalFileId") REFERENCES "physical_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_versions" ADD CONSTRAINT "resource_versions_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_batch_grants" ADD CONSTRAINT "resource_batch_grants_resourceId_collegeId_departmentId_fkey" FOREIGN KEY ("resourceId", "collegeId", "departmentId") REFERENCES "resources"("id", "collegeId", "departmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_batch_grants" ADD CONSTRAINT "resource_batch_grants_sessionId_departmentId_fkey" FOREIGN KEY ("sessionId", "departmentId") REFERENCES "sessions"("id", "departmentId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_batch_grants" ADD CONSTRAINT "resource_batch_grants_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
