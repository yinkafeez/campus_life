import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import StatusBadge from "../../components/ui/StatusBadge";
import { useApiHealth } from "../../hooks/useHealthQueries";
import { getErrorMessage } from "../../lib/errorMessages";
import styles from "./StatusPage.module.css";

const DB_TONE = {
  connected: "success",
  connecting: "warning",
  disconnecting: "warning",
  disconnected: "danger",
};

// Health of every part of the stack: this web app, the API, and the database behind it.
export default function StatusPage() {
  const { data, error, isPending, isFetching, refetch } = useApiHealth();

  function renderApi() {
    if (isPending) return <StatusBadge>Checking…</StatusBadge>;
    if (error) return <StatusBadge tone="danger">Unreachable</StatusBadge>;
    return <StatusBadge tone="success">Online</StatusBadge>;
  }

  function renderDb() {
    if (isPending) return <StatusBadge>Checking…</StatusBadge>;
    if (error) return <StatusBadge>Unknown</StatusBadge>;
    const { state } = data.db;
    return (
      <StatusBadge tone={DB_TONE[state] ?? "neutral"}>{state}</StatusBadge>
    );
  }

  return (
    <Panel className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>System status</h1>
          <p className={styles.subtitle}>
            Refreshes automatically every 15 seconds.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={isFetching}
          onClick={() => refetch()}
        >
          Refresh
        </Button>
      </header>

      <dl className={styles.list}>
        <div className={styles.row}>
          <dt>Web app</dt>
          <dd>
            <StatusBadge tone="success">Running</StatusBadge>
            <span className={styles.meta}>{import.meta.env.MODE}</span>
          </dd>
        </div>
        <div className={styles.row}>
          <dt>API</dt>
          <dd>
            {renderApi()}
            {data && (
              <span className={styles.meta}>up {data.uptimeSeconds}s</span>
            )}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>Database</dt>
          <dd>{renderDb()}</dd>
        </div>
      </dl>

      {error && (
        <p className={styles.error} role="alert">
          {getErrorMessage(error)}
        </p>
      )}
    </Panel>
  );
}
