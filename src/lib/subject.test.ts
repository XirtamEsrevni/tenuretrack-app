import { describe, expect, it } from 'vitest';
import {
  firstBylineYear,
  isSplitProfile,
  proposeTopics,
  rankInstitutionHits,
  resolveInstitution,
} from './subject';
import { JOB, ME, makeAuthor, paper } from './testWorks';

describe('resolveInstitution', () => {
  const author = makeAuthor({
    ror: '03r0ha626',
    name: 'Taylor Sparks',
  });
  author.affiliations[0].institution.display_name = 'University of Utah';

  it('matches a university name against affiliations', () => {
    const place = resolveInstitution(author, 'University of Utah');
    expect(place?.ror).toBe('03r0ha626');
    expect(place?.name).toBe('University of Utah');
  });

  it('accepts a ROR', () => {
    expect(resolveInstitution(author, 'https://ror.org/03r0ha626')?.ror).toBe('03r0ha626');
    expect(resolveInstitution(author, '03r0ha626')?.ror).toBe('03r0ha626');
  });

  it('reads last_known_institutions in the flat OpenAlex shape', () => {
    const author = makeAuthor({ years: [2014] });
    author.affiliations = [];
    author.last_known_institutions = [{
      id: 'https://openalex.org/I123',
      display_name: 'University of Utah',
      type: 'education',
      ror: 'https://ror.org/03r0ha626',
    }];
    expect(resolveInstitution(author, 'University of Utah')?.ror).toBe('03r0ha626');
  });

  it('still matches when the university string is a substring', () => {
    const author = makeAuthor({ ror: '03r0ha626' });
    author.affiliations[0].institution.display_name = 'The University of Utah';
    expect(resolveInstitution(author, 'University of Utah')?.ror).toBe('03r0ha626');
  });

  it('does not throw when affiliations are missing', () => {
    const author = makeAuthor({ ror: '03r0ha626' });
    (author as { affiliations?: unknown }).affiliations = undefined;
    author.last_known_institutions = [{
      id: 'https://openalex.org/I123',
      display_name: 'University of Utah',
      type: 'education',
      ror: 'https://ror.org/03r0ha626',
    }];
    expect(resolveInstitution(author, 'University of Utah')?.ror).toBe('03r0ha626');
  });
});

describe('rankInstitutionHits', () => {
  it('prefers an education institution with more works, matching init', () => {
    const picked = rankInstitutionHits([
      { id: 'I1', display_name: 'Utah System', type: 'education', ror: 'https://ror.org/aaaaaaa1', works_count: 10 },
      { id: 'I2', display_name: 'University of Utah', type: 'education', ror: 'https://ror.org/03r0ha626', works_count: 90000 },
      { id: 'I3', display_name: 'Utah hospital', type: 'healthcare', ror: 'https://ror.org/bbbbbbb2', works_count: 200000 },
    ]);
    expect(picked?.ror).toBe('03r0ha626');
    expect(picked?.name).toBe('University of Utah');
  });
});

describe('proposeTopics', () => {
  it('lets each paper vote once for its primary topic and caps at three', () => {
    const works = [
      paper({ year: 2014, ror: JOB, topic: { id: 'https://openalex.org/T1', name: 'A' } }),
      paper({ year: 2014, ror: JOB, topic: { id: 'https://openalex.org/T1', name: 'A' }, id: 'W2' }),
      paper({ year: 2015, ror: JOB, topic: { id: 'https://openalex.org/T1', name: 'A' }, id: 'W3' }),
      paper({ year: 2015, ror: JOB, topic: { id: 'https://openalex.org/T2', name: 'B' }, id: 'W4' }),
      paper({ year: 2016, ror: JOB, topic: { id: 'https://openalex.org/T2', name: 'B' }, id: 'W5' }),
      paper({ year: 2016, ror: JOB, topic: { id: 'https://openalex.org/T2', name: 'B' }, id: 'W6' }),
      paper({ year: 2016, ror: JOB, topic: { id: 'https://openalex.org/T3', name: 'C' }, id: 'W7' }),
    ];
    const { topics, basis } = proposeTopics(works, ME, JOB, 2013);
    expect(basis).toBe('anchored');
    expect(topics.map((t) => t.id)).toEqual(['T1', 'T2']);
    expect(topics[0].paperCount).toBe(3);
  });

  it('widens the proposal when the anchored set is thin', () => {
    const works = [
      paper({ year: 2014, ror: '01phd0000', topic: { id: 'T1', name: 'A' } }),
      paper({ year: 2015, ror: '01phd0000', topic: { id: 'T1', name: 'A' }, id: 'W2' }),
      paper({ year: 2016, ror: JOB, topic: { id: 'T2', name: 'B' }, id: 'W3' }),
    ];
    const { basis } = proposeTopics(works, ME, JOB, 2013);
    expect(basis).toBe('since_start');
  });
});

describe('firstBylineYear', () => {
  it('returns the earliest journal article at the institution', () => {
    const works = [
      paper({ year: 2012, ror: '01phd0000' }),
      paper({ year: 2014, ror: JOB }),
      paper({ year: 2015, ror: JOB }),
    ];
    expect(firstBylineYear(works, ME, JOB)).toBe(2014);
  });
});

describe('isSplitProfile', () => {
  const primary = makeAuthor({
    id: 'https://openalex.org/A100',
    name: 'Jane Doe',
    orcid: '0000-0002-1825-0097',
    worksCount: 40,
    ror: JOB,
    topics: [
      { id: 'https://openalex.org/T10001', count: 20 },
      { id: 'https://openalex.org/T10002', count: 10 },
    ],
  });

  it('treats a small fragment at the same place as the same person', () => {
    const fragment = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'J. Doe',
      orcid: null,
      worksCount: 3,
      ror: JOB,
    });
    expect(isSplitProfile(primary, fragment, JOB)).toBe(true);
  });

  it('matches a fragment through an alternative name', () => {
    const fragment = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'Jane Roe',
      orcid: null,
      worksCount: 3,
      ror: JOB,
      alternatives: ['Jane Doe'],
    });
    expect(isSplitProfile(primary, fragment, JOB)).toBe(true);
  });

  it('does not merge a profile with a different ORCID', () => {
    const other = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'J. Doe',
      orcid: '0000-0001-0000-0001',
      worksCount: 3,
      ror: JOB,
    });
    expect(isSplitProfile(primary, other, JOB)).toBe(false);
  });

  it('never merges two substantial profiles', () => {
    const twin = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'J. Doe',
      orcid: null,
      worksCount: 38,
      ror: JOB,
    });
    expect(isSplitProfile(primary, twin, JOB)).toBe(false);
  });

  it('does not merge a fragment at another institution', () => {
    const elsewhere = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'J. Doe',
      orcid: null,
      worksCount: 3,
      ror: '00000000a',
    });
    expect(isSplitProfile(primary, elsewhere, JOB)).toBe(false);
  });

  it('does not merge a namesake in another field', () => {
    const namesake = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'J. Doe',
      orcid: null,
      worksCount: 3,
      ror: JOB,
      topics: [{ id: 'https://openalex.org/T20001', count: 3 }],
    });
    expect(isSplitProfile(primary, namesake, JOB)).toBe(false);
  });

  it('does not merge a different name at the same place', () => {
    const colleague = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'Robert Poe',
      orcid: null,
      worksCount: 3,
      ror: JOB,
    });
    expect(isSplitProfile(primary, colleague, JOB)).toBe(false);
  });

  it('does not treat a profile as a fragment of itself', () => {
    expect(isSplitProfile(primary, primary, JOB)).toBe(false);
  });

  it('matches through accents and suffixes', () => {
    const jane = makeAuthor({
      id: 'https://openalex.org/A100',
      name: 'Jané Doe',
      orcid: '0000-0002-1825-0097',
      worksCount: 40,
      ror: JOB,
    });
    const fragment = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'Jane Doe Jr.',
      orcid: null,
      worksCount: 2,
      ror: JOB,
    });
    expect(isSplitProfile(jane, fragment, JOB)).toBe(true);
  });

  it('does not merge Tyler Sparks into Taylor Sparks', () => {
    const taylor = makeAuthor({
      id: 'https://openalex.org/A100',
      name: 'Taylor Sparks',
      orcid: '0000-0001-8020-7711',
      worksCount: 40,
      ror: JOB,
    });
    const tyler = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'Tyler Sparks',
      orcid: null,
      worksCount: 2,
      ror: JOB,
    });
    expect(isSplitProfile(taylor, tyler, JOB)).toBe(false);
  });

  it('matches an abbreviated first name', () => {
    const taylor = makeAuthor({
      id: 'https://openalex.org/A100',
      name: 'Taylor Sparks',
      orcid: '0000-0001-8020-7711',
      worksCount: 40,
      ror: JOB,
    });
    const fragment = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'T. Sparks',
      orcid: null,
      worksCount: 2,
      ror: JOB,
    });
    expect(isSplitProfile(taylor, fragment, JOB)).toBe(true);
  });

  it('matches a surname-first alternative', () => {
    const taylor = makeAuthor({
      id: 'https://openalex.org/A100',
      name: 'Taylor Sparks',
      orcid: '0000-0001-8020-7711',
      worksCount: 40,
      ror: JOB,
    });
    const fragment = makeAuthor({
      id: 'https://openalex.org/A101',
      name: 'Sparks, Taylor',
      orcid: null,
      worksCount: 2,
      ror: JOB,
    });
    expect(isSplitProfile(taylor, fragment, JOB)).toBe(true);
  });
});
