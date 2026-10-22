import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { resolveUniversity } from '../../core/middleware/tenant.js';
import { CODE_PATTERN, SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import { VERIFICATION_STATUSES } from '../../core/db/verification.js';
import { getAdmissionOptions, getUniversity, listUniversities } from './universities.controller.js';
import {
  getCurrentSession,
  getDepartments,
  getFaculties,
  getProgrammes,
  getSessions,
} from '../academics/academics.controller.js';
import { getLocation, getLocations } from '../campus/campus.controller.js';
import { LOCATION_CATEGORIES } from '../campus/campusLocation.model.js';
import { getHostel, getHostels } from '../accommodation/hostels.controller.js';
import { RESIDENT_GENDERS, RESIDENT_TYPES } from '../accommodation/hostel.model.js';
import { getLeadershipPositions } from '../leadership/leadership.controller.js';
import { POSITION_SCOPES } from '../leadership/leadershipPosition.model.js';

// PUBLIC, READ-ONLY university catalogue — mounted at /api/v1/universities
const router = express.Router();

const code = z.string().trim().toUpperCase().regex(CODE_PATTERN);
const slug = z.string().trim().toLowerCase().max(80).regex(SLUG_PATTERN);
const query = (shape) => validate({ query: z.object(shape).strict() });

router.get('/', listUniversities);

// everything below belongs to one (active) university
const tenant = express.Router({ mergeParams: true });
router.use('/:universitySlug', resolveUniversity(), tenant);

tenant.get('/', getUniversity);
tenant.get('/admission-options', getAdmissionOptions);

// academic structure
tenant.get(
  '/faculties',
  query({ include: z.enum(['departments', 'programmes']).optional() }),
  getFaculties,
);
tenant.get('/departments', query({ faculty: code.optional() }), getDepartments);
tenant.get('/programmes', query({ department: code.optional() }), getProgrammes);
tenant.get('/sessions', getSessions);
tenant.get('/sessions/current', getCurrentSession);

// campus
tenant.get(
  '/locations',
  query({
    category: z.enum(LOCATION_CATEGORIES).optional(),
    zone: slug.optional(),
    verification: z.enum(VERIFICATION_STATUSES).optional(),
    q: z.string().trim().min(1).max(60).optional(),
  }),
  getLocations,
);
tenant.get(
  '/locations/:locationSlug',
  validate({ params: z.object({ locationSlug: slug }).passthrough() }),
  getLocation,
);

// accommodation
tenant.get(
  '/hostels',
  query({ gender: z.enum(RESIDENT_GENDERS).optional(), type: z.enum(RESIDENT_TYPES).optional() }),
  getHostels,
);
tenant.get(
  '/hostels/:hostelSlug',
  validate({ params: z.object({ hostelSlug: slug }).passthrough() }),
  getHostel,
);

// student leadership
tenant.get(
  '/leadership-positions',
  query({ scope: z.enum(POSITION_SCOPES).optional() }),
  getLeadershipPositions,
);

export default router;
