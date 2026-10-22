import express from 'express';
import { z } from 'zod';
import validate from '../../core/middleware/validate.js';
import { protect } from '../../core/middleware/auth.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';
import { CODE_PATTERN, SLUG_PATTERN } from '../../core/db/schemaTypes.js';
import Player from '../players/player.model.js';
import {
  applyForAdmission,
  completeOnboardingStep,
  findRecordForPlayer,
  matriculate,
  respondToOffer,
} from './admission.service.js';
import { presentStudent } from './student.presenter.js';

const code = z.string().trim().toUpperCase().regex(CODE_PATTERN);

const applicationSchema = z
  .object({
    universitySlug: z.string().trim().toLowerCase().max(60).regex(SLUG_PATTERN),
    facultyCode: code,
    departmentCode: code,
    programmeCode: code,
    entryLevel: z.number().int().positive(),
  })
  .strict();

const offerResponseSchema = z.object({ accept: z.boolean() }).strict();
const stepParams = z.object({ stepKey: z.string().trim().max(40).regex(SLUG_PATTERN) }).strict();

// every route acts on the SIGNED-IN player's own record — there is no way to name another player
const loadPlayer = catchAsync(async (req, res, next) => {
  const player = await Player.findOne({ user: req.user._id });
  if (!player) return next(AppError.notFound('No player profile found.'));
  req.player = player;
  next();
});

const requireRecord = catchAsync(async (req, res, next) => {
  const record = await findRecordForPlayer(req.player._id);
  if (!record) {
    return next(
      new AppError('You have not applied to a university yet.', 404, 'NO_STUDENT_RECORD'),
    );
  }
  req.studentRecord = record;
  next();
});

const respondWith = (statusCode) => async (res, record) =>
  sendSuccess(res, { student: await presentStudent(record) }, { statusCode });

// GET MY STUDENT DASHBOARD
const getMyStudent = catchAsync(async (req, res) => {
  await respondWith(200)(res, req.studentRecord);
});

// APPLY (simulated)
const apply = catchAsync(async (req, res) => {
  const record = await applyForAdmission(req.player, req.validated.body);
  req.log.info(
    { player: req.player.id, studentId: record.studentId },
    'Simulated admission applied',
  );
  await respondWith(201)(res, record);
});

// ACCEPT / DECLINE THE OFFER
const respond = catchAsync(async (req, res) => {
  const record = await respondToOffer(req.studentRecord, req.validated.body.accept);
  await respondWith(200)(res, record);
});

// MATRICULATE — allocates the fictional matric number
const doMatriculate = catchAsync(async (req, res) => {
  const record = await matriculate(req.studentRecord);
  req.log.info({ studentId: record.studentId, matric: record.matricNumber }, 'Matriculated');
  await respondWith(200)(res, record);
});

// COMPLETE A FRESHER ONBOARDING STEP
const completeStep = catchAsync(async (req, res) => {
  const record = await completeOnboardingStep(req.studentRecord, req.validated.params.stepKey);
  await respondWith(200)(res, record);
});

// mounted at /api/v1/students
export function createStudentsRouter(env) {
  const router = express.Router();
  router.use(protect(env), loadPlayer);

  router.post('/me/application', validate({ body: applicationSchema }), apply);

  router.use('/me', requireRecord);
  router.get('/me', getMyStudent);
  router.post('/me/offer-response', validate({ body: offerResponseSchema }), respond);
  router.post('/me/matriculation', doMatriculate);
  router.post('/me/onboarding/:stepKey', validate({ params: stepParams }), completeStep);

  return router;
}
