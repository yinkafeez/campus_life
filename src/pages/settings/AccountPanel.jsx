import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Panel from "../../components/ui/Panel";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import {
  changePassword,
  deleteMyAccount,
  exportMyData,
} from "../../api/accountApi";
import { getErrorMessage } from "../../lib/errorMessages";
import { closeSocket } from "../../lib/socket";
import { forgetVisit } from "../../lib/lastVisit";
import { queryKeys } from "../../hooks/queryKeys";
import { toast } from "../../stores/useToastStore";
import styles from "./SettingsPage.module.css";

const CONFIRM = "DELETE MY ACCOUNT";

function download(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "campus-life-my-data.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Account security and data rights: password, a copy of my data, deleting the account.
export default function AccountPanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const password = useMutation({
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast({
        text: "Password changed. Your other devices were signed out.",
        tone: "success",
      });
    },
  });
  const exporting = useMutation({
    mutationFn: exportMyData,
    onSuccess: ({ export: data }) => download(data),
  });
  const removal = useMutation({
    mutationFn: () => deleteMyAccount(deletePassword, confirm),
    onSuccess: () => {
      closeSocket();
      forgetVisit();
      queryClient.clear();
      queryClient.setQueryData(queryKeys.currentUser, null);
      navigate("/register", { replace: true });
      toast({ text: "Your account was deleted. Goodbye!", tone: "success" });
    },
  });

  return (
    <>
      <Panel className={styles.panel}>
        <h2 className={styles.section}>Password</h2>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            password.mutate();
          }}
        >
          <label className={styles.field}>
            Current password
            <input
              type="password"
              className={styles.input}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            New password
            <input
              type="password"
              className={styles.input}
              autoComplete="new-password"
              minLength={10}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
            />
            <span className={styles.hint}>
              10+ characters with a letter and a number. Changing it signs out
              your other devices.
            </span>
          </label>
          {password.error && (
            <Notice tone="danger">{getErrorMessage(password.error)}</Notice>
          )}
          <Button type="submit" size="sm" loading={password.isPending}>
            Change password
          </Button>
        </form>
      </Panel>

      <Panel className={styles.panel}>
        <h2 className={styles.section}>Your data</h2>
        <p className={styles.hint}>
          Download a copy of everything Campus Life keeps about you (JSON). Your
          votes are secret: we only store that you voted.
        </p>
        <Button
          variant="secondary"
          size="sm"
          loading={exporting.isPending}
          onClick={() => exporting.mutate()}
        >
          Download my data
        </Button>
        {exporting.error && (
          <Notice tone="danger">{getErrorMessage(exporting.error)}</Notice>
        )}
      </Panel>

      <Panel className={`${styles.panel} ${styles.danger}`}>
        <h2 className={styles.section}>Delete account</h2>
        <p className={styles.hint}>
          This erases your login, character, money, items, studies and
          friendships for good. Messages you sent stay in your friends’ chats as
          “[message deleted]”, and finished election results stay as they are
          (shown as “Deleted player”). This can’t be undone.
        </p>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            removal.mutate();
          }}
        >
          <label className={styles.field}>
            Password
            <input
              type="password"
              className={styles.input}
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              required
            />
          </label>
          <label className={styles.field}>
            Type <strong>{CONFIRM}</strong> to confirm
            <input
              className={styles.input}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          {removal.error && (
            <Notice tone="danger">{getErrorMessage(removal.error)}</Notice>
          )}
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            loading={removal.isPending}
            disabled={confirm !== CONFIRM || !deletePassword}
          >
            Delete my account
          </Button>
        </form>
      </Panel>
    </>
  );
}
