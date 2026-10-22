import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LuSend, LuX } from "react-icons/lu";
import { useRemotePlayers } from "../../game/multiplayer/useRemotePlayers";
import { sendZoneChat } from "../../hooks/useRealtime";
import ReportButton from "../../components/ReportButton";
import styles from "./ZoneChat.module.css";

// friendly, respectful openers players can send with one tap
const QUICK_LINES = [
  "How far? 👋",
  "Good morning, everyone",
  "Who dey go 2001 Cafeteria?",
  "Abeg, which way to the library?",
];

/**
 * Zone chat: everyone standing in this zone. Phone numbers, emails and @handles are hidden
 * by the server (don't share contact details with strangers). Lines can be reported.
 */
export default function ZoneChat({ myPlayerId, askFor, onClose }) {
  const chat = useRemotePlayers((s) => s.chat);
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [range, setRange] = useState("zone"); // zone = everyone here; nearby = within ~15 m
  const list = useRef(null);

  useEffect(() => {
    list.current?.scrollTo?.({ top: list.current.scrollHeight });
  }, [chat.length]);

  async function send(line) {
    const message = line.trim();
    if (!message || sending) return;
    setSending(true);
    const ack = await sendZoneChat(message, { range });
    setSending(false);
    if (ack?.ok) {
      setText("");
      setError(null);
    } else setError(ack?.error?.message ?? "Message not sent.");
  }

  return (
    <section className={styles.chat} aria-label="Zone chat">
      <header className={styles.head}>
        <p className={styles.title}>Chat</p>
        <div
          className={styles.ranges}
          role="radiogroup"
          aria-label="Who hears you"
        >
          {[
            ["zone", "Everyone here"],
            ["nearby", "Nearby"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={range === key}
              className={range === key ? styles.rangeOn : styles.range}
              onClick={() => setRange(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close chat"
        >
          <LuX aria-hidden="true" />
        </button>
      </header>

      <ol className={styles.lines} ref={list}>
        {chat.length === 0 && (
          <li className={styles.empty}>
            No one has said anything yet. Say hi!
          </li>
        )}
        {chat.map((line) => {
          const mine = line.from.playerId === myPlayerId;
          return (
            <li key={line.id} className={mine ? styles.mine : styles.line}>
              {line.from.username && !mine ? (
                <Link
                  to={`/players/${line.from.username}`}
                  className={styles.who}
                >
                  {line.from.displayName}
                </Link>
              ) : (
                <span className={styles.who}>
                  {mine ? "You" : line.from.displayName}
                </span>
              )}
              {line.range === "nearby" && (
                <span className={styles.nearbyTag}>nearby</span>
              )}
              <span className={styles.text}>{line.text}</span>
              {!mine && (
                <ReportButton
                  compact
                  targetId={line.from.playerId}
                  context="chat"
                  chatId={line.id}
                  label="Report this message"
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.quick}>
        {(askFor
          ? [`Please, how do I get to ${askFor}?`, ...QUICK_LINES]
          : QUICK_LINES
        ).map((line) => (
          <button
            key={line}
            type="button"
            className={styles.quickLine}
            onClick={() => send(line)}
            disabled={sending}
          >
            {line}
          </button>
        ))}
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Say something nice…"
          aria-label="Chat message"
        />
        <button
          type="submit"
          className={styles.send}
          disabled={sending || !text.trim()}
          aria-label="Send"
        >
          <LuSend aria-hidden="true" />
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
      <p className={styles.fineprint}>
        Keep it respectful. Never share your phone number or address in public
        chat.
      </p>
    </section>
  );
}
