import { describe, expect, it } from 'vitest';
import {
  capCutoffShare,
  coreTopicShare,
  estimateStart,
  plausibleYears,
  rankAndCap,
} from './career';
import { JOB, ME, PHD, SECOND_JOB, STRAY, makeAuthor, paper } from './testWorks';

const ARTICLES = ['article'];

function traineeThenFaculty() {
  return [
    paper({ year: 2004, ror: PHD, position: 'first' }),
    paper({ year: 2005, ror: PHD, position: 'first' }),
    paper({ year: 2006, ror: PHD, position: 'middle' }),
    paper({ year: 2012, ror: JOB, position: 'middle' }),
    paper({ year: 2013, ror: JOB, position: 'last' }),
    paper({ year: 2015, ror: JOB, position: 'last' }),
  ];
}

describe('estimateStart', () => {
  it('dates the clean case from the first byline at the place they led from', () => {
    const estimate = estimateStart(traineeThenFaculty(), ME, ARTICLES);
    expect(estimate.year).toBe(2012);
    expect(estimate.confidence).toBe('high');
    expect(estimate.institutionRor).toBe(JOB);
    expect(estimate.ledPapers).toBe(2);
  });

  it('counts a corresponding flag as leading', () => {
    const record = [
      paper({ year: 2004, ror: PHD, position: 'first' }),
      paper({ year: 2012, ror: JOB, position: 'middle' }),
      paper({ year: 2013, ror: JOB, position: 'middle', corresponding: true }),
      paper({ year: 2014, ror: JOB, position: 'middle', corresponding: true }),
    ];
    const estimate = estimateStart(record, ME, ARTICLES);
    expect(estimate.year).toBe(2012);
    expect(estimate.confidence).toBe('high');
  });

  it('does not treat one led paper as a group', () => {
    const record = [
      paper({ year: 2004, ror: PHD, position: 'first' }),
      paper({ year: 2012, ror: JOB, position: 'middle' }),
      paper({ year: 2013, ror: JOB, position: 'last' }),
    ];
    const estimate = estimateStart(record, ME, ARTICLES);
    expect(estimate.confidence).toBe('low');
    expect(estimate.year).toBe(2012);
  });

  it('cannot place someone who never moved', () => {
    const record = [
      paper({ year: 2004, ror: JOB, position: 'first' }),
      paper({ year: 2012, ror: JOB, position: 'last' }),
      paper({ year: 2013, ror: JOB, position: 'last' }),
    ];
    const estimate = estimateStart(record, ME, ARTICLES);
    expect(estimate.confidence).toBe('low');
    expect(estimate.note).toMatch(/cannot be told apart/);
  });

  it('does not place someone who never led', () => {
    const record = [
      paper({ year: 2010, ror: PHD, position: 'first' }),
      paper({ year: 2012, ror: PHD, position: 'middle' }),
    ];
    const estimate = estimateStart(record, ME, ARTICLES);
    expect(estimate.year).toBeNull();
    expect(estimate.confidence).toBe('none');
  });

  it('ignores preprints when dating a start', () => {
    const record = [
      paper({ year: 2004, ror: PHD, position: 'first' }),
      paper({ year: 2009, ror: JOB, position: 'last', kind: 'preprint' }),
      paper({ year: 2013, ror: JOB, position: 'last' }),
      paper({ year: 2014, ror: JOB, position: 'last' }),
    ];
    expect(estimateStart(record, ME, ARTICLES).year).toBe(2013);
  });

  it('dates a mover from the first faculty job', () => {
    const record = [
      paper({ year: 2004, ror: PHD, position: 'first' }),
      paper({ year: 2010, ror: JOB, position: 'last' }),
      paper({ year: 2011, ror: JOB, position: 'last' }),
      paper({ year: 2019, ror: SECOND_JOB, position: 'last' }),
      paper({ year: 2020, ror: SECOND_JOB, position: 'last' }),
    ];
    const estimate = estimateStart(record, ME, ARTICLES);
    expect(estimate.year).toBe(2010);
    expect(estimate.institutionRor).toBe(JOB);
  });

  it('does not let a stray affiliation outrank a real career', () => {
    const record = [
      paper({ year: 2009, ror: PHD, position: 'first' }),
      ...Array.from({ length: 10 }, (_, i) =>
        paper({ year: 2014 + i, ror: JOB, position: 'last', id: `Wjob${i}` }),
      ),
      paper({ year: 2015, ror: STRAY, position: 'last', id: 'Wstray1' }),
      paper({ year: 2019, ror: STRAY, position: 'last', id: 'Wstray2' }),
    ];
    const estimate = estimateStart(record, ME, ARTICLES);
    expect(estimate.institutionRor).toBe(JOB);
    expect(estimate.year).toBe(2014);
  });

  it('still finds the real start if the PhD record has one led paper', () => {
    const record = [
      paper({ year: 2004, ror: PHD, position: 'first' }),
      paper({ year: 2006, ror: PHD, position: 'last' }),
      ...Array.from({ length: 6 }, (_, i) =>
        paper({ year: 2012 + i, ror: JOB, position: 'last', id: `Wjob${i}` }),
      ),
    ];
    const estimate = estimateStart(record, ME, ARTICLES);
    expect(estimate.confidence).toBe('high');
    expect(estimate.year).toBe(2012);
    expect(estimate.institutionRor).toBe(JOB);
  });

  it('matches author ids whether they are URLs or short ids', () => {
    const estimate = estimateStart(traineeThenFaculty(), 'A1000001', ARTICLES);
    expect(estimate.confidence).toBe('high');
    expect(estimate.year).toBe(2012);
  });
});

describe('plausibleYears', () => {
  it('drops a record that ends before the window', () => {
    expect(plausibleYears(makeAuthor({ years: [1998, 2004] }), 2008, 2018)).toBe(false);
  });

  it('drops a record that starts after the window', () => {
    expect(plausibleYears(makeAuthor({ years: [2020, 2024] }), 2008, 2018)).toBe(false);
  });

  it('keeps a record that spans the window', () => {
    expect(plausibleYears(makeAuthor({ years: [2004, 2020] }), 2008, 2018)).toBe(true);
  });

  it('drops a record with no years', () => {
    expect(plausibleYears(makeAuthor({ years: [] }), 2008, 2018)).toBe(false);
  });
});

describe('rankAndCap', () => {
  it('keeps the most on-topic people when the cap binds', () => {
    const people = [
      makeAuthor({ id: 'https://openalex.org/A1', topics: [{ id: 'T10001', count: 90 }, { id: 'T9', count: 10 }] }),
      makeAuthor({ id: 'https://openalex.org/A2', topics: [{ id: 'T10001', count: 40 }, { id: 'T9', count: 60 }] }),
      makeAuthor({ id: 'https://openalex.org/A3', topics: [{ id: 'T10001', count: 70 }, { id: 'T9', count: 30 }] }),
    ];
    const kept = rankAndCap(people, ['T10001'], 2);
    expect(kept.map((a) => a.id)).toEqual([
      'https://openalex.org/A1',
      'https://openalex.org/A3',
    ]);
    expect(capCutoffShare(kept, ['T10001'], 2)).toBeCloseTo(0.7);
  });

  it('does not cap when everyone fits', () => {
    const people = [
      makeAuthor({ id: 'https://openalex.org/A1' }),
      makeAuthor({ id: 'https://openalex.org/A2' }),
    ];
    expect(rankAndCap(people, ['T10001'], 10)).toHaveLength(2);
    expect(capCutoffShare(people, ['T10001'], 10)).toBeNull();
  });

  it('computes core topic share from counts, not OpenAlex topic_share', () => {
    const a = makeAuthor({
      topics: [
        { id: 'https://openalex.org/T10001', count: 40 },
        { id: 'https://openalex.org/T9', count: 60 },
      ],
    });
    expect(coreTopicShare(a, ['T10001'])).toBeCloseTo(0.4);
  });
});
