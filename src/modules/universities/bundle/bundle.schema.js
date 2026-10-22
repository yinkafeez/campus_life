import { z } from 'zod';
import { CODE_PATTERN, SLUG_PATTERN } from '../../../core/db/schemaTypes.js';
import { VERIFICATION_STATUSES } from '../../../core/db/verification.js';
import { eligibilityRulesSchema } from '../../../shared/eligibility.js';
import { ACTIVITY_KINDS, LOCATION_CATEGORIES } from '../../campus/campusLocation.model.js';
import {
  ALLOCATION_MODES,
  RESIDENT_GENDERS,
  RESIDENT_TYPES,
} from '../../accommodation/hostel.model.js';
import { POSITION_SCOPES } from '../../leadership/leadershipPosition.model.js';
import { UNIVERSITY_STATUSES } from '../university.model.js';
import {
  LEADER_PRIVILEGES,
  PRIORITY_GROUPS,
  universityConfigSchema,
} from '../university.config.js';

/*
 * A university BUNDLE: one JSON document that describes a university — its config and
 * its catalogue (academic structure, sessions, campus locations, hostels, leadership
 * positions). Admins import bundles; nothing university-specific lives in code.
 *
 * Records reference each other by natural keys (codes / slugs), never by database ids,
 * so the same bundle can be imported into any environment, any number of times.
 */
export const BUNDLE_FORMAT_VERSION = 1;

const code = z.string().trim().toUpperCase().regex(CODE_PATTERN, 'must be 2–10 letters or digits');
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(80)
  .regex(SLUG_PATTERN, 'must be kebab-case (a-z, 0-9, single dashes)');
const name = (max = 120) => z.string().trim().min(2).max(max);
const isoDate = z.iso.date('must be a YYYY-MM-DD date');

const verification = z
  .object({
    status: z.enum(VERIFICATION_STATUSES).default('unverified'),
    sources: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            url: z
              .string()
              .trim()
              .regex(/^https?:\/\/\S+$/, 'must be an http(s) URL')
              .max(500),
            accessedOn: isoDate.optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((val) => val.status !== 'verified' || val.sources.length > 0, {
    message: 'A verified record must cite at least one source',
    path: ['sources'],
  })
  .prefault({});

const aliases = z.array(z.string().trim().min(1).max(80)).max(10).default([]);

// ─── Academic structure (nested: faculty → departments → programmes) ──────
// code used inside matric numbers when it differs from the catalogue code
const matricCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,10}$/, 'must be 1–10 letters or digits')
  .optional();

const programme = z
  .object({
    code,
    matricCode,
    name: name(160),
    award: z.string().trim().min(1).max(20),
    durationYears: z.number().int().min(1).max(7),
    verification,
  })
  .strict();

const department = z
  .object({
    code,
    matricCode,
    name: name(),
    verification,
    programmes: z.array(programme).default([]),
  })
  .strict();

const faculty = z
  .object({
    code,
    matricCode,
    name: name(),
    verification,
    departments: z.array(department).default([]),
  })
  .strict();

const session = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^\d{4}\/\d{4}$/, 'must look like 2026/2027'),
    startsOn: isoDate,
    endsOn: isoDate,
    isCurrent: z.boolean().default(false),
  })
  .strict();

// ─── Campus ───────────────────────────────────────────────────────────────
const location = z
  .object({
    slug,
    name: name(),
    aliases,
    category: z.enum(LOCATION_CATEGORIES),
    description: z.string().trim().max(600).optional(),
    parent: slug.optional(), // slug of another location
    zone: slug.optional(),
    coordinates: z
      .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
      .strict()
      .optional(),
    // placement in a playable zone (game layout)
    world: z
      .object({
        zone: slug,
        x: z.number().min(-1000).max(1000),
        z: z.number().min(-1000).max(1000),
        radius: z.number().min(1).max(30).default(4),
      })
      .strict()
      .optional(),
    activities: z
      .array(
        z
          .object({
            key: slug,
            label: z.string().trim().min(2).max(60),
            kind: z.enum(ACTIVITY_KINDS),
            message: z.string().trim().max(280).optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    mapQuery: z.string().trim().max(160).optional(),
    verification,
  })
  .strict();

// ─── NPCs (non-player characters with dialogue) ──────────────────────────
export const NPC_ACTIONS = ['directions', 'end'];
const dialogueNode = z
  .object({
    text: z.string().trim().min(1).max(400),
    options: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(60),
            next: slug.optional(),
            action: z.enum(NPC_ACTIONS).optional(),
          })
          .strict()
          .refine((o) => o.next || o.action, { message: 'An option needs "next" or "action"' }),
      )
      .min(1)
      .max(6),
  })
  .strict();

export const dialogueSchema = z.record(slug, dialogueNode).superRefine((nodes, ctx) => {
  if (!nodes.start) ctx.addIssue({ code: 'custom', message: 'A dialogue needs a "start" node' });
  Object.entries(nodes).forEach(([id, node]) =>
    node.options.forEach((option, i) => {
      if (option.next && !nodes[option.next]) {
        ctx.addIssue({
          code: 'custom',
          path: [id, 'options', i, 'next'],
          message: `Unknown dialogue node "${option.next}"`,
        });
      }
    }),
  );
});

const npcLook = z
  .object({
    appearance: z
      .object({
        bodyType: z.enum(['slim', 'average', 'sturdy']).default('average'),
        height: z.number().min(0.9).max(1.1).default(1),
        skinTone: slug,
        hairColor: slug,
        hairStyle: slug,
      })
      .strict(),
    equipped: z
      .record(
        z.string(),
        z
          .object({
            item: slug,
            color: z
              .string()
              .regex(/^#[0-9a-f]{6}$/i)
              .optional(),
          })
          .strict(),
      )
      .default({}),
  })
  .strict();

const npc = z
  .object({
    key: slug,
    name: name(60),
    role: z.string().trim().min(2).max(60),
    zone: slug,
    x: z.number().min(-1000).max(1000),
    z: z.number().min(-1000).max(1000),
    rotY: z.number().min(-10).max(10).default(0),
    look: npcLook,
    dialogue: dialogueSchema,
    verification,
  })
  .strict();

const hostel = z
  .object({
    slug,
    name: name(),
    aliases,
    residentGender: z.enum(RESIDENT_GENDERS),
    residentType: z.enum(RESIDENT_TYPES).default('undergraduate'),
    capacity: z.number().int().positive().optional(),
    location: slug.optional(), // slug of a campus location
    allocation: z
      .object({
        eligibleLevels: z.array(z.number().int().positive()).default([]),
        reservedFor: z.array(z.enum(PRIORITY_GROUPS)).default([]),
        // ballot = allocated through the university's accommodation exercise;
        // direct = book a bed straight away (e.g. privately run halls)
        mode: z.enum(ALLOCATION_MODES).default('ballot'),
      })
      .strict()
      .prefault({}),
    // game room layout (the real room plan isn't published): rooms × beds per room
    roomPlan: z
      .object({
        rooms: z.number().int().min(1).max(2000),
        bedsPerRoom: z.number().int().min(1).max(12),
      })
      .strict()
      .optional(),
    accessRules: z.string().trim().max(1000).optional(),
    verification,
  })
  .strict();

// ─── Leadership ───────────────────────────────────────────────────────────
const leadershipPosition = z
  .object({
    code,
    title: name(),
    body: z.string().trim().max(120).optional(),
    scope: z.enum(POSITION_SCOPES),
    seats: z.number().int().min(1).max(100).default(1),
    termLengthSessions: z.number().int().min(1).max(4).default(1),
    isElected: z.boolean().default(true),
    candidateEligibility: eligibilityRulesSchema.prefault({}),
    // overrides the scope default privileges in config.leadership (optional)
    privileges: z.array(z.enum(LEADER_PRIVILEGES)).max(10).optional(),
    rank: z.number().int().min(0).default(100),
    verification,
  })
  .strict();

// ─── The university itself ────────────────────────────────────────────────
// name/shortName/config are required for a NEW university (checked against the DB on import);
// for an existing one a bundle may update only part of it.
const university = z
  .object({
    slug,
    name: name(160).optional(),
    shortName: z.string().trim().min(1).max(20).optional(),
    status: z.enum(UNIVERSITY_STATUSES).optional(),
    location: z
      .object({
        city: z.string().trim().max(80).optional(),
        state: z.string().trim().max(80).optional(),
        country: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{2}$/, 'must be a 2-letter ISO code')
          .optional(),
      })
      .strict()
      .optional(),
    timezone: z.string().trim().max(60).optional(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, 'must be a 3-letter ISO code')
      .optional(),
    config: universityConfigSchema.optional(),
    // where the data came from / caveats, shown to admins
    dataNotes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const bundleSchema = z
  .object({
    formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
    university,
    faculties: z.array(faculty).max(100).optional(),
    sessions: z.array(session).max(50).optional(),
    locations: z.array(location).max(2000).optional(),
    hostels: z.array(hostel).max(200).optional(),
    leadershipPositions: z.array(leadershipPosition).max(500).optional(),
    npcs: z.array(npc).max(500).optional(),
  })
  .strict();
