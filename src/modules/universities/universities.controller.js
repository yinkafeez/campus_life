import University from './university.model.js';
import { entryLevelsOf, levelLabel } from './university.config.js';
import Faculty from '../academics/faculty.model.js';
import Department from '../academics/department.model.js';
import Programme from '../academics/programme.model.js';
import catchAsync from '../../core/http/catchAsync.js';
import { sendSuccess } from '../../core/http/respond.js';

// fields players need to pick a campus (config is fetched per university)
const LIST_FIELDS = 'slug name shortName location status';

// GET ALL ACTIVE UNIVERSITIES (the campus picker)
export const listUniversities = catchAsync(async (req, res) => {
  const universities = await University.find({ status: 'active' })
    .select(LIST_FIELDS)
    .sort({ name: 1 });

  sendSuccess(res, { universities });
});

// GET ONE UNIVERSITY — including its public rules (config)
// (admin notes like dataNotes stay out of the public answer; admins use /admin/universities)
export const getUniversity = (req, res) => {
  const { dataNotes, ...university } = req.university.toJSON();
  sendSuccess(res, { university });
};

// GET ADMISSION OPTIONS — only programmes a new player can actually enter, with valid entry levels
export const getAdmissionOptions = catchAsync(async (req, res) => {
  const { config, _id: university } = req.university;
  const entryLevels = entryLevelsOf(config);
  const label = (level) => ({ level, label: levelLabel(config, level) });

  const [faculties, departments, programmes] = await Promise.all([
    Faculty.find({ university }).select('code name').sort({ name: 1 }).lean(),
    Department.find({ university }).select('code name faculty').sort({ name: 1 }).lean(),
    Programme.find({ university })
      .select('code name award durationYears department')
      .sort({ name: 1 })
      .lean(),
  ]);

  const programmesByDept = Map.groupBy(
    programmes
      .map((p) => ({
        ...p,
        entryLevels: entryLevels
          .filter((level) => config.levels.values.slice(0, p.durationYears).includes(level))
          .map(label),
      }))
      .filter((p) => p.entryLevels.length),
    (el) => String(el.department),
  );
  const deptsByFaculty = Map.groupBy(departments, (el) => String(el.faculty));

  // drop empty branches: a faculty with no programmes can't be chosen
  const tree = faculties
    .map((faculty) => ({
      code: faculty.code,
      name: faculty.name,
      departments: (deptsByFaculty.get(String(faculty._id)) ?? [])
        .map((dept) => ({
          code: dept.code,
          name: dept.name,
          programmes: (programmesByDept.get(String(dept._id)) ?? []).map(
            ({ code, name, award, durationYears, entryLevels: levels }) => ({
              code,
              name,
              award,
              durationYears,
              entryLevels: levels,
            }),
          ),
        }))
        .filter((dept) => dept.programmes.length),
    }))
    .filter((faculty) => faculty.departments.length);

  sendSuccess(res, {
    university: { slug: req.university.slug, name: req.university.name },
    isSimulated: true,
    disclaimer: config.admission.disclaimer,
    reviewSeconds: config.admission.reviewSeconds,
    faculties: tree,
  });
});
