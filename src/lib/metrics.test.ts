import { describe, expect, it } from 'vitest';
import {
  computeMetrics,
  computeTopQuartileCutoff,
  hasBylineAt,
  institutionsOn,
  isJournalArticle,
} from './metrics';
import { hIndex } from './stats';
import { JOB, ME, paper } from './testWorks';

const ARTICLES = ['article'];

describe('hIndex', () => {
  it.each([
    [[], 0],
    [[0, 0, 0], 0],
    [[1], 1],
    [[10, 8, 5, 4, 3], 4],
    [[25, 8, 5, 3, 3], 3],
    [[100], 1],
    [[3, 3, 3], 3],
  ] as Array<[number[], number]>)('h(%j) = %s', (citations, expected) => {
    expect(hIndex(citations)).toBe(expected);
  });

  it('does not care about order', () => {
    expect(hIndex([3, 10, 1, 8])).toBe(hIndex([10, 8, 3, 1]));
  });
});

describe('window and metrics', () => {
  it('counts career years 1 through N from the appointment year', () => {
    const works = Array.from({ length: 12 }, (_, i) => paper({ year: 2008 + i, position: 'middle' }));
    const got = computeMetrics(works, ME, 2010, 6, ARTICLES, null);
    expect(got.pubs).toBe(6);
  });

  it('excludes anything that is not a journal article', () => {
    const works = [
      paper({ year: 2010 }),
      paper({ year: 2011, kind: 'preprint' }),
      paper({ year: 2012, kind: 'book-chapter' }),
    ];
    expect(computeMetrics(works, ME, 2010, 6, ARTICLES, null).pubs).toBe(1);
  });

  it('drops preprint servers even when typed as article', () => {
    const works = [
      paper({ year: 2010, sourceName: 'arXiv' }),
      paper({ year: 2011, sourceName: 'Nature' }),
    ];
    expect(isJournalArticle(works[0])).toBe(false);
    expect(computeMetrics(works, ME, 2010, 6, ARTICLES, null).pubs).toBe(1);
  });

  it('counts a record correctly, including corresponding as led', () => {
    const works = [
      paper({ year: 2010, position: 'last', source: 'S1', citations: 10 }),
      paper({ year: 2011, position: 'last', source: 'S1', citations: 5 }),
      paper({ year: 2012, position: 'first', source: 'S2', citations: 3 }),
      paper({ year: 2013, position: 'middle', source: 'S2', citations: 1 }),
      paper({ year: 2014, position: 'middle', corresponding: true, source: 'S2', citations: 0 }),
    ];
    const got = computeMetrics(works, ME, 2010, 6, ARTICLES, null);
    expect(got.pubs).toBe(5);
    expect(got.led).toBe(3);
    expect(got.leadShare).toBeCloseTo(0.6);
    expect(got.citations).toBe(19);
    expect(got.hIndex).toBe(3);
  });

  it('uses the real author id, not a dummy', () => {
    const works = [paper({ year: 2010, position: 'last' }), paper({ year: 2011, position: 'last' })];
    expect(computeMetrics(works, 'subject', 2010, 6, ARTICLES, null).led).toBe(0);
    expect(computeMetrics(works, ME, 2010, 6, ARTICLES, null).led).toBe(2);
  });

  it('records a share over zero papers as missing, not zero', () => {
    const got = computeMetrics([], ME, 2010, 6, ARTICLES, null);
    expect(got.pubs).toBe(0);
    expect(got.leadShare).toBeNull();
    expect(got.venueImpactMedian).toBeNull();
    expect(got.topQuartileShare).toBeNull();
  });

  it('takes venue impact as the median over papers with a known venue', () => {
    const works = [
      paper({ year: 2010, source: 'S1', impact: 1 }),
      paper({ year: 2011, source: 'S2', impact: 5 }),
      paper({ year: 2012, source: 'S3' }),
    ];
    const got = computeMetrics(works, ME, 2010, 6, ARTICLES, null);
    expect(got.venueImpactMedian).toBeCloseTo(3);
  });

  it('leaves a venue with no impact figure out rather than counting it as zero', () => {
    const works = [
      paper({ year: 2010, source: 'S1', impact: 4 }),
      paper({ year: 2011, source: 'S404' }),
    ];
    expect(computeMetrics(works, ME, 2010, 6, ARTICLES, null).venueImpactMedian).toBeCloseTo(4);
  });

  it('computes top-quartile share only over papers whose venue is known', () => {
    const works = [
      paper({ year: 2010, source: 'S1', impact: 9 }),
      paper({ year: 2011, source: 'S2', impact: 1 }),
      paper({ year: 2012, source: 'S404' }),
    ];
    const got = computeMetrics(works, ME, 2010, 6, ARTICLES, 5);
    expect(got.topQuartileShare).toBeCloseTo(0.5);
  });

  it('anchors the subject to the institution byline when asked', () => {
    const works = [
      paper({ year: 2010, position: 'last', ror: JOB }),
      paper({ year: 2011, position: 'last', ror: '01other00' }),
    ];
    expect(hasBylineAt(works[0], ME, JOB)).toBe(true);
    expect(computeMetrics(works, ME, 2010, 6, ARTICLES, null, JOB).pubs).toBe(1);
    expect(computeMetrics(works, ME, 2010, 6, ARTICLES, null).pubs).toBe(2);
  });
});

describe('institutionsOn', () => {
  it('groups by ROR and ignores a byline with no ROR', () => {
    const withRor = paper({ year: 2010, ror: JOB, position: 'last' });
    const withoutRor = paper({ year: 2011, position: 'last' });
    withoutRor.authorships[0].institutions = [
      {
        id: 'https://openalex.org/I1',
        display_name: 'Some University',
        ror: null,
        type: 'education',
      },
    ];
    expect(institutionsOn(withRor, ME)).toEqual([JOB]);
    expect(institutionsOn(withoutRor, ME)).toEqual([]);
  });

  it('normalizes a ror.org URL to the short id', () => {
    const work = paper({ year: 2010, ror: JOB });
    expect(institutionsOn(work, ME)).toEqual([JOB]);
  });
});

describe('top-quartile cutoff', () => {
  it('is the 75th percentile of cohort venues', () => {
    const papers = [1, 2, 3, 4].map((i) =>
      paper({ year: 2010, source: `S${i}`, impact: i, id: `W${i}` }),
    );
    expect(computeTopQuartileCutoff(papers)).toBeCloseTo(3.25);
  });

  it('refuses to speak of a quartile with too few venues', () => {
    expect(computeTopQuartileCutoff([paper({ year: 2010, source: 'S1', impact: 1 })])).toBeNull();
  });
});
