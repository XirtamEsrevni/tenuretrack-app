import { describe, expect, it } from 'vitest';
import {
  computeMetrics,
  computeTopQuartileCutoff,
  hasBylineAt,
  institutionsOn,
  isJournalArticle,
  isLed,
  unionWorks,
  workKey,
} from './metrics';
import { hIndex } from './stats';
import { JOB, ME, paper } from './testWorks';

const ARTICLES = ['article'];
const ALT = 'https://openalex.org/A1000002';

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

  it('drops a repository even when OpenAlex types the work as an article', () => {
    const works = [
      paper({ year: 2010, sourceName: 'arXiv', sourceType: 'repository' }),
      paper({ year: 2011, sourceName: 'Nature', sourceType: 'journal' }),
    ];
    expect(isJournalArticle(works[0])).toBe(false);
    expect(computeMetrics(works, ME, 2010, 6, ARTICLES, null).pubs).toBe(1);
  });

  it('keeps an article with no source', () => {
    const work = paper({ year: 2010 });
    work.primary_location = { source: null };
    expect(isJournalArticle(work)).toBe(true);
    expect(computeMetrics([work], ME, 2010, 6, ARTICLES, null).pubs).toBe(1);
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

  it('drops visiting and prior-lab papers from the subject window the way Colab does', () => {
    // Taylor Sparks shape: 35 Utah-anchored articles vs 44 if the byline filter is skipped.
    const utah = Array.from({ length: 35 }, (_, i) =>
      paper({ year: 2013 + (i % 6), ror: JOB, id: `U${i}`, position: i < 17 ? 'last' : 'middle' }),
    );
    const elsewhere = Array.from({ length: 9 }, (_, i) =>
      paper({ year: 2013 + (i % 6), ror: '03harvard', id: `H${i}`, position: 'last' }),
    );
    const works = [...utah, ...elsewhere];
    expect(computeMetrics(works, ME, 2013, 6, ARTICLES, null).pubs).toBe(44);
    const anchored = computeMetrics(works, ME, 2013, 6, ARTICLES, null, JOB);
    expect(anchored.pubs).toBe(35);
    expect(anchored.led).toBe(17);
  });

  it('takes the strongest role when split profiles put the same person on a paper twice', () => {
    const work = paper({
      year: 2014,
      position: 'middle',
      ror: JOB,
      extraWho: [{ id: ALT, position: 'last', ror: JOB }],
    });
    expect(isLed(work, ME)).toBe(false);
    expect(isLed(work, [ME, ALT])).toBe(true);
    expect(hasBylineAt(work, [ME, ALT], JOB)).toBe(true);
    expect(computeMetrics([work], [ME, ALT], 2013, 6, ARTICLES, null, JOB).led).toBe(1);
  });
});

describe('work identity', () => {
  it('unions split profiles by DOI, case-insensitive', () => {
    const a = paper({ year: 2014, id: 'W1', doi: 'https://doi.org/10.1/Same' });
    const b = paper({ year: 2014, id: 'W2', doi: '10.1/same', who: ALT });
    expect(workKey(a)).toBe(workKey(b));
    expect(unionWorks([[a], [b]])).toHaveLength(1);
  });

  it('falls back to a normalized title and year when there is no DOI', () => {
    const a = paper({ year: 2014, id: 'W1', doi: null, title: 'The Same  Paper!' });
    const b = paper({ year: 2014, id: 'W2', doi: null, title: 'the same paper', who: ALT });
    expect(workKey(a)).toBe('the same paper|2014');
    expect(unionWorks([[a], [b]])).toHaveLength(1);
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
