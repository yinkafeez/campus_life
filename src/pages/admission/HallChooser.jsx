import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useHostels, useRequestBed } from "../../hooks/useAccommodationQueries";
import { useCurrentUser, useUpdatePlayer } from "../../hooks/useAuthQueries";
import { queryKeys } from "../../hooks/queryKeys";
import { getErrorMessage } from "../../lib/errorMessages";
import Button from "../../components/ui/Button";
import Notice from "../../components/ui/Notice";
import ErrorState from "../../components/ui/ErrorState";
import { toast } from "../../stores/useToastStore";
import styles from "./HallChooser.module.css";

const GENDER_WORD = {
  male: "Male hall",
  female: "Female hall",
  mixed: "Mixed",
};

/**
 * A stalite's first step: pick your hall of residence from the list. The room is assigned at
 * once (no ballot for returning students) and the player goes straight to their hostel.
 */
export default function HallChooser() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useCurrentUser();
  const hostels = useHostels();
  const choose = useRequestBed();
  const setGender = useUpdatePlayer();
  const [picked, setPicked] = useState(null);
  const gender = session?.player?.gender;

  if (hostels.isPending) return <p className={styles.muted}>Loading halls…</p>;
  if (hostels.error)
    return <ErrorState error={hostels.error} onRetry={hostels.refetch} />;

  // halls you could live in first, the rest after (with the reason)
  const list = [...hostels.data.hostels].sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) || a.name.localeCompare(b.name),
  );
  const genderMissing = list.some((h) =>
    h.problems.some((p) => p.includes("character gender")),
  );

  function confirm() {
    choose.mutate(picked, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.myStudent });
        toast({ text: "Your room is ready. Welcome home!", tone: "success" });
        navigate("/hostel");
      },
    });
  }

  return (
    <div className={styles.box}>
      <h2 className={styles.title}>Choose your hall of residence</h2>
      <p className={styles.muted}>
        As a returning student you pick your hall. Your room and roommates are
        assigned straight away.
      </p>

      {genderMissing && !gender && (
        <div className={styles.gender}>
          <p>Halls are for male or female students. Your character is:</p>
          <div className={styles.inline}>
            {["female", "male"].map((g) => (
              <Button
                key={g}
                size="sm"
                variant="secondary"
                loading={
                  setGender.isPending && setGender.variables?.gender === g
                }
                onClick={() =>
                  setGender.mutate(
                    { gender: g },
                    { onSuccess: () => hostels.refetch() },
                  )
                }
              >
                {g === "female" ? "Female" : "Male"}
              </Button>
            ))}
          </div>
        </div>
      )}

      <ul
        className={styles.list}
        role="radiogroup"
        aria-label="Halls of residence"
      >
        {list.map((h) => (
          <li key={h.slug}>
            <label
              className={
                !h.eligible
                  ? styles.hallOff
                  : picked === h.slug
                    ? styles.hallOn
                    : styles.hall
              }
            >
              <input
                type="radio"
                name="hall"
                value={h.slug}
                disabled={!h.eligible}
                checked={picked === h.slug}
                onChange={() => setPicked(h.slug)}
              />
              <span className={styles.name}>{h.name}</span>
              <span className={styles.meta}>
                {GENDER_WORD[h.residentGender] ?? ""}
                {h.capacity > 0 && ` · ${h.bedsLeft} beds left`}
              </span>
              {!h.eligible && h.problems[0] && (
                <span className={styles.why}>{h.problems[0]}</span>
              )}
            </label>
          </li>
        ))}
      </ul>

      {choose.error && (
        <Notice tone="danger">{getErrorMessage(choose.error)}</Notice>
      )}
      <Button
        size="lg"
        disabled={!picked}
        loading={choose.isPending}
        onClick={confirm}
      >
        Move into {list.find((h) => h.slug === picked)?.name ?? "this hall"}
      </Button>
    </div>
  );
}
