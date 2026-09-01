import type { OpenAlexAuthor, OpenAlexInstitution, OpenAlexWork } from './openalex';
import type { Topic } from '../types';
import { hasBylineAt, isJournalArticle } from './metrics';
import { looksLikeRor, shortId, shortRor } from './ids';

export const HORIZON_YEARS = 6;
export const START_WINDOW_YEARS = 10;
export const MAX_PROPOSED_TOPICS = 3;
export const MIN_TOPIC_PAPERS = 3;
export const MIN_ANCHORED_WORKS = 5;
export const MAX_CANDIDATES = 200;

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function asInstitution(value: unknown): OpenAlexInstitution | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.institution && typeof record.institution === 'object') {
    return asInstitution(record.institution);
  }
  if (typeof record.display_name !== 'string') return null;
  return {
    id: typeof record.id === 'string' ? record.id : '',
    display_name: record.display_name,
    type: typeof record.type === 'string' ? record.type : null,
    ror: typeof record.ror === 'string' ? record.ror : null,
  };
}

function collectInstitutions(author: OpenAlexAuthor): OpenAlexInstitution[] {
  const fromAffiliations = (author.affiliations ?? [])
    .map((a) => asInstitution(a.institution))
    .filter((i): i is OpenAlexInstitution => Boolean(i));
  const fromLastKnown = (author.last_known_institutions ?? [])
    .map((item) => asInstitution(item))
    .filter((i): i is OpenAlexInstitution => Boolean(i));
  return [...fromAffiliations, ...fromLastKnown];
}

export function resolveInstitution(
  author: OpenAlexAuthor,
  query: string,
): { ror: string; name: string } | null {
  const raw = query.trim();
  if (!raw) return null;

  const all = collectInstitutions(author);

  if (looksLikeRor(raw) || /ror\.org/i.test(raw)) {
    const want = shortRor(raw);
    const hit = all.find((i) => i.ror && shortRor(i.ror) === want);
    return { ror: want, name: hit?.display_name ?? raw };
  }

  const nq = normalizeName(raw);
  const scored = all
    .map((i) => {
      const n = normalizeName(i.display_name);
      let score = 0;
      if (n === nq) score = 3;
      else if (n.includes(nq) || nq.includes(n)) score = 2;
      else {
        const overlap = n.split(' ').filter((w) => w.length > 3 && nq.includes(w)).length;
        if (overlap >= 2) score = 1;
      }
      if (i.type === 'education') score += 0.1;
      return { i, score };
    })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score);

  if (!scored[0]) return null;
  const ror = scored[0].i.ror ? shortRor(scored[0].i.ror) : '';
  return { ror, name: scored[0].i.display_name };
}

export function firstBylineYear(
  works: OpenAlexWork[],
  authorId: string,
  ror: string,
): number | null {
  const years = works
    .filter((w) => isJournalArticle(w) && hasBylineAt(w, authorId, ror))
    .map((w) => w.publication_year);
  if (years.length === 0) return null;
  return Math.min(...years);
}

export function proposeTopics(
  works: OpenAlexWork[],
  authorId: string,
  ror: string,
  startYear: number,
): { topics: Topic[]; basis: 'anchored' | 'since_start' | 'all_years' } {
  const articles = works.filter(isJournalArticle);
  const sinceStart = articles.filter((w) => w.publication_year >= startYear);
  const anchored = ror
    ? sinceStart.filter((w) => hasBylineAt(w, authorId, ror))
    : sinceStart;

  let basis: 'anchored' | 'since_start' | 'all_years' = 'anchored';
  let pool = anchored;
  if (anchored.length < MIN_ANCHORED_WORKS) {
    if (sinceStart.length > 0) {
      pool = sinceStart;
      basis = 'since_start';
    } else {
      pool = articles;
      basis = 'all_years';
    }
  }

  const topicMap = new Map<string, Topic>();
  for (const work of pool) {
    const pt = work.primary_topic;
    if (!pt) continue;
    const id = shortId(pt.id);
    const existing = topicMap.get(id);
    const source = work.primary_location?.source?.display_name;
    if (existing) {
      existing.paperCount++;
      if (source && !existing.topVenues.includes(source)) existing.topVenues.push(source);
    } else {
      topicMap.set(id, {
        id,
        name: pt.display_name,
        paperCount: 1,
        topVenues: source ? [source] : [],
      });
    }
  }

  const ranked = [...topicMap.values()].sort((a, b) => b.paperCount - a.paperCount);
  let proposed = ranked.filter((t) => t.paperCount >= MIN_TOPIC_PAPERS).slice(0, MAX_PROPOSED_TOPICS);
  if (proposed.length < 2) {
    proposed = ranked.filter((t) => t.paperCount >= 2).slice(0, MAX_PROPOSED_TOPICS);
  }
  if (proposed.length === 0) {
    proposed = ranked.slice(0, MAX_PROPOSED_TOPICS);
  }
  return { topics: proposed, basis };
}

/**
 * Cohort start-year window, anchored on the subject and capped so every
 * member has finished `horizonYears` of the clock.
 */
export function resolvedStartWindow(
  startYear: number,
  horizonYears: number,
  nowYear: number,
): [number, number] {
  const lo = Math.max(1950, startYear - START_WINDOW_YEARS);
  const hi = Math.min(startYear + START_WINDOW_YEARS, nowYear - horizonYears);
  return [lo, Math.max(lo, hi)];
}

export function comparisonHorizon(clockYear: number, horizonYears: number): number {
  return Math.max(1, Math.min(clockYear, horizonYears));
}

export function clockYear(startYear: number, clockExtension: number, nowYear: number): number {
  const calendar = nowYear - startYear + 1;
  return Math.max(1, calendar - clockExtension);
}
