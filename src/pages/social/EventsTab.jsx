import { useState } from "react";
import Button from "../../components/ui/Button";
import { useCampusWorld } from "../../hooks/useCampusQueries";
import {
  useAnswerInvitation,
  useCancelEvent,
  useCreateEvent,
  useEvents,
  useGroups,
  useInvitations,
  useRsvp,
} from "../../hooks/useCommunityQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import InviteFriend from "./InviteFriend";
import styles from "./SocialPage.module.css";

const KINDS = [
  ["hangout", "Hangout / gist"],
  ["study", "Study session"],
  ["party", "Party / birthday"],
  ["sports", "Sports"],
  ["worship", "Fellowship / prayer"],
  ["other", "Other"],
];

const when = (iso) =>
  new Date(iso).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function EventsTab() {
  const events = useEvents();
  const invitations = useInvitations();
  const answer = useAnswerInvitation();
  const rsvp = useRsvp();
  const cancel = useCancelEvent();
  const error = answer.error ?? rsvp.error ?? cancel.error;

  return (
    <>
      {invitations.data?.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Invitations</h2>
          <div className={styles.list}>
            {invitations.data.map((inv) => (
              <div key={inv.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <p className={styles.name}>
                    {inv.kind === "group" ? inv.group?.name : inv.event?.title}
                  </p>
                  <p className={styles.meta}>
                    From {inv.from.displayName}
                    {inv.event && ` · ${when(inv.event.startsAt)}`}
                  </p>
                </div>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    onClick={() => answer.mutate({ id: inv.id, accept: true })}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => answer.mutate({ id: inv.id, accept: false })}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <CreateEvent />
      {error && <p className={styles.error}>{getErrorMessage(error)}</p>}

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Upcoming on campus</h2>
        {events.isPending && <p className={styles.muted}>Loading…</p>}
        {events.data?.length === 0 && (
          <p className={styles.muted}>
            Nothing planned yet. Start a hangout at 2001 or the Lagoon Front!
          </p>
        )}
        <div className={styles.list}>
          {events.data?.map((ev) => (
            <div key={ev.id} className={styles.row}>
              <div className={styles.rowMain}>
                <p className={styles.name}>{ev.title}</p>
                <p className={styles.meta}>
                  {when(ev.startsAt)} · {ev.location.name} · {ev.attending}/
                  {ev.capacity} going
                  {ev.visibility !== "public" &&
                    ` · ${ev.visibility === "friends" ? "friends only" : "group only"}`}
                </p>
                {ev.description && (
                  <p className={styles.muted}>{ev.description}</p>
                )}
              </div>
              <div className={styles.actions}>
                {ev.isHost ? (
                  <>
                    <InviteFriend eventId={ev.id} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancel.mutate(ev.id)}
                    >
                      Cancel event
                    </Button>
                  </>
                ) : ev.isAttending ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => rsvp.mutate({ id: ev.id, going: false })}
                  >
                    Not going
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => rsvp.mutate({ id: ev.id, going: true })}
                    disabled={ev.attending >= ev.capacity}
                  >
                    {ev.attending >= ev.capacity ? "Full" : "I'm going"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

// datetime-local value for "in an hour", rounded to the quarter hour
function defaultStart() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CreateEvent() {
  const [open, setOpen] = useState(false);
  const campus = useCampusWorld();
  const groups = useGroups();
  const create = useCreateEvent();
  const places = (campus.data?.locations ?? []).filter((el) => el.world);
  const [form, setForm] = useState({
    title: "",
    description: "",
    kind: "hangout",
    locationSlug: "",
    startsAt: defaultStart(),
    hours: "2",
    visibility: "public",
    capacity: "20",
    groupId: "",
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>Plan a hangout</Button>
      </div>
    );
  }
  if (!campus.data?.university) {
    return (
      <p className={styles.muted}>
        Get admitted to a university to plan hangouts on its campus.
      </p>
    );
  }

  function submit(e) {
    e.preventDefault();
    const start = new Date(form.startsAt);
    const end = new Date(start.getTime() + Number(form.hours) * 3600 * 1000);
    create.mutate(
      {
        title: form.title.trim(),
        ...(form.description.trim() && {
          description: form.description.trim(),
        }),
        kind: form.kind,
        locationSlug: form.locationSlug || places[0]?.slug,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        visibility: form.visibility,
        capacity: Number(form.capacity),
        ...(form.visibility === "group" &&
          form.groupId && { groupId: form.groupId }),
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  const myGroups = (groups.data ?? []).filter((g) => g.isMember);
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Plan a hangout</h2>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.fields}>
          <label className={styles.label}>
            What
            <input
              className={styles.input}
              value={form.title}
              onChange={set("title")}
              minLength={3}
              maxLength={80}
              required
              placeholder="Jollof and gist at 2001"
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
            Where
            <select
              className={styles.select}
              value={form.locationSlug || places[0]?.slug || ""}
              onChange={set("locationSlug")}
            >
              {places.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Starts
            <input
              className={styles.input}
              type="datetime-local"
              value={form.startsAt}
              onChange={set("startsAt")}
              required
            />
          </label>
          <label className={styles.label}>
            Hours
            <select
              className={styles.select}
              value={form.hours}
              onChange={set("hours")}
            >
              {["1", "2", "3", "4", "6"].map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            Who can see it
            <select
              className={styles.select}
              value={form.visibility}
              onChange={set("visibility")}
            >
              <option value="public">Everyone at my university</option>
              <option value="friends">My friends</option>
              {myGroups.length > 0 && (
                <option value="group">One of my groups</option>
              )}
            </select>
          </label>
          {form.visibility === "group" && (
            <label className={styles.label}>
              Group
              <select
                className={styles.select}
                value={form.groupId}
                onChange={set("groupId")}
                required
              >
                <option value="">Choose…</option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={styles.label}>
            Max people
            <input
              className={styles.input}
              type="number"
              min={2}
              max={500}
              value={form.capacity}
              onChange={set("capacity")}
            />
          </label>
        </div>
        <label className={styles.label}>
          Details (optional)
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
            Create
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
