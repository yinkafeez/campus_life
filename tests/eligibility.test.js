import { describe, expect, it } from 'vitest';
import {
  checkEligibility,
  eligibilityRuleProblems,
  eligibilityRulesSchema,
} from '../src/shared/eligibility.js';

// the official-style faculty rule set: CGPA ≥ 3.0, no freshers, no finalists, good standing
const facultyRules = {
  minCgpa: 3,
  excludeFreshers: true,
  excludeFinalYear: true,
  requireGoodStanding: true,
  requireScopeMembership: true,
};

const goodCandidate = {
  level: 300,
  gender: 'female',
  cgpa: 3.6,
  isFresher: false,
  isFinalYear: false,
  inGoodStanding: true,
  inScope: true,
};

describe('checkEligibility', () => {
  it('accepts a profile that meets every rule', () => {
    expect(checkEligibility(facultyRules, goodCandidate)).toEqual({ eligible: true, reasons: [] });
  });

  it('lists every failed rule', () => {
    const result = checkEligibility(facultyRules, {
      ...goodCandidate,
      cgpa: 2.9,
      isFinalYear: true,
      inGoodStanding: false,
      inScope: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual([
      'CGPA_TOO_LOW',
      'FINAL_YEAR_NOT_ELIGIBLE',
      'NOT_IN_GOOD_STANDING',
      'NOT_IN_SCOPE',
    ]);
  });

  it('checks level bounds and genders', () => {
    const rules = { minLevel: 200, maxLevel: 400, genders: ['male'] };
    expect(checkEligibility(rules, { level: 100, gender: 'male' }).reasons).toEqual([
      'LEVEL_TOO_LOW',
    ]);
    expect(checkEligibility(rules, { level: 500, gender: 'female' }).reasons).toEqual([
      'LEVEL_TOO_HIGH',
      'GENDER_NOT_ELIGIBLE',
    ]);
  });

  it('never makes anyone eligible by accident when data is missing', () => {
    expect(checkEligibility(facultyRules, {}).reasons).toEqual([
      'CGPA_TOO_LOW',
      'FRESHER_NOT_ELIGIBLE',
      'FINAL_YEAR_NOT_ELIGIBLE',
      'NOT_IN_GOOD_STANDING',
      'NOT_IN_SCOPE',
    ]);
  });

  it('treats empty rules as "everyone"', () => {
    expect(checkEligibility({}, {}).eligible).toBe(true);
  });
});

describe('eligibility rule validation', () => {
  it('rejects unknown keys and inverted level ranges', () => {
    expect(eligibilityRulesSchema.safeParse({ minAge: 18 }).success).toBe(false);
    expect(eligibilityRulesSchema.safeParse({ minLevel: 400, maxLevel: 200 }).success).toBe(false);
  });

  it('flags values that do not fit the university', () => {
    const problems = eligibilityRuleProblems(
      { minLevel: 250, maxLevel: 400, minCgpa: 4.5 },
      { levels: [100, 200, 300, 400], cgpaScale: 4 },
    );
    expect(problems.map((el) => el.path[0])).toEqual(['minLevel', 'minCgpa']);
  });
});
