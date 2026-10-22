import { useState } from "react";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import {
  useAnnounce,
  useOfficialEvent,
  useWelfareGrant,
} from "../../hooks/useElectionQueries";
import { useCampusWorld } from "../../hooks/useCampusQueries";
import { usePlayerSearch } from "../../hooks/useSocialQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import { PRIVILEGES, SCOPES, when } from "./electionText";
import styles from "./Elections.module.css";

const newKey = () =>
  globalThis.crypto?.randomUUID?.().replaceAll("-", "") ??
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/**
 * An elected leader's desk: only the responsibilities their office holds, only for the
 * students it represents (the server enforces both).
 */
export default function OfficeDesk({ offices }) {
  if (!offices.length)
    return <Notice tone="info">You don't hold an office right now.</Notice>;
  return offices.map((o) => (
    <section key={o.id} className={styles.section} aria-label={o.title}>
      <header className={styles.card}>
        <p className={styles.kicker}>
          {SCOPES[o.scope.type]}
          {o.scope.unitName ? ` · ${o.scope.unitName}` : ""} · until{" "}
          {when(o.endsAt)}
        </p>
        <h2 className={styles.cardTitle}>{o.title}</h2>
        <ul className={styles.bullets}>
          {o.privileges.map((p) => (
            <li key={p}>{PRIVILEGES[p] ?? p}</li>
          ))}
        </ul>
        <p className={styles.fine}>
          Office powers are limited to your constituency and never include
          moderation or admin access.
        </p>
      </header>
      {o.privileges.includes("announce") && <Announce office={o} />}
      {o.privileges.includes("official-event") && <OfficialEvent office={o} />}
      {o.privileges.includes("welfare-grant") && o.welfare && (
        <Welfare office={o} />
      )}
    </section>
  ));
}

function Announce({ office }) {
  const announce = useAnnounce();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <form
      className={`${styles.card} ${styles.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        announce.mutate(
          { officeId: office.id, title: title.trim(), body: body.trim() },
          {
            onSuccess: () => {
              setTitle("");
              setBody("");
              toast({ text: "Announcement sent.", tone: "success" });
            },
          },
        );
      }}
    >
      <h3 className={styles.cardTitle}>Post an announcement</h3>
      <label className={styles.label} htmlFor={`a-title-${office.id}`}>
        Title
      </label>
      <input
        id={`a-title-${office.id}`}
        className={styles.input}
        value={title}
        maxLength={120}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <label className={styles.label} htmlFor={`a-body-${office.id}`}>
        Message
      </label>
      <textarea
        id={`a-body-${office.id}`}
        className={styles.textarea}
        rows={3}
        maxLength={1500}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      {announce.error && (
        <Notice tone="danger">{getErrorMessage(announce.error)}</Notice>
      )}
      <Button type="submit" size="sm" loading={announce.isPending}>
        Announce
      </Button>
    </form>
  );
}

function OfficialEvent({ office }) {
  const host = useOfficialEvent();
  const world = useCampusWorld();
  const places = (world.data?.locations ?? []).filter((l) => l.world);
  const [title, setTitle] = useState("");
  const [place, setPlace] = useState("");
  const [start, setStart] = useState("");
  const [hours, setHours] = useState(2);

  function submit(e) {
    e.preventDefault();
    const startsAt = new Date(start);
    host.mutate(
      {
        officeId: office.id,
        title: title.trim(),
        locationSlug: place,
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + hours * 3_600_000).toISOString(),
      },
      {
        onSuccess: (data) => {
          setTitle("");
          toast({
            text: `${data.event.title} is on the events list.`,
            tone: "success",
          });
        },
      },
    );
  }

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <h3 className={styles.cardTitle}>Host an official event</h3>
      <label className={styles.label} htmlFor={`e-title-${office.id}`}>
        Event name
      </label>
      <input
        id={`e-title-${office.id}`}
        className={styles.input}
        value={title}
        maxLength={80}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <label className={styles.label} htmlFor={`e-place-${office.id}`}>
        Place on campus
      </label>
      <select
        id={`e-place-${office.id}`}
        className={styles.select}
        value={place}
        onChange={(e) => setPlace(e.target.value)}
        required
      >
        <option value="">Choose a place…</option>
        {places.map((l) => (
          <option key={l.slug} value={l.slug}>
            {l.name}
          </option>
        ))}
      </select>
      <div className={styles.inline}>
        <label className={styles.label} htmlFor={`e-start-${office.id}`}>
          Starts
        </label>
        <input
          id={`e-start-${office.id}`}
          type="datetime-local"
          className={styles.input}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          required
        />
        <label className={styles.label} htmlFor={`e-hours-${office.id}`}>
          Hours
        </label>
        <input
          id={`e-hours-${office.id}`}
          type="number"
          min={1}
          max={12}
          className={styles.inputSmall}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        />
      </div>
      {host.error && (
        <Notice tone="danger">{getErrorMessage(host.error)}</Notice>
      )}
      <Button type="submit" size="sm" loading={host.isPending}>
        Create event
      </Button>
    </form>
  );
}

function Welfare({ office }) {
  const grant = useWelfareGrant();
  const [q, setQ] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [amount, setAmount] = useState(20);
  const [reason, setReason] = useState("");
  const [requestKey, setRequestKey] = useState(newKey);
  const search = usePlayerSearch(recipient ? "" : q);

  function submit(e) {
    e.preventDefault();
    grant.mutate(
      {
        officeId: office.id,
        recipientId: recipient.playerId,
        amount: Number(amount),
        reason: reason.trim(),
        requestKey, // a retry of the same grant is never paid twice
      },
      {
        onSuccess: (data) => {
          toast({
            text: `Sent ${data.grant.amount} to ${data.grant.recipient.displayName}.`,
            tone: "success",
          });
          setRecipient(null);
          setQ("");
          setReason("");
          setRequestKey(newKey());
        },
      },
    );
  }

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <h3 className={styles.cardTitle}>Welfare grant</h3>
      <p className={styles.meta}>
        {office.welfare.left} of {office.welfare.budget} left this week (game
        money). Grants go to students you represent — never to yourself.
      </p>
      {recipient ? (
        <p className={styles.inline}>
          To <strong>{recipient.displayName}</strong> (@{recipient.username})
          <Button variant="ghost" size="sm" onClick={() => setRecipient(null)}>
            Change
          </Button>
        </p>
      ) : (
        <>
          <label className={styles.label} htmlFor={`w-q-${office.id}`}>
            Find a student
          </label>
          <input
            id={`w-q-${office.id}`}
            className={styles.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Username or name"
          />
          {search.data?.length > 0 && (
            <ul className={styles.list}>
              {search.data.slice(0, 6).map((p) => (
                <li key={p.playerId}>
                  <button
                    type="button"
                    className={styles.row}
                    onClick={() => setRecipient(p)}
                  >
                    {p.displayName}{" "}
                    <span className={styles.meta}>@{p.username}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className={styles.inline}>
        <label className={styles.label} htmlFor={`w-amount-${office.id}`}>
          Amount
        </label>
        <input
          id={`w-amount-${office.id}`}
          type="number"
          min={1}
          max={office.welfare.left || 1}
          className={styles.inputSmall}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <label className={styles.label} htmlFor={`w-reason-${office.id}`}>
        Reason
      </label>
      <input
        id={`w-reason-${office.id}`}
        className={styles.input}
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        required
      />
      {grant.error && (
        <Notice tone="danger">{getErrorMessage(grant.error)}</Notice>
      )}
      <Button
        type="submit"
        size="sm"
        loading={grant.isPending}
        disabled={!recipient || office.welfare.left < 1}
      >
        Send grant
      </Button>
    </form>
  );
}
