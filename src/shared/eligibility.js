import { z } from 'zod';

/*
 * Eligibility rules — one tenant-agnostic rule format used for voters, candidates
 * and (later) hostel allocation. Universities choose the VALUES; the code never
 * knows which university it is evaluating for.
 *
 *   { minLevel: 200, maxLevel: 400, minCgpa: 3.5, excludeFinalYear: true }
 */
export const GENDERS = ['male', 'female'];

export const eligibilityRulesSchema = z
  .object({
    minLevel: z.number().int().positive().optional(),
    maxLevel: z.number().int().positive().optional(),
    genders: z.array(z.enum(GENDERS)).min(1).optional(),
    minCgpa: z.number().min(0).max(10).optional(),
    excludeFreshers: z.boolean().optional(),
    excludeFinalYear: z.boolean().optional(),
    requireGoodStanding: z.boolean().optional(),
    // e.g. only residents of the hall can run for hall chairman
    requireScopeMembership: z.boolean().optional(),
  })
  .strict()
  .refine((r) => r.minLevel == null || r.maxLevel == null || r.minLevel <= r.maxLevel, {
    message: 'minLevel must not be greater than maxLevel',
    path: ['maxLevel'],
  });

/**
 * Rule values that don't fit a university's configuration, e.g. a level the
 * university doesn't have or a CGPA above its grading scale. [] means consistent.
 */
export function eligibilityRuleProblems(rules = {}, { levels = [], cgpaScale } = {}) {
  const problems = [];
  ['minLevel', 'maxLevel'].forEach((key) => {
    if (rules[key] != null && levels.length && !levels.includes(rules[key])) {
      problems.push({
        path: [key],
        message: `${key} ${rules[key]} is not one of the university's levels (${levels.join(', ')})`,
      });
    }
  });
  if (rules.minCgpa != null && cgpaScale != null && rules.minCgpa > cgpaScale) {
    problems.push({
      path: ['minCgpa'],
      message: `minCgpa ${rules.minCgpa} is above the university's ${cgpaScale}-point scale`,
    });
  }
  return problems;
}

/**
 * Check a student-like profile against rules.
 * profile: { level, gender, cgpa, isFresher, isFinalYear, inGoodStanding, inScope }
 * Unknown values fail the rule that needs them (never eligible by accident).
 */
export function checkEligibility(rules = {}, profile = {}) {
  const reasons = [];

  if (rules.minLevel != null && !(profile.level >= rules.minLevel)) reasons.push('LEVEL_TOO_LOW');
  if (rules.maxLevel != null && !(profile.level <= rules.maxLevel)) reasons.push('LEVEL_TOO_HIGH');
  if (rules.genders && !rules.genders.includes(profile.gender)) reasons.push('GENDER_NOT_ELIGIBLE');
  if (rules.minCgpa != null && !(profile.cgpa >= rules.minCgpa)) reasons.push('CGPA_TOO_LOW');
  if (rules.excludeFreshers && profile.isFresher !== false) reasons.push('FRESHER_NOT_ELIGIBLE');
  if (rules.excludeFinalYear && profile.isFinalYear !== false)
    reasons.push('FINAL_YEAR_NOT_ELIGIBLE');
  if (rules.requireGoodStanding && profile.inGoodStanding !== true)
    reasons.push('NOT_IN_GOOD_STANDING');
  if (rules.requireScopeMembership && profile.inScope !== true) reasons.push('NOT_IN_SCOPE');

  return { eligible: reasons.length === 0, reasons };
}
