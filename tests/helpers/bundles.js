// A complete, clearly FICTIONAL university bundle with rules that differ from UNILAG's
// on purpose (levels, grading scale, matric format, allocation, elections).
export function makeTestBundle(overrides = {}) {
  return {
    formatVersion: 1,
    university: {
      slug: 'riverside-test',
      name: 'Riverside Test University',
      shortName: 'RTU',
      status: 'active',
      config: {
        matricNumber: { template: 'RTU-{yyyy}-{seq:5}', sequenceScope: 'university' },
        academicCalendar: { semesterNames: ['Autumn', 'Spring', 'Summer'] },
        levels: { values: [1, 2, 3], labelFormat: 'Year {level}' },
        grading: { cgpaScale: 4 },
        accommodation: { allocationStrategy: 'priority', priorityGroups: ['athletes'] },
        elections: {
          campaignDays: 5,
          defaultCandidateEligibility: { minLevel: 2, minCgpa: 2.75 },
        },
      },
    },
    faculties: [
      {
        code: 'SCI',
        name: 'Faculty of Testing Science',
        verification: { status: 'proposed' },
        departments: [
          {
            code: 'QA',
            name: 'Department of Quality',
            programmes: [
              { code: 'QAS', name: 'Quality Science', award: 'B.Sc.', durationYears: 3 },
            ],
          },
        ],
      },
    ],
    sessions: [
      { name: '2026/2027', startsOn: '2026-09-01', endsOn: '2027-06-30', isCurrent: true },
    ],
    locations: [
      { slug: 'river-hall', name: 'River Hall', category: 'academic', zone: 'riverside' },
      {
        slug: 'river-cafe',
        name: 'River Cafe',
        aliases: ['The Cafe'],
        category: 'food',
        parent: 'river-hall',
      },
    ],
    hostels: [
      {
        slug: 'otter-house',
        name: 'Otter House',
        residentGender: 'female',
        location: 'river-hall',
        allocation: { eligibleLevels: [1, 2], reservedFor: ['athletes'] },
      },
      { slug: 'heron-house', name: 'Heron House', residentGender: 'male' },
    ],
    leadershipPositions: [
      { code: 'CAPTAIN', title: 'Student Captain', scope: 'university', rank: 1 },
      {
        code: 'HOUSEHEAD',
        title: 'House Head',
        scope: 'hall',
        candidateEligibility: { minLevel: 3, requireScopeMembership: true },
      },
    ],
    ...overrides,
  };
}
