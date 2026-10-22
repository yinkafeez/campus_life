import mongoose from '../../core/db/mongoose.js';
import { checkEligibility } from '../../shared/eligibility.js';
import StudentRecord from '../students/studentRecord.model.js';
import Programme from '../academics/programme.model.js';
import User from '../auth/user.model.js';
import Player from '../players/player.model.js';
import Report from '../moderation/report.model.js';
import AccommodationAssignment from '../accommodation/assignment.model.js';
import { LearningProgress } from '../learning/learning.models.js';
import { programmeLevels } from '../students/admission.service.js';

/*
 * Who may stand and who may vote — evaluated with the shared eligibility engine against
 * a profile built from the player's SIMULATED studentship. Rules come from the university's
 * config and the position; this file never knows which university it is serving.
 *
 * CGPA rules: the game has no real CGPA. With config.elections.academicStanding =
 * "game-standing", minCgpa is checked against the player's GAME academic standing — the
 * average best score of their studies activities mapped onto the university's grading
 * scale (labelled as such everywhere). "ignore" skips CGPA rules.
 */
const trusted = (q) => mongoose.trusted(q);
const STUDYING = ['matriculated', 'active'];

export async function gameStanding(playerId, university) {
  const progress = await LearningProgress.findOne({
    player: playerId,
    university: university._id,
  }).lean();
  const bests = (progress?.levels ?? []).flatMap((l) => Object.values(l.best ?? {}));
  if (!bests.length) return null;
  const average = bests.reduce((sum, b) => sum + (b.percent ?? 0), 0) / bests.length;
  return Math.round((average / 100) * university.config.grading.cgpaScale * 100) / 100;
}

/** Is this student inside an election / office scope? */
export async function inScope(scope, record) {
  if (!record) return false;
  if (scope.type === 'university') return true;
  if (scope.type === 'faculty') return String(record.faculty) === String(scope.unit);
  if (scope.type === 'department') return String(record.department) === String(scope.unit);
  if (scope.type === 'hall') {
    return Boolean(
      await AccommodationAssignment.exists({
        player: record.player,
        hostel: scope.unit,
        status: 'active',
      }),
    );
  }
  return false;
}

async function inGoodStanding(player) {
  const [user, full, recentSanction] = await Promise.all([
    User.findById(player.user).select('+suspendedUntil'),
    Player.findById(player._id).select('+chatMutedUntil'),
    Report.exists({
      target: player._id,
      status: 'actioned',
      'resolution.action': trusted({ $in: ['mute-chat', 'suspend'] }),
      'resolution.at': trusted({ $gte: new Date(Date.now() - 30 * 86_400_000) }),
    }),
  ]);
  const now = new Date();
  return !(user?.suspendedUntil > now) && !(full?.chatMutedUntil > now) && !recentSanction;
}

/** The eligibility profile for a player in the context of one election. */
export async function electionProfile(player, election, university) {
  const record = await StudentRecord.findOne({ player: player._id, university: university._id });
  if (!record) return { record: null, profile: null };
  const programme = await Programme.findById(record.programme).select('durationYears');
  const levels = programmeLevels(university.config, programme).filter(
    (l) => l >= record.entryLevel,
  );
  const useStanding = election.rules.academicStanding === 'game-standing';
  const profile = {
    level: record.currentLevel,
    gender: player.gender,
    cgpa: useStanding
      ? await gameStanding(player._id, university)
      : university.config.grading.cgpaScale,
    isFresher: record.currentLevel === record.entryLevel,
    isFinalYear: record.currentLevel === levels[levels.length - 1],
    inGoodStanding: await inGoodStanding(player),
    inScope: await inScope(election.scope, record),
  };
  return { record, profile };
}

const REASON_TEXT = {
  LEVEL_TOO_LOW: 'Your level is too low for this.',
  LEVEL_TOO_HIGH: 'Your level is too high for this.',
  GENDER_NOT_ELIGIBLE: 'This is open to a different gender.',
  CGPA_TOO_LOW: 'Your game academic standing is below the required minimum.',
  FRESHER_NOT_ELIGIBLE: 'Freshers (first-year students) cannot do this.',
  FINAL_YEAR_NOT_ELIGIBLE: 'Final-year students cannot do this.',
  NOT_IN_GOOD_STANDING: 'Your account is not in good standing (recent moderation action).',
  NOT_IN_SCOPE: 'You are not a member of this constituency.',
  NOT_STUDYING: 'Only matriculated students take part.',
};
export const explain = (reasons) => reasons.map((r) => REASON_TEXT[r] ?? r);

/** { eligible, reasons } to vote in this election. Voters must always be in scope. */
export async function voterCheck(player, election, university) {
  const { record, profile } = await electionProfile(player, election, university);
  if (!record || !STUDYING.includes(record.status))
    return { eligible: false, reasons: ['NOT_STUDYING'], profile };
  const rules = { ...election.rules.voterEligibility, requireScopeMembership: true };
  return { ...checkEligibility(rules, profile), profile };
}

/** { eligible, reasons } to stand in this election (candidate rules + voter rules). */
export async function candidateCheck(player, election, university) {
  const voter = await voterCheck(player, election, university);
  if (!voter.profile) return voter;
  const rules = { ...election.rules.candidateEligibility, requireScopeMembership: true };
  const candidate = checkEligibility(rules, voter.profile);
  const reasons = [...new Set([...voter.reasons, ...candidate.reasons])];
  return { eligible: reasons.length === 0, reasons, profile: voter.profile };
}
