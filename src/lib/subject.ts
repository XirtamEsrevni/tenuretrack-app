import type { OpenAlexAuthor, OpenAlexInstitution, OpenAlexWork } from './openalex';
import type { Topic } from '../types';
import { hasBylineAt, isJournalArticle, type AuthorIds } from './metrics';
import { looksLikeRor, shortId, shortOrcid, shortRor } from './ids';

export const HORIZON_YEARS = 6;
export const START_WINDOW_YEARS = 10;
export const MAX_PROPOSED_TOPICS = 3;
export const MIN_TOPIC_PAPERS = 3;
export const MIN_ANCHORED_WORKS = 5;
export const MAX_CANDIDATES = 200;
export const SPLIT_MAX_WORKS = 10;
export const SPLIT_MAX_SHARE = 0.5;

const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md']);

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
    works_count: typeof record.works_count === 'number' ? record.works_count : undefined,
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

/** Pick one OpenAlex institution the way `tenuretrack init` does: education first, then works_count. */
export function rankInstitutionHits(
  results: OpenAlexInstitution[],
): { ror: string; name: string } | null {
  const usable = results.filter((r) => r.ror);
  if (!usable.length) return null;
  usable.sort((a, b) => {
    const ae = a.type === 'education' ? 0 : 1;
    const be = b.type === 'education' ? 0 : 1;
    if (ae !== be) return ae - be;
    return (b.works_count ?? 0) - (a.works_count ?? 0);
  });
  const top = usable[0];
  return { ror: shortRor(top.ror!), name: top.display_name };
}

function stripAccents(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function nameKey(name: string): [string, string] | null {
  const raw = stripAccents(name).toLowerCase();
  const inverted = raw.includes(',');
  const cleaned = raw.replace(/[^\w\s]/g, ' ');
  const parts = cleaned.split(/\s+/).filter((p) => p && !NAME_SUFFIXES.has(p));
  if (parts.length < 2) return null;
  if (inverted) return [parts[0], parts[1]];
  return [parts[parts.length - 1], parts[0]];
}

function keysAgree(left: [string, string], right: [string, string]): boolean {
  if (left[0] !== right[0]) return false;
  const first = left[1];
  const other = right[1];
  if (first.length === 1 || other.length === 1) return first[0] === other[0];
  return first === other;
}

function allNames(record: OpenAlexAuthor): string[] {
  const names = [record.display_name ?? ''];
  for (const alt of record.display_name_alternatives ?? []) {
    if (alt) names.push(alt);
  }
  return names.filter((n) => n.trim());
}

function namesMatch(primary: OpenAlexAuthor, candidate: OpenAlexAuthor): boolean {
  const primaryKeys = allNames(primary).map(nameKey).filter((k): k is [string, string] => k != null);
  const candidateKeys = allNames(candidate).map(nameKey).filter((k): k is [string, string] => k != null);
  return primaryKeys.some((left) => candidateKeys.some((right) => keysAgree(left, right)));
}

function affiliatedWith(record: OpenAlexAuthor, ror: string): boolean {
  const want = shortRor(ror);
  for (const affiliation of record.affiliations ?? []) {
    const value = affiliation.institution?.ror ?? '';
    if (value && shortRor(value) === want) return true;
  }
  return false;
}

function topicIds(record: OpenAlexAuthor): Set<string> {
  const out = new Set<string>();
  for (const topic of record.topics ?? []) {
    const id = shortId(topic.id).toUpperCase();
    if (id) out.add(id);
  }
  return out;
}

export function isSplitProfile(
  primary: OpenAlexAuthor,
  candidate: OpenAlexAuthor,
  ror: string,
): boolean {
  const primaryId = shortId(primary.id).toUpperCase();
  const candidateId = shortId(candidate.id).toUpperCase();
  if (!candidateId || candidateId === primaryId) return false;

  const primaryOrcid = shortOrcid(primary.orcid ?? '');
  const candidateOrcid = shortOrcid(candidate.orcid ?? '');
  if (candidateOrcid && candidateOrcid !== primaryOrcid) return false;

  if (!namesMatch(primary, candidate)) return false;

  const primaryWorks = primary.works_count || 0;
  const candidateWorks = candidate.works_count || 0;
  if (candidateWorks <= 0 || candidateWorks > SPLIT_MAX_WORKS) return false;
  if (primaryWorks && candidateWorks > SPLIT_MAX_SHARE * primaryWorks) return false;

  if (!affiliatedWith(candidate, ror)) return false;

  const candidateTopics = topicIds(candidate);
  if (candidateTopics.size === 0) return false;
  for (const id of topicIds(primary)) {
    if (candidateTopics.has(id)) return true;
  }
  return false;
}

export function firstBylineYear(
  works: OpenAlexWork[],
  authorId: AuthorIds,
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
  authorId: AuthorIds,
  ror: string,
  startYear: number,
): { topics: Topic[]; basis: 'anchored' | 'since_start' | 'all_years' } {
  const articles = works.filter((w) => isJournalArticle(w));
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
