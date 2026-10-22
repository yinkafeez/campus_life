import CampusLocation from './campusLocation.model.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PARENT = { path: 'parent', select: 'slug name category' };

// GET LOCATIONS — ?category= &zone= &verification= &q= (name/alias search)
export const getLocations = catchAsync(async (req, res) => {
  const { category, zone, verification, q } = req.validated.query;
  const filter = { university: req.university._id };

  if (category) filter.category = category;
  if (zone) filter.zone = zone;
  if (verification) filter['verification.status'] = verification;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: pattern }, { aliases: pattern }];
  }

  const locations = await CampusLocation.find(filter)
    .select('-__v')
    .populate(PARENT)
    .sort({ name: 1 });

  sendSuccess(res, { locations });
});

// GET ONE LOCATION — with the places inside it (e.g. SUB → its cafeterias)
export const getLocation = catchAsync(async (req, res, next) => {
  const university = req.university._id;
  const location = await CampusLocation.findOne({
    university,
    slug: req.validated.params.locationSlug,
  })
    .select('-__v')
    .populate(PARENT);

  if (!location) return next(AppError.notFound('No location found with that slug.'));

  const children = await CampusLocation.find({ university, parent: location._id })
    .select('slug name category aliases verification.status')
    .sort({ name: 1 });

  sendSuccess(res, { location, children });
});
