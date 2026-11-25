"use client";

import { PageHeader } from "@/components/page-header";
import { RequireRole } from "@/components/require-role";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminNav } from "@/features/academic/components/admin-nav";
import { RoleManagement } from "@/features/users/components/role-management";
import { StudentDirectory } from "@/features/users/components/student-directory";
import { TeacherDirectory } from "@/features/users/components/teacher-directory";

export default function AdminRolesPage() {
  return (
    <RequireRole roles={["SUB_ADMIN"]}>
      <div className="flex flex-col gap-6">
        <AdminNav />
        <PageHeader
          title="Roles"
          description="Appoint the CR and Co-CR of a batch, review active roles and revoke a role with a reason. One batch holds one CR and one Co-CR; history is kept (A.2)."
        />
        <Tabs defaultValue="assignments">
          <TabsList className="sm:w-[30rem]">
            <TabsTrigger value="assignments">Assignments</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="teachers">Teachers</TabsTrigger>
          </TabsList>
          <TabsContent value="assignments">
            <RoleManagement />
          </TabsContent>
          <TabsContent value="students">
            <StudentDirectory />
          </TabsContent>
          <TabsContent value="teachers">
            <TeacherDirectory />
          </TabsContent>
        </Tabs>
      </div>
    </RequireRole>
  );
}
