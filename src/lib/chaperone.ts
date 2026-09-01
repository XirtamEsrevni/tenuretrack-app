import type { OpenAlexWork } from './openalex';
import { isJournalArticle, isLed, roleOf } from './metrics';
import { median, mulberry32, signTest } from './stats';
import { HORIZON_YEARS } from './subject';

export interface CohortMember {
  authorId: string;
  startYear: number;
  works: OpenAlexWork[];
}

export const MIN_PAPERS_PER_ROLE = 3;
export const ROLE_LED = 'led';
export const ROLE_FIRST = 'first_not_led';
export const ROLE_MIDDLE = 'middle';

export interface PersonRoles {
  authorId: string;
  ledPapers: number;
  ledTop: number;
  firstPapers: number;
  firstTop: number;
  middlePapers: number;
  middleTop: number;
}

export interface RoleRate {
  role: string;
  people: number;
  papers: number;
  rate: number | null;
}

export interface Gap {
  ledRate: number | null;
  middleRate: number | null;
  gap: number | null;
  lo: number | null;
  hi: number | null;
  people: number;
}

export interface PairedTest {
  people: number;
  medianLedShare: number | null;
  medianMiddleShare: number | null;
  higherOnMiddle: number;
  higherOnLed: number;
  ties: number;
  pValue: number | null;
}

const ROLE_LABELS: Record<string, string> = {
  [ROLE_LED]: 'Led (last or corresponding)',
  [ROLE_FIRST]: 'First author, not leading',
  [ROLE_MIDDLE]: 'Middle author',
};

export function emptyRoles(authorId: string): PersonRoles {
  return {
    authorId,
    ledPapers: 0,
    ledTop: 0,
    firstPapers: 0,
    firstTop: 0,
    middlePapers: 0,
    middleTop: 0,
  };
}

export function personRoles(
  works: OpenAlexWork[],
  authorId: string,
  articleTypes: string[],
  cutoff: number | null,
  startYear?: number,
  throughYear = HORIZON_YEARS,
): PersonRoles {
  if (cutoff == null) return emptyRoles(authorId);
  const counts = emptyRoles(authorId);
  const last = startYear != null ? startYear + throughYear - 1 : null;
  for (const work of works) {
    if (!isJournalArticle(work) || !articleTypes.includes(work.type)) continue;
    if (startYear != null && last != null) {
      if (work.publication_year < startYear || work.publication_year > last) continue;
    }
    const impact = work.primary_location?.source?.summary_stats?.['2yr_mean_citedness'];
    if (impact == null || isNaN(impact)) continue;
    const role = roleOf(work, authorId);
    const inTop = impact >= cutoff;
    if (role === 'led') {
      counts.ledPapers++;
      if (inTop) counts.ledTop++;
    } else if (role === 'first_not_led') {
      counts.firstPapers++;
      if (inTop) counts.firstTop++;
    } else {
      counts.middlePapers++;
      if (inTop) counts.middleTop++;
    }
  }
  return counts;
}

function share(top: number, papers: number): number | null {
  return papers > 0 ? top / papers : null;
}

export function pooledRates(people: PersonRoles[]): RoleRate[] {
  const specs: Array<{ key: 'led' | 'first' | 'middle'; papers: (p: PersonRoles) => number; top: (p: PersonRoles) => number }> = [
    { key: 'led', papers: (p) => p.ledPapers, top: (p) => p.ledTop },
    { key: 'first', papers: (p) => p.firstPapers, top: (p) => p.firstTop },
    { key: 'middle', papers: (p) => p.middlePapers, top: (p) => p.middleTop },
  ];
  const labels = [ROLE_LABELS[ROLE_LED], ROLE_LABELS[ROLE_FIRST], ROLE_LABELS[ROLE_MIDDLE]];
  return specs.map((s, i) => {
    const papers = people.reduce((n, p) => n + s.papers(p), 0);
    const top = people.reduce((n, p) => n + s.top(p), 0);
    return {
      role: labels[i],
      people: people.filter((p) => s.papers(p) > 0).length,
      papers,
      rate: papers > 0 ? top / papers : null,
    };
  });
}

export function ledVsMiddleGap(
  people: PersonRoles[],
  iterations = 2000,
  seed = 0,
): Gap {
  const usable = people.filter((p) => p.ledPapers > 0 || p.middlePapers > 0);
  if (usable.length === 0) {
    return { ledRate: null, middleRate: null, gap: null, lo: null, hi: null, people: 0 };
  }

  const ratesOf = (sample: PersonRoles[]): [number | null, number | null] => {
    const ledN = sample.reduce((n, p) => n + p.ledPapers, 0);
    const midN = sample.reduce((n, p) => n + p.middlePapers, 0);
    const led = ledN ? sample.reduce((n, p) => n + p.ledTop, 0) / ledN : null;
    const mid = midN ? sample.reduce((n, p) => n + p.middleTop, 0) / midN : null;
    return [led, mid];
  };

  const [ledRate, middleRate] = ratesOf(usable);
  if (ledRate == null || middleRate == null) {
    return { ledRate, middleRate, gap: null, lo: null, hi: null, people: usable.length };
  }

  const rng = mulberry32(seed);
  const n = usable.length;
  const gaps: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const draw: PersonRoles[] = [];
    for (let j = 0; j < n; j++) draw.push(usable[Math.floor(rng() * n)]);
    const [led, mid] = ratesOf(draw);
    if (led != null && mid != null) gaps.push(mid - led);
  }
  gaps.sort((a, b) => a - b);
  const lo = gaps.length ? gaps[Math.floor((gaps.length - 1) * 0.025)] : null;
  const hi = gaps.length ? gaps[Math.ceil((gaps.length - 1) * 0.975)] : null;

  return {
    ledRate,
    middleRate,
    gap: middleRate - ledRate,
    lo,
    hi,
    people: n,
  };
}

export function pairedWithinPerson(
  people: PersonRoles[],
  minPapers = MIN_PAPERS_PER_ROLE,
): PairedTest {
  const paired = people.filter(
    (p) => p.ledPapers >= minPapers && p.middlePapers >= minPapers,
  );
  if (paired.length === 0) {
    return {
      people: 0,
      medianLedShare: null,
      medianMiddleShare: null,
      higherOnMiddle: 0,
      higherOnLed: 0,
      ties: 0,
      pValue: null,
    };
  }

  const ledShares = paired.map((p) => share(p.ledTop, p.ledPapers) ?? 0);
  const middleShares = paired.map((p) => share(p.middleTop, p.middlePapers) ?? 0);
  let higherOnMiddle = 0;
  let higherOnLed = 0;
  for (let i = 0; i < paired.length; i++) {
    if (middleShares[i] > ledShares[i]) higherOnMiddle++;
    else if (ledShares[i] > middleShares[i]) higherOnLed++;
  }
  const ties = paired.length - higherOnMiddle - higherOnLed;

  return {
    people: paired.length,
    medianLedShare: median(ledShares),
    medianMiddleShare: median(middleShares),
    higherOnMiddle,
    higherOnLed,
    ties,
    pValue: signTest(higherOnMiddle, higherOnLed),
  };
}

export function venueLedShare(
  members: CohortMember[],
  articleTypes: string[],
  limit = 15,
): Array<{ venue: string; cohort_papers: number; led_share: number }> {
  const venueMap = new Map<string, { papers: number; led: number }>();
  for (const member of members) {
    for (const work of member.works) {
      if (!isJournalArticle(work) || !articleTypes.includes(work.type)) continue;
      const source = work.primary_location?.source;
      if (!source) continue;
      const name = source.display_name;
      const existing = venueMap.get(name) ?? { papers: 0, led: 0 };
      existing.papers++;
      if (isLed(work, member.authorId)) existing.led++;
      venueMap.set(name, existing);
    }
  }
  return [...venueMap.entries()]
    .map(([venue, v]) => ({
      venue,
      cohort_papers: v.papers,
      led_share: v.papers > 0 ? v.led / v.papers : 0,
    }))
    .sort((a, b) => b.cohort_papers - a.cohort_papers)
    .slice(0, limit);
}

export function chaperoneFromMembers(
  members: CohortMember[],
  cutoff: number | null,
  articleTypes: string[],
): {
  people: PersonRoles[];
  pooled: RoleRate[];
  gap: Gap;
  paired: PairedTest;
  venues: Array<{ venue: string; cohort_papers: number; led_share: number }>;
} {
  const people = members.map((m) =>
    personRoles(m.works, m.authorId, articleTypes, cutoff, m.startYear),
  );
  if (cutoff == null) {
    return {
      people,
      pooled: [],
      gap: { ledRate: null, middleRate: null, gap: null, lo: null, hi: null, people: 0 },
      paired: {
        people: 0,
        medianLedShare: null,
        medianMiddleShare: null,
        higherOnMiddle: 0,
        higherOnLed: 0,
        ties: 0,
        pValue: null,
      },
      venues: [],
    };
  }
  return {
    people,
    pooled: pooledRates(people),
    gap: ledVsMiddleGap(people),
    paired: pairedWithinPerson(people),
    venues: venueLedShare(members, articleTypes),
  };
}
