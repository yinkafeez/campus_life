import AppError from '../../core/errors/AppError.js';
import { bus, EVENTS } from '../../core/events.js';
import University from '../universities/university.model.js';
import StudentRecord from '../students/studentRecord.model.js';
import CampusLocation from './campusLocation.model.js';
import Npc from './npc.model.js';
import Discovery from './discovery.model.js';
import ActivityLog from './activityLog.model.js';
import { realtimeHub } from '../../core/realtime/metrics.js';
import { createRateLimiter } from '../moderation/textFilter.js';

/*
 * CAMPUS WORLD — what a player can explore at THEIR university: locations placed in zones,
 * NPCs, and what they've discovered. Everything comes from the university's records.
 */

/** The university a player belongs to (via their simulated student record), or null. */
export async function universityOfPlayer(playerId) {
  const record = await StudentRecord.findOne({ player: playerId }).select('university');
  return record ? University.findById(record.university) : null;
}

// Google Maps URLs (official, keyless links that just open Maps) — a real-world reference only
export const externalMapUrl = (location, university) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    location.mapQuery ?? `${location.name}, ${university.name}`,
  )}`;

const presentLocation = (loc, university, parentSlugs, discovered) => ({
  slug: loc.slug,
  name: loc.name,
  aliases: loc.aliases,
  category: loc.category,
  description: loc.description ?? null,
  parent: loc.parent ? (parentSlugs.get(String(loc.parent)) ?? null) : null,
  world: loc.world ?? null,
  activities: loc.activities ?? [],
  verification: {
    status: loc.verification?.status ?? 'unverified',
    notes: loc.verification?.notes ?? null,
  },
  externalMapUrl: externalMapUrl(loc, university),
  discovered: discovered.has(loc.slug),
});

/** Everything the 3D client needs for the player's campus. */
export async function getCampusWorld(player) {
  const university = await universityOfPlayer(player._id);
  if (!university)
    return { university: null, world: null, locations: [], npcs: [], discoveries: [] };

  const [locations, npcs, discoveries] = await Promise.all([
    CampusLocation.find({ university: university._id }).sort({ name: 1 }).lean(),
    Npc.find({ university: university._id }).select('-__v -university').lean(),
    Discovery.find({ player: player._id, university: university._id })
      .select('locationSlug discoveredAt visits')
      .lean(),
  ]);
  const parentSlugs = new Map(locations.map((el) => [String(el._id), el.slug]));
  const discovered = new Set(discoveries.map((el) => el.locationSlug));

  return {
    university: { slug: university.slug, name: university.name, shortName: university.shortName },
    world: university.config.world ?? { zones: [] },
    locations: locations.map((el) => presentLocation(el, university, parentSlugs, discovered)),
    npcs,
    discoveries,
  };
}

async function findPlacedLocation(player, locationSlug) {
  const university = await universityOfPlayer(player._id);
  if (!university)
    throw new AppError('Enrol at a university to explore its campus.', 409, 'NOT_ENROLLED');
  const location = await CampusLocation.findOne({ university: university._id, slug: locationSlug });
  if (!location?.world) throw AppError.notFound('That place is not in the game world.');
  return { university, location };
}

// the client reports arrival a moment after the server saw the last movement packet
export const ARRIVAL_SLACK_M = 4;

/**
 * Arrivals are checked against the position the SERVER validated (realtime zone hub), so a
 * crafted request can't "visit" a place — deliveries pay and missions advance on visits.
 * (Only possible where realtime runs in this process, which is always the case for the API.)
 */
function assertStandingAt(player, university, location) {
  const hub = realtimeHub();
  if (!hub) return;
  const at = hub.whereIs(player._id);
  const room = `zone:${university._id}:${location.world.zone}`;
  const far =
    !at ||
    at.room !== room ||
    Math.hypot(at.x - location.world.x, at.z - location.world.z) >
      (location.world.radius ?? 3) + ARRIVAL_SLACK_M;
  if (far) throw new AppError('Walk there in the campus world first.', 409, 'NOT_THERE');
}

/** Record that the player reached a location. Returns { discovery, isNew }. */
export async function discoverLocation(player, locationSlug) {
  const { university, location } = await findPlacedLocation(player, locationSlug);
  assertStandingAt(player, university, location);
  const existing = await Discovery.findOneAndUpdate(
    { player: player._id, university: university._id, locationSlug },
    { $inc: { visits: 1 }, $set: { lastVisitAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (existing) return { discovery: existing, isNew: false };

  try {
    const discovery = await Discovery.create({
      player: player._id,
      university: university._id,
      locationSlug,
    });
    return { discovery, isNew: true };
  } catch (err) {
    // two tabs discovering at the same moment: the other one won
    if (err?.code !== 11000) throw err;
    return {
      discovery: await Discovery.findOne({ player: player._id, locationSlug }),
      isNew: false,
    };
  }
}

// each activity writes a log line and notifies friends: a human pace is plenty
const allowActivity = createRateLimiter({ limit: 12, windowMs: 60_000 });

/** Do an activity at a location (eat, study, hang out...). */
export async function doActivity(player, locationSlug, activityKey) {
  if (!allowActivity(String(player._id)))
    throw new AppError('Slow down a little — try that again in a moment.', 429, 'RATE_LIMITED');
  const { university, location } = await findPlacedLocation(player, locationSlug);
  assertStandingAt(player, university, location);
  const activity = location.activities.find((el) => el.key === activityKey);
  if (!activity) throw AppError.notFound('You can’t do that here.');

  await ActivityLog.create({
    player: player._id,
    university: university._id,
    locationSlug,
    activityKey,
    kind: activity.kind,
  });
  bus.emit(EVENTS.ACTIVITY_DONE, {
    playerId: String(player._id),
    displayName: player.displayName,
    location: { slug: location.slug, name: location.name },
    activity: { key: activity.key, label: activity.label, kind: activity.kind },
  });
  return { activity, message: activity.message ?? `You ${activity.label.toLowerCase()}.` };
}
