// Words shown for election states and rules (the API sends keys).
export const PHASES = {
  scheduled: { label: "Opens soon", tone: "neutral" },
  nominations: { label: "Nominations open", tone: "success" },
  campaign: { label: "Campaigning", tone: "warning" },
  voting: { label: "Voting open", tone: "success" },
  counting: { label: "Counting · disputes window", tone: "warning" },
  disputed: { label: "Under review", tone: "danger" },
  certified: { label: "Results certified", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
  void: { label: "No result", tone: "neutral" },
};

export const SCOPES = {
  university: "Students' Union",
  faculty: "Faculty",
  department: "Department",
  hall: "Hall of residence",
};

export const PRIVILEGES = {
  announce: "Post announcements to your constituency",
  "official-event": "Host official events",
  "welfare-grant": "Give welfare grants (game money) from a weekly budget",
};

export const CAMPAIGN_KINDS = {
  poster: "Poster",
  speech: "Speech",
  event: "Campaign event",
  "debate-answer": "Debate answer",
};

export const TIE_BREAKS = {
  "drawing-of-lots":
    "drawing of lots — a random order fixed (and sealed with a hash) before voting began",
  "earliest-nomination": "the earliest nomination wins",
};

export const SCHEDULE = [
  ["nominationsOpenAt", "Nominations open"],
  ["nominationsCloseAt", "Nominations close · campaign starts"],
  ["votingOpenAt", "Voting opens"],
  ["votingCloseAt", "Voting closes"],
  ["disputesCloseAt", "Results certified"],
];

export const when = (iso) =>
  new Date(iso).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** The next moment in the schedule after now, for "Voting opens in …" lines. */
export function nextStep(schedule) {
  const now = Date.now();
  return SCHEDULE.map(([key, label]) => ({ at: schedule?.[key], label })).find(
    (s) => s.at && new Date(s.at).getTime() > now,
  );
}
