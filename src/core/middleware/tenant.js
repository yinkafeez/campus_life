import { z } from 'zod';
import AppError from '../errors/AppError.js';
import catchAsync from '../http/catchAsync.js';
import { SLUG_PATTERN } from '../db/schemaTypes.js';
import University from '../../modules/universities/university.model.js';

const slugSchema = z.string().max(60).regex(SLUG_PATTERN);

/**
 * Resolve :universitySlug once and put the university on req.university.
 * Public routes only see ACTIVE universities — drafts are invisible (404),
 * so a half-configured campus never leaks to players.
 */
export const resolveUniversity = ({ includeDrafts = false } = {}) =>
  catchAsync(async (req, res, next) => {
    const parsed = slugSchema.safeParse(req.params.universitySlug);
    const university = parsed.success
      ? await University.findOne({
          slug: parsed.data,
          ...(!includeDrafts && { status: 'active' }),
        })
      : null;

    if (!university) {
      return next(new AppError('No university found with that slug.', 404, 'UNIVERSITY_NOT_FOUND'));
    }
    req.university = university;
    next();
  });
