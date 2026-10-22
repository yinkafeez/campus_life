import { useState } from "react";
import Button from "../../components/ui/Button";
import {
  useCreateGroup,
  useGroups,
  useJoinGroup,
  useLeaveGroup,
} from "../../hooks/useCommunityQueries";
import { useOpenGroupChat } from "../../hooks/useMessageQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import InviteFriend from "./InviteFriend";
import styles from "./SocialPage.module.css";

const KINDS = [
  ["study", "Study group"],
  ["faith", "Fellowship / faith"],
  ["sports", "Sports"],
  ["culture", "Culture & arts"],
  ["hangout", "Hangout crew"],
  ["department", "Department / class"],
  ["other", "Other"],
];
const kindLabel = Object.fromEntries(KINDS);

export default function GroupsTab({ onOpenChat }) {
  const groups = useGroups();
  const join = useJoinGroup();
  const leave = useLeaveGroup();
  const openChat = useOpenGroupChat();
  const error = join.error ?? leave.error ?? openChat.error;
  const mine = (groups.data ?? []).filter((g) => g.isMember);
  const others = (groups.data ?? []).filter((g) => !g.isMember);

  return (
    <>
      <CreateGroup />
      {error && <p className={styles.error}>{getErrorMessage(error)}</p>}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Your groups</h2>
        {mine.length === 0 && (
          <p className={styles.muted}>You haven’t joined any group yet.</p>
        )}
        <div className={styles.list}>
          {mine.map((g) => (
            <div key={g.id} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.name}>{g.name}</p>
                <p className={styles.meta}>
                  {kindLabel[g.kind]} · {g.memberCount} member
                  {g.memberCount === 1 ? "" : "s"}
                  {g.visibility === "invite" && " · invite only"}
                  {g.isOwner && " · you run it"}
                </p>
              </div>
              <div className={styles.actions}>
                <Button
                  size="sm"
                  onClick={() =>
                    openChat.mutate(g.id, {
                      onSuccess: ({ conversation }) =>
                        onOpenChat(conversation.id),
                    })
                  }
                >
                  Group chat
                </Button>
                <InviteFriend groupId={g.id} />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => leave.mutate(g.id)}
                >
                  Leave
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Groups on campus</h2>
        {others.length === 0 && (
          <p className={styles.muted}>No open groups yet — start one!</p>
        )}
        <div className={styles.list}>
          {others.map((g) => (
            <div key={g.id} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.name}>{g.name}</p>
                <p className={styles.meta}>
                  {kindLabel[g.kind]} · {g.memberCount} member
                  {g.memberCount === 1 ? "" : "s"}
                </p>
                {g.description && (
                  <p className={styles.muted}>{g.description}</p>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => join.mutate(g.id)}
                loading={join.isPending && join.variables === g.id}
              >
                Join
              </Button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function CreateGroup() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    kind: "study",
    visibility: "public",
  });
  const create = useCreateGroup();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>Start a group</Button>
      </div>
    );
  }
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Start a group</h2>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(
            {
              ...form,
              name: form.name.trim(),
              description: form.description.trim() || undefined,
            },
            { onSuccess: () => setOpen(false) },
          );
        }}
      >
        <div className={styles.fields}>
          <label className={styles.label}>
            Name
            <input
              className={styles.input}
              value={form.name}
              onChange={set("name")}
              minLength={3}
              maxLength={60}
              required
              placeholder="e.g. CSC 100L Study Circle"
            />
          </label>
          <label className={styles.label}>
            Type
            <select
              className={styles.select}
              value={form.kind}
              onChange={set("kind")}
            >
              {KINDS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Who can join
            <select
              className={styles.select}
              value={form.visibility}
              onChange={set("visibility")}
            >
              <option value="public">Anyone at my university</option>
              <option value="invite">Only people I invite</option>
            </select>
          </label>
        </div>
        <label className={styles.label}>
          About (optional)
          <textarea
            className={styles.textarea}
            value={form.description}
            onChange={set("description")}
            maxLength={500}
            rows={2}
          />
        </label>
        {create.error && (
          <p className={styles.error}>{getErrorMessage(create.error)}</p>
        )}
        <div className={styles.actions}>
          <Button type="submit" loading={create.isPending}>
            Create group
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
