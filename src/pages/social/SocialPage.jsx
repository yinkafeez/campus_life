import { useSearchParams } from "react-router-dom";
import { useConversations } from "../../hooks/useMessageQueries";
import { useFriends } from "../../hooks/useSocialQueries";
import { useInvitations } from "../../hooks/useCommunityQueries";
import FriendsTab from "./FriendsTab";
import MessagesTab from "./MessagesTab";
import GroupsTab from "./GroupsTab";
import EventsTab from "./EventsTab";
import SafetyTab from "./SafetyTab";
import styles from "./SocialPage.module.css";

const TABS = [
  ["friends", "Friends"],
  ["messages", "Messages"],
  ["groups", "Groups"],
  ["events", "Hangouts"],
  ["safety", "Safety & privacy"],
];

// /social — friends, messages, groups, hangouts and safety settings in one place.
export default function SocialPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([key]) => key === params.get("tab"))
    ? params.get("tab")
    : "friends";
  const friends = useFriends();
  const conversations = useConversations();
  const invitations = useInvitations();

  const badge = {
    friends: friends.data?.incoming.length ?? 0,
    messages: conversations.data?.filter((el) => el.unread).length ?? 0,
    events: invitations.data?.length ?? 0,
  };

  const go = (next, extra = {}) => setParams({ tab: next, ...extra });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Campus social</h1>
        <p className={styles.subtitle}>
          Meet people, gist, plan hangouts — and stay safe while you do.
        </p>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="Social">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? styles.tabOn : styles.tab}
            onClick={() => go(key)}
          >
            {label}
            {badge[key] > 0 && (
              <span className={styles.badge}>{badge[key]}</span>
            )}
          </button>
        ))}
      </nav>

      <div className={styles.body}>
        {tab === "friends" && (
          <FriendsTab onMessage={(id) => go("messages", { c: id })} />
        )}
        {tab === "messages" && (
          <MessagesTab
            openId={params.get("c")}
            onOpen={(id) => go("messages", id ? { c: id } : {})}
          />
        )}
        {tab === "groups" && (
          <GroupsTab onOpenChat={(id) => go("messages", { c: id })} />
        )}
        {tab === "events" && <EventsTab />}
        {tab === "safety" && <SafetyTab />}
      </div>
    </div>
  );
}
