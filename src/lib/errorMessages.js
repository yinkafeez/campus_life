// Text shown to players comes from here — chosen by error code/status, never raw server text.
const BY_CODE = {
  NETWORK_ERROR:
    "Can't reach the Campus Life servers. Check your connection and try again.",
  TIMEOUT:
    "The server is taking too long to respond. It may be waking up — try again.",
  RATE_LIMITED: "You're going a bit fast. Please wait a moment and try again.",
  DATABASE_UNAVAILABLE:
    "Our database is temporarily unavailable. Please try again shortly.",
  NOT_READY: "The server is starting up. Please try again shortly.",
  INVALID_CREDENTIALS: "Incorrect email/username or password.",
  ACCOUNT_LOCKED:
    "Too many failed sign-in attempts. Please wait a few minutes and try again.",
  ACCOUNT_EXISTS: "An account with that email or username already exists.",
  ALREADY_APPLIED: "You have already applied — check your admission status.",
  INVALID_STUDENT_STATE:
    "That step isn't available right now. Refresh and try again.",
  NO_CURRENT_SESSION:
    "Matriculation is closed: this university has no academic session running yet.",
  MATRIC_RANGE_EXHAUSTED:
    "No more matric numbers are available for your department this session. Please contact the game team.",
  UNIVERSITY_NOT_FOUND: "That university isn't open for admission.",
  NOT_THERE: "Walk there in the campus world first.",
  WRONG_PASSWORD: "Your current password is incorrect.",
  UNSUPPORTED_MEDIA_TYPE:
    "Something went wrong sending that. Please refresh and try again.",
  TOO_MANY_REQUESTS:
    "You have lots of friend requests waiting. Wait for some answers first.",
  // student elections (game)
  NOT_ENROLLED:
    "Get admitted and matriculate to take part in student elections.",
  NOT_ELIGIBLE:
    "You don't meet this election's rules — see the eligibility list on the election page.",
  NOMINATIONS_CLOSED: "Nominations are not open for this election.",
  ALREADY_CONTESTING:
    "You are already contesting another position in this election cycle.",
  CAMPAIGN_CLOSED: "Campaigning is closed for this election.",
  CAMPAIGN_LIMIT: "You have used all of those for this campaign.",
  WITHDRAW_CLOSED: "You can no longer withdraw from this election.",
  VOTING_CLOSED: "Voting is not open for this election.",
  ALREADY_VOTED: "You have already voted in this election.",
  DISPUTE_WINDOW_CLOSED:
    "Disputes can only be filed after voting closes and before results are certified.",
  ANNOUNCEMENT_LIMIT:
    "You have posted today's announcements already. Try again tomorrow.",
  WELFARE_LIMIT:
    "That grant is over this week's welfare budget or the per-student limit.",
};

/** Field-level messages from a VALIDATION_ERROR, keyed by field name ("body.email" → "email"). */
export function getFieldErrors(error) {
  if (error?.code !== "VALIDATION_ERROR" || !Array.isArray(error.details))
    return {};
  return Object.fromEntries(
    error.details.map((el) => [el.path.replace(/^body\./, ""), el.message]),
  );
}

const BY_STATUS = {
  400: "Some of the information sent was not valid.",
  401: "Please log in to continue.",
  403: "You don't have permission to do that.",
  404: "We couldn't find what you were looking for.",
  409: "That already exists.",
  413: "That's too large to send.",
  429: BY_CODE.RATE_LIMITED,
  // the dev proxy answers 502/504 when the API isn't running or doesn't respond
  502: "Can't reach the game server right now. Please try again in a moment.",
  503: "The server is starting up or its database is unavailable. Please try again in a few seconds.",
  504: "The game server took too long to respond. Please try again.",
};

const FALLBACK = "Something went wrong on our side. Please try again.";

export function getErrorMessage(error, custom = {}) {
  if (!error) return null;
  return (
    custom[error.code] ??
    BY_CODE[error.code] ??
    custom[error.status] ??
    BY_STATUS[error.status] ??
    FALLBACK
  );
}
