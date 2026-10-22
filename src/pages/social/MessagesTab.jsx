import { useEffect, useRef, useState } from "react";
import { LuSend } from "react-icons/lu";
import Button from "../../components/ui/Button";
import ReportButton from "../../components/ReportButton";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import {
  useConversations,
  useMarkRead,
  useMessages,
  useSendMessage,
} from "../../hooks/useMessageQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { formatTime } from "../../lib/chatTime";
import styles from "./SocialPage.module.css";

export default function MessagesTab({ openId, onOpen }) {
  const conversations = useConversations();
  const list = conversations.data ?? [];

  return (
    <div className={styles.split}>
      <section className={styles.card} aria-label="Conversations">
        <h2 className={styles.cardTitle}>Inbox</h2>
        {conversations.isPending && <p className={styles.muted}>Loading…</p>}
        {!conversations.isPending && list.length === 0 && !openId && (
          <p className={styles.muted}>
            No messages yet. Message a friend from the Friends tab.
          </p>
        )}
        <div className={styles.list}>
          {list.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`${styles.row} ${styles.rowButton} ${c.unread ? styles.unread : ""}`}
              onClick={() => onOpen(c.id)}
              aria-current={openId === c.id || undefined}
            >
              <div className={styles.rowMain}>
                <p className={styles.name}>
                  {c.type === "group"
                    ? `# ${c.group?.name ?? "Group"}`
                    : c.with.displayName}
                </p>
                <p className={styles.meta}>{c.lastMessage}</p>
              </div>
              {c.unread && <span className={styles.badge}>new</span>}
            </button>
          ))}
        </div>
      </section>
      {openId ? (
        <Thread
          key={openId}
          conversationId={openId}
          conversation={list.find((el) => el.id === openId)}
        />
      ) : (
        <section className={styles.card}>
          <p className={styles.muted}>Pick a conversation.</p>
        </section>
      )}
    </div>
  );
}

function Thread({ conversationId, conversation }) {
  const { data: session } = useCurrentUser();
  const me = session?.player?._id;
  const messages = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const { mutate: markRead } = useMarkRead();
  const [text, setText] = useState("");
  const scroller = useRef(null);
  const count = messages.data?.messages.length ?? 0;

  useEffect(() => {
    markRead(conversationId);
  }, [conversationId, count, markRead]);
  useEffect(() => {
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight });
  }, [count]);

  const title = conversation
    ? conversation.type === "group"
      ? `# ${conversation.group?.name}`
      : conversation.with.displayName
    : "Conversation";

  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.cardTitle}>{title}</h2>
      {messages.error && (
        <p className={styles.error}>{getErrorMessage(messages.error)}</p>
      )}
      <div className={styles.thread} ref={scroller}>
        {messages.data?.messages.length === 0 && (
          <p className={styles.muted}>Say hello 👋</p>
        )}
        {messages.data?.messages.map((m) => {
          const mine = String(m.sender) === String(me);
          return (
            <div
              key={m.id}
              className={mine ? styles.bubbleMine : styles.bubble}
            >
              <p>{m.text}</p>
              <p className={styles.bubbleMeta}>
                {formatTime(m.createdAt)}
                {!mine && (
                  <ReportButton
                    compact
                    targetId={m.sender}
                    context="message"
                    messageId={m.id}
                    label="Report this message"
                  />
                )}
              </p>
            </div>
          );
        })}
      </div>
      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          send.mutate(text.trim(), { onSuccess: () => setText("") });
        }}
      >
        <input
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Write a message"
          aria-label="Message"
        />
        <Button
          type="submit"
          size="sm"
          loading={send.isPending}
          aria-label="Send message"
        >
          <LuSend aria-hidden="true" />
        </Button>
      </form>
      {send.error && (
        <p className={styles.error}>{getErrorMessage(send.error)}</p>
      )}
    </section>
  );
}
