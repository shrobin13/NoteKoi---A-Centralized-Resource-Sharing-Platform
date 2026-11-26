import { RequireAuth } from "@/components/auth-guard";
import { NotificationList } from "@/features/notifications/components/notification-list";

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationList />
    </RequireAuth>
  );
}