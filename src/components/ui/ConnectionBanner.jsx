import { useEffect, useState } from "react";
import { LuWifiOff } from "react-icons/lu";
import styles from "./ConnectionBanner.module.css";

const online = () =>
  typeof navigator === "undefined" || navigator.onLine !== false;

/**
 * "You're offline" strip: shown when the browser loses the network or the live
 * connection drops for more than a moment (brief reconnects stay silent).
 */
export default function ConnectionBanner({ live = "online" }) {
  const [network, setNetwork] = useState(online);
  const [liveDown, setLiveDown] = useState(false);

  useEffect(() => {
    const update = () => setNetwork(online());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // only a drop that lasts a few seconds is worth a banner
  useEffect(() => {
    const down = live === "offline";
    const timer = setTimeout(() => setLiveDown(down), down ? 4000 : 0);
    return () => clearTimeout(timer);
  }, [live]);

  if (network && !(liveDown && live === "offline")) return null;
  return (
    <p className={styles.banner} role="status">
      <LuWifiOff aria-hidden="true" />
      {network
        ? "Live connection lost — reconnecting… Saved progress is safe."
        : "You're offline. Reconnect to keep playing — nothing you've saved is lost."}
    </p>
  );
}
