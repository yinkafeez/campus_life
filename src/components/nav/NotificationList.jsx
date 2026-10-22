import { Link } from "react-router-dom";
import { useNotificationStore } from "../../stores/useNotificationStore";
import styles from "./NotificationList.module.css";

const ago = (at) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return `${Math.floor(s / 3600)} h ago`;
};

// What happened while you were busy (this session): messages, invites, results…
export default function NotificationList({ onPick }) {
  const items = useNotificationStore((s) => s.items);
  const clear = useNotificationStore((s) => s.clear);
  if (!items.length)
    return (
      <p className={styles.empty}>
        Nothing new. Friend requests, messages, invitations and results show up
        here.
      </p>
    );
  return (
    <>
      <ol className={styles.list}>
        {items.map((n) => {
          const body = (
            <>
              {n.title && <span className={styles.title}>{n.title}</span>}
              <span className={styles.text}>{n.text}</span>
              <span className={styles.time}>{ago(n.at)}</span>
            </>
          );
          return (
            <li key={n.id}>
              {n.link ? (
                <Link to={n.link} className={styles.item} onClick={onPick}>
                  {body}
                </Link>
              ) : (
                <div className={styles.item}>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" className={styles.clear} onClick={clear}>
        Clear all
      </button>
    </>
  );
}
