// Turning event schedules (local times in the university's timezone) into UTC windows.

/** Minutes the timezone is ahead of UTC at a given instant (e.g. Africa/Lagos → +60). */
export function tzOffsetMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** The UTC instant for a wall-clock time in `timeZone`. */
export function zonedToUtc({ year, month, day, hour, minute }, timeZone) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  return new Date(guess.getTime() - tzOffsetMinutes(guess, timeZone) * 60_000);
}

/** The local calendar date (y/m/d + weekday) of an instant in `timeZone`. */
export function localDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday,
  };
}

/**
 * Occurrences of a schedule around `now`: from `daysBack` days ago to `daysAhead` days on.
 * Returns [{ key, startsAt, endsAt }] with key "<schedule>:<YYYY-MM-DD>".
 */
export function occurrences(
  schedule,
  timeZone,
  now = new Date(),
  { daysBack = 2, daysAhead = 7 } = {},
) {
  const r = schedule.recurrence;
  if (r.type === 'once') {
    return [
      { key: `${schedule.key}:once`, startsAt: new Date(r.startsAt), endsAt: new Date(r.endsAt) },
    ];
  }
  const [hour, minute] = r.start.split(':').map(Number);
  const out = [];
  for (let d = -daysBack; d <= daysAhead; d += 1) {
    const local = localDate(new Date(now.getTime() + d * 86_400_000), timeZone);
    if (!r.days.includes(local.weekday)) continue;
    const startsAt = zonedToUtc({ ...local, hour, minute }, timeZone);
    const date = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
    out.push({
      key: `${schedule.key}:${date}`,
      startsAt,
      endsAt: new Date(startsAt.getTime() + r.durationMinutes * 60_000),
    });
  }
  return out;
}
