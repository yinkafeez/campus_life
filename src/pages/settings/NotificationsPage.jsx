import { useEffect } from "react";
import Panel from "../../components/ui/Panel";
import NotificationList from "../../components/nav/NotificationList";
import { useNotificationStore } from "../../stores/useNotificationStore";
import styles from "./SettingsPage.module.css";

// /notifications — the full notification centre (the bell shows the same list).
export default function NotificationsPage() {
  const markRead = useNotificationStore((s) => s.markRead);
  useEffect(() => markRead(), [markRead]);
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Notifications</h1>
      <Panel className={styles.panel}>
        <NotificationList />
      </Panel>
    </div>
  );
}
