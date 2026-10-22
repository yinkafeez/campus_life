import { useState } from "react";
import { LuFlag } from "react-icons/lu";
import { useSendReport } from "../hooks/useSocialQueries";
import { getErrorMessage } from "../lib/errorMessages";
import { REPORT_REASONS } from "../lib/reportReasons";
import styles from "./ReportButton.module.css";

/**
 * Report a player to moderators. `context` says where it happened; for chat/messages pass
 * chatId / messageId so the server attaches what was actually said.
 */
export default function ReportButton({
  targetId,
  context,
  messageId,
  chatId,
  label = "Report",
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("harassment");
  const [details, setDetails] = useState("");
  const report = useSendReport();

  if (report.isSuccess) {
    return (
      <span className={styles.done}>
        Reported. Thank you — moderators will review it.
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className={compact ? styles.iconOnly : styles.trigger}
        onClick={() => setOpen(true)}
        aria-label={compact ? label : undefined}
        title={label}
      >
        <LuFlag aria-hidden="true" />
        {!compact && <span>{label}</span>}
      </button>
    );
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        report.mutate({
          targetId,
          context,
          reason,
          ...(details.trim() && { details: details.trim() }),
          ...(messageId && { messageId }),
          ...(chatId && { chatId }),
        });
      }}
    >
      <label className={styles.label}>
        What happened?
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={styles.select}
        >
          {REPORT_REASONS.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <textarea
        className={styles.details}
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Anything moderators should know (optional)"
        aria-label="Details"
      />
      {report.error && (
        <p className={styles.error}>{getErrorMessage(report.error)}</p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancel}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.send}
          disabled={report.isPending}
        >
          Send report
        </button>
      </div>
    </form>
  );
}
