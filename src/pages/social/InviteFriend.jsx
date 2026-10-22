import { useState } from "react";
import Button from "../../components/ui/Button";
import { useFriends } from "../../hooks/useSocialQueries";
import { useSendInvitation } from "../../hooks/useCommunityQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import styles from "./SocialPage.module.css";

// Invite one of my friends to a group or an event (invitations are friends-only).
export default function InviteFriend({ groupId, eventId }) {
  const [open, setOpen] = useState(false);
  const [friendId, setFriendId] = useState("");
  const friends = useFriends();
  const invite = useSendInvitation();
  const list = friends.data?.friends ?? [];

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Invite
      </Button>
    );
  }
  if (invite.isSuccess)
    return <span className={styles.ok}>Invitation sent.</span>;

  return (
    <form
      className={styles.actions}
      onSubmit={(e) => {
        e.preventDefault();
        if (friendId)
          invite.mutate({
            toPlayerId: friendId,
            ...(groupId ? { groupId } : { eventId }),
          });
      }}
    >
      <select
        className={styles.select}
        value={friendId}
        onChange={(e) => setFriendId(e.target.value)}
        aria-label="Friend to invite"
      >
        <option value="">
          {list.length ? "Choose a friend" : "No friends yet"}
        </option>
        {list.map((f) => (
          <option key={f.playerId} value={f.playerId}>
            {f.displayName}
          </option>
        ))}
      </select>
      <Button
        type="submit"
        size="sm"
        disabled={!friendId}
        loading={invite.isPending}
      >
        Send
      </Button>
      {invite.error && (
        <span className={styles.error}>{getErrorMessage(invite.error)}</span>
      )}
    </form>
  );
}
