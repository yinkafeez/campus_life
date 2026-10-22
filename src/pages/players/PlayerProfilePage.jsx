import { useNavigate, useParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import ReportButton from "../../components/ReportButton";
import {
  useAcceptFriendRequest,
  useAddRelation,
  useDeclineFriendRequest,
  useProfile,
  useRemoveFriend,
  useSendFriendRequest,
} from "../../hooks/useSocialQueries";
import { useOpenDirect } from "../../hooks/useMessageQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import styles from "./PlayerProfilePage.module.css";

// /players/:username — another player's public profile (what their privacy settings allow).
export default function PlayerProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const profile = useProfile(username);
  const add = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const unfriend = useRemoveFriend();
  const relation = useAddRelation();
  const openDirect = useOpenDirect();

  if (profile.isPending) return <PageLoader label="Loading profile…" />;
  if (profile.error) {
    return (
      <div className={styles.page}>
        <Notice tone="danger">{getErrorMessage(profile.error)}</Notice>
      </div>
    );
  }
  const p = profile.data;
  const error =
    add.error ??
    accept.error ??
    decline.error ??
    unfriend.error ??
    relation.error ??
    openDirect.error;
  const self = p.relationship === "self";

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <div className={styles.head}>
          <div className={styles.avatar} aria-hidden="true">
            {p.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className={styles.name}>{p.displayName}</h1>
            <p className={styles.meta}>
              @{p.username}
              {p.online !== null && (
                <span> · {p.online ? "online" : "offline"}</span>
              )}
            </p>
          </div>
        </div>

        {p.private ? (
          <p className={styles.muted}>
            This player keeps their profile for friends only.
          </p>
        ) : (
          <>
            {p.university && (
              <p className={styles.line}>
                {p.university.shortName}
                {p.level && ` · ${p.level}L`}{" "}
                <span className={styles.simulated}>simulated student</span>
              </p>
            )}
            {p.bio && <p className={styles.bio}>{p.bio}</p>}
          </>
        )}

        {!self && (
          <div className={styles.actions}>
            {p.relationship === "none" && (
              <Button
                onClick={() => add.mutate(p.username)}
                loading={add.isPending}
              >
                Add friend
              </Button>
            )}
            {p.relationship === "request-sent" && (
              <Button
                variant="secondary"
                onClick={() => decline.mutate(p.friendshipId)}
              >
                Cancel request
              </Button>
            )}
            {p.relationship === "request-received" && (
              <>
                <Button onClick={() => accept.mutate(p.friendshipId)}>
                  Accept request
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => decline.mutate(p.friendshipId)}
                >
                  Decline
                </Button>
              </>
            )}
            {p.canMessage && (
              <Button
                variant="secondary"
                onClick={() =>
                  openDirect.mutate(p.playerId, {
                    onSuccess: ({ conversation }) =>
                      navigate(`/social?tab=messages&c=${conversation.id}`),
                  })
                }
              >
                Message
              </Button>
            )}
            {p.relationship === "friends" && (
              <Button
                variant="ghost"
                onClick={() => unfriend.mutate(p.playerId)}
              >
                Remove friend
              </Button>
            )}
          </div>
        )}
        {error && <p className={styles.error}>{getErrorMessage(error)}</p>}
      </section>

      {!self && (
        <section className={styles.card}>
          <h2 className={styles.title}>Safety</h2>
          <div className={styles.actions}>
            <Button
              variant="ghost"
              onClick={() =>
                relation.mutate({ type: "mute", playerId: p.playerId })
              }
            >
              Mute chat
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                relation.mutate(
                  { type: "block", playerId: p.playerId },
                  { onSuccess: () => navigate("/social?tab=safety") },
                )
              }
            >
              Block
            </Button>
            <ReportButton
              targetId={p.playerId}
              context="profile"
              label="Report player"
            />
          </div>
          {relation.isSuccess && (
            <p className={styles.ok}>
              Done. You can undo this in Safety &amp; privacy.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
