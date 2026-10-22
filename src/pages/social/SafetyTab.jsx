import Button from "../../components/ui/Button";
import {
  usePrivacy,
  useRelations,
  useRemoveRelation,
  useUpdatePrivacy,
} from "../../hooks/useSocialQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import styles from "./SocialPage.module.css";

const AUDIENCES = [
  ["everyone", "Everyone"],
  ["friends", "Friends only"],
  ["nobody", "Nobody"],
];

export default function SafetyTab() {
  const privacy = usePrivacy();
  const update = useUpdatePrivacy();
  const relations = useRelations();
  const remove = useRemoveRelation();
  const p = privacy.data;
  const change = (key, value) => update.mutate({ [key]: value });

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Privacy</h2>
        {privacy.isPending && <p className={styles.muted}>Loading…</p>}
        {p && (
          <div className={styles.form}>
            <div className={styles.fields}>
              <label className={styles.label}>
                Who can see my profile
                <select
                  className={styles.select}
                  value={p.profileVisibility}
                  onChange={(e) => change("profileVisibility", e.target.value)}
                >
                  {AUDIENCES.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.label}>
                Who can message me
                <select
                  className={styles.select}
                  value={p.messagesFrom}
                  onChange={(e) => change("messagesFrom", e.target.value)}
                >
                  {AUDIENCES.map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={p.allowFriendRequests}
                onChange={(e) =>
                  change("allowFriendRequests", e.target.checked)
                }
              />
              Allow friend requests
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={p.showOnline}
                onChange={(e) => change("showOnline", e.target.checked)}
              />
              Show when I’m online
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={p.shareActivity}
                onChange={(e) => change("shareActivity", e.target.checked)}
              />
              Tell my friends what I’m doing on campus (e.g. “eating at 2001”)
            </label>
            {update.error && (
              <p className={styles.error}>{getErrorMessage(update.error)}</p>
            )}
            {update.isSuccess && <p className={styles.ok}>Saved.</p>}
          </div>
        )}
        <p className={styles.muted}>
          Your email and real identity are never shown to other players.
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Blocked and muted</h2>
        <p className={styles.muted}>
          Blocked players can’t message you, add you, invite you, or see you in
          the world. Muted players’ zone chat is hidden from you. They are not
          told.
        </p>
        {["blocked", "muted"].map((kind) => (
          <div key={kind} className={styles.list}>
            <p className={styles.name}>
              {kind === "blocked" ? "Blocked" : "Muted"}
            </p>
            {relations.data?.[kind].length === 0 && (
              <p className={styles.muted}>No one.</p>
            )}
            {relations.data?.[kind].map((r) => (
              <div key={r.playerId} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.name}>{r.displayName}</p>
                  <p className={styles.meta}>@{r.username}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    remove.mutate({
                      type: kind === "blocked" ? "block" : "mute",
                      playerId: r.playerId,
                    })
                  }
                >
                  {kind === "blocked" ? "Unblock" : "Unmute"}
                </Button>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Staying safe</h2>
        <p className={styles.tip}>
          Never send money, your phone number, home address or passwords to
          someone you met in the game. No one can sell you admission, results or
          a hostel space — this game is a simulation. Report anyone who tries.
        </p>
      </section>
    </>
  );
}
