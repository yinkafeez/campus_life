import Hostel from './hostel.model.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';

const LOCATION = { path: 'location', select: 'slug name zone' };

// GET HOSTELS — ?gender=male|female|mixed &type=undergraduate|postgraduate|any
export const getHostels = catchAsync(async (req, res) => {
  const { gender, type } = req.validated.query;
  const filter = { university: req.university._id };
  if (gender) filter.residentGender = gender;
  if (type) filter.residentType = type;

  const hostels = await Hostel.find(filter).select('-__v').populate(LOCATION).sort({ name: 1 });

  // the university-wide rules come with the list so the client shows one consistent picture
  sendSuccess(res, { hostels, accommodationRules: req.university.config.accommodation });
});

// GET ONE HOSTEL
export const getHostel = catchAsync(async (req, res, next) => {
  const hostel = await Hostel.findOne({
    university: req.university._id,
    slug: req.validated.params.hostelSlug,
  })
    .select('-__v')
    .populate(LOCATION);

  if (!hostel) return next(AppError.notFound('No hostel found with that slug.'));
  sendSuccess(res, { hostel });
});
