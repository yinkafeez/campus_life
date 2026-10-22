import Faculty from './faculty.model.js';
import Department from './department.model.js';
import Programme from './programme.model.js';
import AcademicSession from './academicSession.model.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';
import AppError from '../../core/errors/AppError.js';
import { levelLabel } from '../universities/university.config.js';

const HIDDEN = '-__v';

// the levels a programme runs through, from the university's config
// (a 4-year programme at a [100..500] university → 100L–400L)
const withLevels = (programme, config) => ({
  ...programme,
  levels: config.levels.values.slice(0, programme.durationYears).map((level) => ({
    level,
    label: levelLabel(config, level),
  })),
});

// GET FACULTIES — ?include=departments | programmes for the whole tree
export const getFaculties = catchAsync(async (req, res) => {
  const { include } = req.validated.query;
  const university = req.university._id;

  const faculties = await Faculty.find({ university }).select(HIDDEN).sort({ name: 1 }).lean();
  if (!include) return sendSuccess(res, { faculties });

  const departments = await Department.find({ university }).select(HIDDEN).sort({ name: 1 }).lean();
  const programmes =
    include === 'programmes'
      ? await Programme.find({ university }).select(HIDDEN).sort({ name: 1 }).lean()
      : [];

  // build the tree in memory: faculty → departments → programmes
  const programmesByDept = Map.groupBy(programmes, (el) => String(el.department));
  const deptsByFaculty = Map.groupBy(departments, (el) => String(el.faculty));

  const tree = faculties.map((faculty) => ({
    ...faculty,
    departments: (deptsByFaculty.get(String(faculty._id)) ?? []).map((dept) =>
      include === 'programmes'
        ? {
            ...dept,
            programmes: (programmesByDept.get(String(dept._id)) ?? []).map((el) =>
              withLevels(el, req.university.config),
            ),
          }
        : dept,
    ),
  }));

  sendSuccess(res, { faculties: tree });
});

// GET DEPARTMENTS — ?faculty=CODE
export const getDepartments = catchAsync(async (req, res, next) => {
  const { faculty: facultyCode } = req.validated.query;
  const university = req.university._id;
  const filter = { university };

  if (facultyCode) {
    const faculty = await Faculty.findOne({ university, code: facultyCode }).select('_id');
    if (!faculty) return next(AppError.notFound(`No faculty found with code ${facultyCode}.`));
    filter.faculty = faculty._id;
  }

  const departments = await Department.find(filter)
    .select(HIDDEN)
    .populate({ path: 'faculty', select: 'code name' })
    .sort({ name: 1 });

  sendSuccess(res, { departments });
});

// GET PROGRAMMES — ?department=CODE, each with the levels it runs through
export const getProgrammes = catchAsync(async (req, res, next) => {
  const { department: departmentCode } = req.validated.query;
  const university = req.university._id;
  const filter = { university };

  if (departmentCode) {
    const department = await Department.findOne({ university, code: departmentCode }).select('_id');
    if (!department) {
      return next(AppError.notFound(`No department found with code ${departmentCode}.`));
    }
    filter.department = department._id;
  }

  const programmes = await Programme.find(filter)
    .select(HIDDEN)
    .populate({ path: 'department', select: 'code name faculty' })
    .sort({ name: 1 })
    .lean();

  sendSuccess(res, {
    programmes: programmes.map((el) => withLevels(el, req.university.config)),
  });
});

// GET ACADEMIC SESSIONS — newest first
export const getSessions = catchAsync(async (req, res) => {
  const sessions = await AcademicSession.find({ university: req.university._id })
    .select(HIDDEN)
    .sort({ startsOn: -1 });

  sendSuccess(res, { sessions });
});

// GET THE CURRENT SESSION
export const getCurrentSession = catchAsync(async (req, res, next) => {
  const session = await AcademicSession.findOne({
    university: req.university._id,
    isCurrent: true,
  }).select(HIDDEN);

  if (!session) return next(AppError.notFound('This university has no current session yet.'));
  sendSuccess(res, { session });
});
