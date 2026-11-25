"use client";

import { useHasRole } from "@/components/require-role";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentVerificationQueue } from "./student-verification-queue";
import { TeacherVerificationQueue } from "./teacher-verification-queue";

/**
 * S2-F3 — the two queues live behind different roles: students are verified by
 * the CR/Co-CR of the batch (S2-B5), teachers by the Sub Admin (S2-B6). A
 * Platform Admin passes both checks, so it sees both tabs.
 */
export function VerificationQueues() {
  const canSeeStudents = useHasRole(["CR", "CO_CR"]);
  const canSeeTeachers = useHasRole(["SUB_ADMIN"]);

  if (canSeeStudents && canSeeTeachers) {
    return (
      <Tabs defaultValue="students">
        <TabsList className="sm:w-80">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="teachers">Teachers</TabsTrigger>
        </TabsList>
        <TabsContent value="students">
          <StudentVerificationQueue />
        </TabsContent>
        <TabsContent value="teachers">
          <TeacherVerificationQueue />
        </TabsContent>
      </Tabs>
    );
  }

  if (canSeeStudents) return <StudentVerificationQueue />;

  if (canSeeTeachers) return <TeacherVerificationQueue />;

  return (
    <p className="text-sm text-muted-foreground">
      Your account holds no role that can verify registrations. Ask a Platform Admin if you believe this is a
      mistake.
    </p>
  );
}
