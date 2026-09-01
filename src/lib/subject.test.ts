import { describe, expect, it } from 'vitest';
import { firstBylineYear, proposeTopics, resolveInstitution } from './subject';
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

  it('returns null when nothing matches', () => {
    expect(resolveInstitution(author, 'Some Other College')).toBeNull();
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
