import LeadershipPosition from './leadershipPosition.model.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';

// GET LEADERSHIP POSITIONS — ?scope=university|faculty|department|hall
export const getLeadershipPositions = catchAsync(async (req, res) => {
  const { scope } = req.validated.query;
  const filter = { university: req.university._id };
  if (scope) filter.scope = scope;

  const positions = await LeadershipPosition.find(filter)
    .select('-__v')
    .sort({ scope: 1, rank: 1, title: 1 });

  // election rules (campaign length, default eligibility) come from the university config
  sendSuccess(res, { positions, electionRules: req.university.config.elections });
});
