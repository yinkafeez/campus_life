import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { resolveUniversity } from '../../core/middleware/tenant.js';
import { sendSuccess } from '../../core/http/respond.js';
import { realtimeSnapshot } from '../../core/realtime/metrics.js';
import {
  importUniversityBundle,
  listAllUniversities,
  updateUniversity,
  updateUniversitySchema,
  validateUniversityBundle,
} from './admin.controller.js';

// mounted at /api/v1/admin — the admin key check runs before this router (see app.js)
const router = express.Router();

const dryRunQuery = z
  .object({
    dryRun: z
      .enum(['true', 'false'])
      .default('false')
      .transform((val) => val === 'true'),
  })
  .strict();

// a bundle must at least be a JSON object (the importer does the real validation)
const bundleBody = z.object({}).passthrough();

router.post(
  '/university-bundles/validate',
  validate({ body: bundleBody }),
  validateUniversityBundle,
);
router.post(
  '/university-bundles/import',
  validate({ query: dryRunQuery, body: bundleBody }),
  importUniversityBundle,
);

router.get('/universities', listAllUniversities);
router.patch(
  '/universities/:universitySlug',
  resolveUniversity({ includeDrafts: true }),
  validate({ body: updateUniversitySchema }),
  updateUniversity,
);

// live multiplayer load (connections, events, tick cost, event-loop lag); ?reset=true starts a new window
router.get(
  '/realtime/metrics',
  validate({ query: z.object({ reset: z.enum(['true', 'false']).default('false') }).strict() }),
  (req, res) => {
    sendSuccess(res, {
      metrics: realtimeSnapshot({ reset: req.validated.query.reset === 'true' }),
    });
  },
);

export default router;
