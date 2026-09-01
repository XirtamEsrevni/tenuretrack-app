import { describe, expect, it } from 'vitest';
import { buildReport } from './report';
import { JOB, ME, paper } from './testWorks';
import { clockYear, comparisonHorizon, resolvedStartWindow } from './subject';

const ARTICLES = ['article'];

describe('comparison horizon and clock', () => {
  it.each([
    [1, 1],
    [4, 4],
    [6, 6],
    [11, 6],
    [30, 6],
  ])('clock year %s compares at %s', (clock, expected) => {
    expect(comparisonHorizon(clock, 6)).toBe(expected);
  });

  it('subtracts stopped-clock years from the clock, not from the paper window', () => {
    // Appointment 2020, now 2025 (calendar year 6), one year stopped → clock year 5.
    expect(clockYear(2020, 1, 2025)).toBe(5);
    const compared = comparisonHorizon(clockYear(2020, 1, 2025), 6);
    expect(compared).toBe(5);
    const works = [
      paper({ year: 2020, position: 'last', ror: JOB, impact: 4 }),
      paper({ year: 2025, position: 'last', ror: JOB, impact: 4 }),
    ];
    const { report } = buildReport({
      subjectName: 'Alex Roe',
      institution: 'Some University',
      startYear: 2020,
      clockExtension: 1,
      subjectWorks: works,
      subjectAuthorId: ME,
      subjectInstitutionRor: JOB,
      cohortMembers: Array.from({ length: 8 }, (_, i) => ({
        authorId: `https://openalex.org/A${i + 2}`,
        startYear: 2010,
        works: [
          paper({
            year: 2010,
            position: 'last',
            who: `https://openalex.org/A${i + 2}`,
            impact: 3,
            id: `Wc${i}`,
          }),
        ],
      })),
      articleTypes: ARTICLES,
      funnelRows: [],
      subfieldLabel: 'a subfield',
      startWindow: [2008, 2018],
      nowYear: 2025,
    });
    expect(report.currentCareerYear).toBe(5);
    expect(report.comparedAtYear).toBe(5);
    expect(report.clockExtensionYears).toBe(1);
    // Both calendar years of work count: 2020 and 2025.
    expect(report.subjectRows.find((r) => r.metric === 'pubs')?.value).toBe(2);
    expect(report.subjectRows.find((r) => r.metric === 'led')?.value).toBe(2);
  });

  it('caps the recent end of the start window so members have finished the horizon', () => {
    expect(resolvedStartWindow(2013, 6, 2026)).toEqual([2003, 2020]);
    expect(resolvedStartWindow(2024, 6, 2026)).toEqual([2014, 2020]);
  });
});

describe('buildReport subject identity', () => {
  it('places the subject using their OpenAlex id, not a dummy string', () => {
    const subjectWorks = [
      paper({ year: 2010, position: 'last', ror: JOB, impact: 5 }),
      paper({ year: 2011, position: 'last', ror: JOB, impact: 5 }),
      paper({ year: 2012, position: 'first', ror: JOB, impact: 5 }),
    ];
    const members = Array.from({ length: 8 }, (_, i) => ({
      authorId: `https://openalex.org/A${i + 2}`,
      startYear: 2010,
      works: [
        paper({
          year: 2010,
          position: 'last',
          who: `https://openalex.org/A${i + 2}`,
          impact: 3,
          id: `Wm${i}a`,
        }),
        paper({
          year: 2011,
          position: 'middle',
          who: `https://openalex.org/A${i + 2}`,
          impact: 3,
          id: `Wm${i}b`,
        }),
      ],
    }));
    const { report } = buildReport({
      subjectName: 'Alex Roe',
      institution: 'Some University',
      startYear: 2010,
      clockExtension: 0,
      subjectWorks,
      subjectAuthorId: ME,
      subjectInstitutionRor: JOB,
      cohortMembers: members,
      articleTypes: ARTICLES,
      funnelRows: [],
      subfieldLabel: 'a subfield',
      startWindow: [2008, 2018],
      nowYear: 2016,
    });
    expect(report.subjectRows.find((r) => r.metric === 'pubs')?.value).toBe(3);
    expect(report.subjectRows.find((r) => r.metric === 'led')?.value).toBe(2);
    expect(report.subjectRows.find((r) => r.metric === 'lead_share')?.value).toBeCloseTo(2 / 3);
    expect(report.chaperonePaired.find((r) => r.metric === 'median_led_share')?.value).not.toBeCloseTo(0.182);
  });

  it('does not count trainee papers that do not carry the institution byline', () => {
    const subjectWorks = [
      paper({ year: 2010, position: 'last', ror: JOB, impact: 5 }),
      paper({ year: 2010, position: 'first', ror: '01phd0000', impact: 5 }),
    ];
    const members = Array.from({ length: 6 }, (_, i) => ({
      authorId: `https://openalex.org/A${i + 2}`,
      startYear: 2010,
      works: [
        paper({
          year: 2010,
          position: 'last',
          who: `https://openalex.org/A${i + 2}`,
          impact: 2 + i,
          id: `Wt${i}`,
        }),
      ],
    }));
    const { report } = buildReport({
      subjectName: 'Alex Roe',
      institution: 'Some University',
      startYear: 2010,
      clockExtension: 0,
      subjectWorks,
      subjectAuthorId: ME,
      subjectInstitutionRor: JOB,
      cohortMembers: members,
      articleTypes: ARTICLES,
      funnelRows: [],
      subfieldLabel: 'a subfield',
      startWindow: [2008, 2018],
      nowYear: 2016,
    });
    expect(report.subjectRows.find((r) => r.metric === 'pubs')?.value).toBe(1);
  });
});
