import { z } from 'zod';
import University from '../universities/university.model.js';
import { UNIVERSITY_STATUSES } from '../universities/university.model.js';
import { universityScopedModels } from '../models.js';
import { importBundle, preflightBundle } from '../universities/bundle/importBundle.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';

// the report admins see (never the parsed bundle itself)
const reportOf = ({ valid, dryRun, isNewUniversity, errors, warnings, summary, results }) => ({
  valid,
  ...(dryRun !== undefined && { dryRun }),
  isNewUniversity,
  errors,
  warnings,
  summary,
  ...(results && { results }),
});

// VALIDATE A BUNDLE — full check against the database, nothing written
export const validateUniversityBundle = catchAsync(async (req, res) => {
  const { report } = await preflightBundle(req.body);
  req.log.info({ university: report.summary?.university, valid: report.valid }, 'Bundle validated');
  sendSuccess(res, { report: reportOf(report) });
});

// IMPORT A BUNDLE — ?dryRun=true to preview; invalid bundles are rejected with every problem listed
export const importUniversityBundle = catchAsync(async (req, res, next) => {
  const { dryRun } = req.validated.query;
  const report = await importBundle(req.body, { dryRun });

  if (!report.valid) {
    return next(
      new AppError(
        `The bundle has ${report.errors.length} problem(s). Nothing was imported.`,
        422,
        'BUNDLE_INVALID',
        report.errors,
      ),
    );
  }

  req.log.info(
    { university: report.summary.university, dryRun, results: report.results },
    'University bundle imported',
  );
  sendSuccess(res, { report: reportOf(report) }, { statusCode: dryRun ? 200 : 201 });
});

// GET ALL UNIVERSITIES — drafts included, with catalogue counts
export const listAllUniversities = catchAsync(async (req, res) => {
  const universities = await University.find().sort({ name: 1 }).lean();

  const counts = await Promise.all(
    universityScopedModels.map(async (Model) => {
      const rows = await Model.aggregate([{ $group: { _id: '$university', n: { $sum: 1 } } }]);
      return [Model.modelName, new Map(rows.map((el) => [String(el._id), el.n]))];
    }),
  );

  const withCounts = universities.map((uni) => ({
    ...uni,
    catalogue: Object.fromEntries(
      counts.map(([model, byUniversity]) => [model, byUniversity.get(String(uni._id)) ?? 0]),
    ),
  }));

  sendSuccess(res, { universities: withCounts });
});

// UPDATE A UNIVERSITY — status / names / notes, and config sections (each section replaced whole)
export const updateUniversitySchema = z
  .object({
    status: z.enum(UNIVERSITY_STATUSES).optional(),
    name: z.string().trim().min(2).max(160).optional(),
    shortName: z.string().trim().min(1).max(20).optional(),
    dataNotes: z.string().trim().max(2000).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, { message: 'Nothing to update' });

export const updateUniversity = catchAsync(async (req, res) => {
  const { config, ...fields } = req.validated.body;
  const { university } = req;

  university.set(fields);
  if (config) {
    // replace only the sections sent; the model's zod check validates the merged result
    university.config = { ...university.config, ...config };
  }
  await university.save();

  req.log.info(
    { university: university.slug, fields: Object.keys(req.validated.body) },
    'University updated',
  );
  sendSuccess(res, { university });
});
