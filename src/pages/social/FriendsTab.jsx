import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import {
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useFriends,
  usePlayerSearch,
  useSendFriendRequest,
} from "../../hooks/useSocialQueries";
import { useOpenDirect } from "../../hooks/useMessageQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import styles from "./SocialPage.module.css";

export function PlayerName({ player }) {
  return (
    <span>
      {player.online !== null && player.online !== undefined && (
        <span
          className={player.online ? styles.dotOn : styles.dot}
          aria-label={player.online ? "Online" : "Offline"}
        />
      )}
      <Link to={`/players/${player.username}`} className={styles.nameLink}>
        {player.displayName}
      </Link>{" "}
      <span className={styles.meta}>@{player.username}</span>
    </span>
  );
}

export default function FriendsTab({ onMessage }) {
  const [q, setQ] = useState("");
  const friends = useFriends();
  const search = usePlayerSearch(q);
  const send = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const openDirect = useOpenDirect();
  const data = friends.data ?? { friends: [], incoming: [], outgoing: [] };
  const known = new Set(
    [...data.friends, ...data.incoming, ...data.outgoing].map((el) =>
      String(el.playerId),
    ),
  );
  const error = send.error ?? accept.error ?? decline.error ?? openDirect.error;

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Find people</h2>
        <input
          className={styles.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username"
          aria-label="Search players by username"
        />
        {search.data?.length > 0 && (
          <div className={styles.list}>
            {search.data.map((p) => (
              <div key={p.playerId} className={styles.row}>
                <div className={styles.rowMain}>
                  <PlayerName player={p} />
                </div>
                {!known.has(String(p.playerId)) && (
                  <Button
                    size="sm"
                    onClick={() => send.mutate(p.username)}
                    loading={send.isPending && send.variables === p.username}
                  >
                    Add friend
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {search.data?.length === 0 && (
          <p className={styles.muted}>No player found with that username.</p>
        )}
        {error && <p className={styles.error}>{getErrorMessage(error)}</p>}
      </section>

      {data.incoming.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Friend requests</h2>
          <div className={styles.list}>
            {data.incoming.map((p) => (
              <div key={p.friendshipId} className={styles.row}>
                <div className={styles.rowMain}>
                  <PlayerName player={p} />
                </div>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    onClick={() => accept.mutate(p.friendshipId)}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => decline.mutate(p.friendshipId)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          Your friends {data.friends.length > 0 && `(${data.friends.length})`}
        </h2>
        {friends.isPending && <p className={styles.muted}>Loading…</p>}
        {!friends.isPending && data.friends.length === 0 && (
          <p className={styles.muted}>
            No friends yet. Say hi to people at 2001 Cafeteria or search for a
            coursemate above.
          </p>
        )}
        <div className={styles.list}>
          {data.friends.map((p) => (
            <div key={p.friendshipId} className={styles.row}>
              <div className={styles.rowMain}>
                <PlayerName player={p} />
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  openDirect.mutate(p.playerId, {
                    onSuccess: ({ conversation }) => onMessage(conversation.id),
                  })
                }
              >
                Message
              </Button>
            </div>
          ))}
        </div>
      </section>

      {data.outgoing.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Requests you sent</h2>
          <div className={styles.list}>
            {data.outgoing.map((p) => (
              <div key={p.friendshipId} className={styles.row}>
                <div className={styles.rowMain}>
                  <PlayerName player={p} />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => decline.mutate(p.friendshipId)}
                >
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
