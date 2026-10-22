import { useState } from "react";
import { LuBell } from "react-icons/lu";
import { useNotificationStore } from "../../stores/useNotificationStore";
import Sheet from "../ui/Sheet";
import NotificationList from "./NotificationList";
import styles from "./NotificationBell.module.css";

// The bell in the header and the 3D HUD: unread count + the notification centre.
export default function NotificationBell({ className = "" }) {
  const [open, setOpen] = useState(false);
  const unread = useNotificationStore((s) => s.unread);
  const markRead = useNotificationStore((s) => s.markRead);

  function toggle() {
    setOpen((v) => !v);
    markRead();
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.bell} ${className}`}
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
      >
        <LuBell aria-hidden="true" />
        {unread > 0 && (
          <span className={styles.count} aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <Sheet
          title="Notifications"
          side="right"
          onClose={() => setOpen(false)}
        >
          <NotificationList onPick={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  );
}
