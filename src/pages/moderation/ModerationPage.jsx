import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import PageLoader from "../../components/ui/PageLoader";
import ErrorState from "../../components/ui/ErrorState";
import { useCurrentUser } from "../../hooks/useAuthQueries";
import {
  getModerationHistory,
  getReports,
  liftSanctions,
  resolveReport,
} from "../../api/accountApi";
import { getErrorMessage } from "../../lib/errorMessages";
import { toast } from "../../stores/useToastStore";
import styles from "../elections/Elections.module.css";

const STATUSES = [
  ["open", "Open"],
  ["actioned", "Actioned"],
  ["dismissed", "Dismissed"],
];
const ACTIONS = [
  ["none", "Dismiss (no action)"],
  ["warn", "Warn"],
  ["mute-chat", "Mute chat"],
  ["suspend", "Suspend account"],
];
const when = (iso) =>
  new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// /moderation — reports from players, the evidence the server captured, and actions.
// Admin accounts only (the API refuses everyone else).
export default function ModerationPage() {
  const { data: session } = useCurrentUser();
  const [status, setStatus] = useState("open");
  const reports = useQuery({
    queryKey: ["moderation", "reports", status],
    queryFn: async ({ signal }) =>
      (await getReports(status, { signal })).reports,
    enabled: session?.user?.role === "admin",
  });

  if (session?.user?.role !== "admin")
    return (
      <div className={styles.page}>
        <Notice tone="info">Moderation is for the game’s moderators.</Notice>
      </div>
    );

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Moderation</h1>
        <p className={styles.muted}>
          Player reports with the evidence the server captured. Actions notify
          the player; mutes and suspensions can be lifted from their record.
        </p>
      </header>
      <nav className={styles.tabs} role="tablist" aria-label="Reports">
        {STATUSES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={status === key}
            className={status === key ? styles.tabOn : styles.tab}
            onClick={() => setStatus(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {reports.isPending && <PageLoader label="Loading reports…" />}
      {reports.error && (
        <ErrorState error={reports.error} onRetry={reports.refetch} />
      )}
      {reports.data?.length === 0 && (
        <Notice tone="info">No {status} reports.</Notice>
      )}
      <ol className={styles.feed}>
        {reports.data?.map((r) => (
          <ReportCard key={r._id} report={r} />
        ))}
      </ol>
    </div>
  );
}

function ReportCard({ report: r }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState("warn");
  const [hours, setHours] = useState(24);
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const resolve = useMutation({
    mutationFn: () =>
      resolveReport(r._id, {
        action,
        ...(["mute-chat", "suspend"].includes(action) && {
          durationHours: Number(hours),
        }),
        ...(note.trim() && { note: note.trim() }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moderation"] });
      toast({ text: "Report resolved.", tone: "success" });
    },
  });

  return (
    <li className={styles.card}>
      <p className={styles.kicker}>
        {r.reason} · {r.context} · {when(r.createdAt)}
      </p>
      <p>
        <strong>{r.target?.displayName ?? "Unknown"}</strong>
        {r.target?.username && ` (@${r.target.username})`} reported by{" "}
        {r.reporter?.displayName ?? "a player"}
      </p>
      {r.evidence?.text && (
        <blockquote className={styles.body}>“{r.evidence.text}”</blockquote>
      )}
      {r.details && <p className={styles.meta}>Reporter: {r.details}</p>}
      {r.resolution?.action && (
        <p className={styles.meta}>
          Resolved: {r.resolution.action}
          {r.resolution.durationHours &&
            ` (${r.resolution.durationHours} h)`}{" "}
          by {r.resolution.by} · {r.resolution.note}
        </p>
      )}
      {r.status === "open" && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            resolve.mutate();
          }}
        >
          <div className={styles.inline}>
            <select
              className={styles.select}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              aria-label="Action"
            >
              {ACTIONS.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {["mute-chat", "suspend"].includes(action) && (
              <label className={styles.inline}>
                Hours
                <input
                  type="number"
                  min={1}
                  max={8760}
                  className={styles.inputSmall}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </label>
            )}
          </div>
          <input
            className={styles.input}
            placeholder="Note for the record (optional)"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
          />
          {resolve.error && (
            <Notice tone="danger">{getErrorMessage(resolve.error)}</Notice>
          )}
          <div className={styles.inline}>
            <Button type="submit" size="sm" loading={resolve.isPending}>
              Resolve
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "Hide record" : "Player record"}
            </Button>
          </div>
        </form>
      )}
      {showHistory && r.target?.playerId && (
        <PlayerRecord playerId={r.target.playerId} />
      )}
    </li>
  );
}

function PlayerRecord({ playerId }) {
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["moderation", "player", playerId],
    queryFn: async ({ signal }) =>
      (await getModerationHistory(playerId, { signal })).history,
  });
  const lift = useMutation({
    mutationFn: () => liftSanctions(playerId, "Lifted by a moderator"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["moderation"] });
      toast({ text: "Restrictions lifted.", tone: "success" });
    },
  });
  if (history.isPending) return <p className={styles.meta}>Loading…</p>;
  if (history.error)
    return <ErrorState error={history.error} onRetry={history.refetch} />;
  const { sanctions, reports } = history.data;
  const restricted = sanctions.chatMutedUntil || sanctions.suspendedUntil;
  return (
    <div className={styles.section}>
      <p className={styles.meta}>
        {reports.length} report{reports.length === 1 ? "" : "s"} about this
        player.{" "}
        {sanctions.chatMutedUntil &&
          `Chat muted until ${when(sanctions.chatMutedUntil)}. `}
        {sanctions.suspendedUntil &&
          `Suspended until ${when(sanctions.suspendedUntil)}.`}
        {!restricted && "No active restrictions."}
      </p>
      {restricted && (
        <Button
          size="sm"
          variant="secondary"
          loading={lift.isPending}
          onClick={() => lift.mutate()}
        >
          Lift restrictions
        </Button>
      )}
    </div>
  );
}
