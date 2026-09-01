import { describe, expect, it } from 'vitest';
import {
  MIN_PAPERS_PER_ROLE,
  emptyRoles,
  ledVsMiddleGap,
  pairedWithinPerson,
  personRoles,
  pooledRates,
  type PersonRoles,
} from './chaperone';
import { signTest } from './stats';
import { ME, paper } from './testWorks';

const ARTICLES = ['article'];

function roles(partial: Partial<PersonRoles> & { authorId?: string }): PersonRoles {
  return { ...emptyRoles(partial.authorId ?? ME), ...partial };
}

describe('personRoles', () => {
  it('splits papers by role and counts top-quartile venues', () => {
    const works = [
      paper({ year: 2010, position: 'last', source: 'S10', impact: 9 }),
      paper({ year: 2011, position: 'middle', source: 'S10', impact: 9 }),
      paper({ year: 2012, position: 'first', source: 'S20', impact: 1 }),
      paper({ year: 2013, position: 'middle', source: 'S20', impact: 1 }),
    ];
    const got = personRoles(works, ME, ARTICLES, 5);
    expect(got.ledPapers).toBe(1);
    expect(got.ledTop).toBe(1);
    expect(got.firstPapers).toBe(1);
    expect(got.firstTop).toBe(0);
    expect(got.middlePapers).toBe(2);
    expect(got.middleTop).toBe(1);
  });

  it('leaves papers with an unplaceable venue out of both sides', () => {
    const works = [
      paper({ year: 2010, position: 'last', source: 'S30', impact: 9 }),
      paper({ year: 2011, position: 'last', source: 'S40' }),
    ];
    expect(personRoles(works, ME, ARTICLES, 5).ledPapers).toBe(1);
  });

  it('counts nothing when there is no cutoff', () => {
    const works = [paper({ year: 2010, position: 'last', source: 'S1', impact: 9 })];
    expect(personRoles(works, ME, ARTICLES, null).ledPapers).toBe(0);
  });

  it('restricts to the career window when a start year is given', () => {
    const works = [
      paper({ year: 2008, position: 'last', source: 'S10', impact: 9 }),
      paper({ year: 2010, position: 'last', source: 'S10', impact: 9 }),
      paper({ year: 2017, position: 'last', source: 'S10', impact: 9 }),
    ];
    expect(personRoles(works, ME, ARTICLES, 5, 2010, 6).ledPapers).toBe(1);
  });
});

describe('pooled rates and gap', () => {
  it('counts papers, not people', () => {
    const people = [
      roles({ authorId: 'A1', ledPapers: 100, ledTop: 50 }),
      roles({ authorId: 'A2', ledPapers: 1, ledTop: 0 }),
    ];
    const byRole = pooledRates(people);
    expect(byRole[0].papers).toBe(101);
    expect(byRole[0].rate).toBeCloseTo(50 / 101);
    expect(byRole[0].people).toBe(2);
  });

  it('computes middle minus led', () => {
    const people = [roles({ ledPapers: 10, ledTop: 2, middlePapers: 10, middleTop: 5 })];
    const gap = ledVsMiddleGap(people, 200);
    expect(gap.ledRate).toBeCloseTo(0.2);
    expect(gap.middleRate).toBeCloseTo(0.5);
    expect(gap.gap).toBeCloseTo(0.3);
  });

  it('brackets the estimate with a cluster-bootstrap interval', () => {
    const people = Array.from({ length: 60 }, (_, i) =>
      roles({ authorId: `A${i}`, ledPapers: 8, ledTop: 2, middlePapers: 8, middleTop: 4 }),
    );
    const gap = ledVsMiddleGap(people, 400, 5);
    expect(gap.lo).toBeLessThanOrEqual(gap.gap!);
    expect(gap.hi).toBeGreaterThanOrEqual(gap.gap!);
  });

  it('is reproducible with the same seed', () => {
    const people = Array.from({ length: 40 }, (_, i) =>
      roles({ authorId: `A${i}`, ledPapers: 5, ledTop: i % 3, middlePapers: 5, middleTop: 2 }),
    );
    expect(ledVsMiddleGap(people, 200, 2)).toEqual(ledVsMiddleGap(people, 200, 2));
  });

  it('gives no gap when nobody can be compared', () => {
    expect(ledVsMiddleGap([], 100).gap).toBeNull();
  });
});

describe('sign test and paired comparison', () => {
  it.each([
    [0, 0, null],
    [5, 5, 1],
    [10, 0, 2 / 2 ** 10],
    [0, 10, 2 / 2 ** 10],
    [1, 1, 1],
  ] as Array<[number, number, number | null]>)(
    'signTest(%s, %s) = %s',
    (higher, lower, expected) => {
      const got = signTest(higher, lower);
      if (expected == null) expect(got).toBeNull();
      else expect(got).toBeCloseTo(expected);
    },
  );

  it('pairs only people with enough papers in both roles', () => {
    const people = [
      roles({ authorId: 'A1', ledPapers: 5, ledTop: 1, middlePapers: 5, middleTop: 3 }),
      roles({ authorId: 'A2', ledPapers: 5, ledTop: 1 }),
      roles({ authorId: 'A3', middlePapers: 5, middleTop: 1 }),
    ];
    expect(pairedWithinPerson(people).people).toBe(1);
  });

  it('excludes someone just below the bar', () => {
    const thin = roles({
      ledPapers: MIN_PAPERS_PER_ROLE - 1,
      ledTop: 1,
      middlePapers: 10,
      middleTop: 5,
    });
    expect(pairedWithinPerson([thin]).people).toBe(0);
  });

  it('counts who went which way and computes live medians', () => {
    const people = [
      roles({ authorId: 'A1', ledPapers: 4, ledTop: 1, middlePapers: 4, middleTop: 3 }),
      roles({ authorId: 'A2', ledPapers: 4, ledTop: 3, middlePapers: 4, middleTop: 1 }),
      roles({ authorId: 'A3', ledPapers: 4, ledTop: 2, middlePapers: 4, middleTop: 2 }),
    ];
    const got = pairedWithinPerson(people);
    expect(got.higherOnMiddle).toBe(1);
    expect(got.higherOnLed).toBe(1);
    expect(got.ties).toBe(1);
    expect(got.pValue).toBeCloseTo(1);
    expect(got.medianLedShare).toBeCloseTo(0.5);
    expect(got.medianMiddleShare).toBeCloseTo(0.5);
    expect(got.medianLedShare).not.toBeCloseTo(0.182);
    expect(got.medianMiddleShare).not.toBeCloseTo(0.25);
  });

  it('shows a small p-value for a consistent effect', () => {
    const people = Array.from({ length: 12 }, (_, i) =>
      roles({ authorId: `A${i}`, ledPapers: 5, ledTop: 1, middlePapers: 5, middleTop: 4 }),
    );
    const got = pairedWithinPerson(people);
    expect(got.higherOnMiddle).toBe(12);
    expect(got.pValue).toBeLessThan(0.001);
    expect(got.medianMiddleShare!).toBeGreaterThan(got.medianLedShare!);
  });
});
