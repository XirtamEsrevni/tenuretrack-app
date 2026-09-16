import type { OpenAlexWork } from './openalex';
import { sameId, sameRor, shortRor } from './ids';
import { median as medianOf } from './stats';

export const PREPRINT_SOURCE_TYPES = new Set(['repository']);

export type AuthorIds = string | string[];

function wantedIds(authorId: AuthorIds): string[] {
  return (Array.isArray(authorId) ? authorId : [authorId]).filter(Boolean);
}

export function bylinesOf(work: OpenAlexWork, authorId: AuthorIds): OpenAlexWork['authorships'] {
  const wanted = wantedIds(authorId);
  return (work.authorships ?? []).filter((a) => wanted.some((id) => sameId(a.author.id, id)));
}

export function isJournalArticle(work: OpenAlexWork, articleTypes: string[] = ['article']): boolean {
  if (!articleTypes.includes(work.type)) return false;
  const sourceType = work.primary_location?.source?.type ?? '';
  if (PREPRINT_SOURCE_TYPES.has(sourceType)) return false;
  return true;
}

export function isLed(work: OpenAlexWork, authorId: AuthorIds): boolean {
  return bylinesOf(work, authorId).some(
    (a) => a.author_position === 'last' || a.is_corresponding === true,
  );
}

export function roleOf(work: OpenAlexWork, authorId: AuthorIds): 'led' | 'first_not_led' | 'middle' {
  const found = bylinesOf(work, authorId);
  if (found.length === 0) return 'middle';
  if (found.some((b) => b.author_position === 'last' || b.is_corresponding === true)) return 'led';
  if (found.some((b) => b.author_position === 'first')) return 'first_not_led';
  return 'middle';
}

export function institutionsOn(work: OpenAlexWork, authorId: AuthorIds): string[] {
  const out: string[] = [];
  for (const authorship of bylinesOf(work, authorId)) {
    for (const inst of authorship.institutions ?? []) {
      if (!inst.ror) continue;
      const short = shortRor(inst.ror);
      if (short && !out.includes(short)) out.push(short);
    }
  }
  return out;
}

export function hasBylineAt(work: OpenAlexWork, authorId: AuthorIds, ror: string): boolean {
  if (!ror) return false;
  const want = shortRor(ror);
  for (const authorship of bylinesOf(work, authorId)) {
    for (const inst of authorship.institutions ?? []) {
      if (inst.ror && sameRor(inst.ror, want)) return true;
      if (inst.id && sameRor(inst.id, want)) return true;
    }
  }
  return false;
}

export function normalizeDoi(value: string | null | undefined): string {
  const text = (value ?? '').trim().toLowerCase();
  if (!text) return '';
  const parts = text.split('doi.org/');
  return parts[parts.length - 1];
}

export function normalizeTitle(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function workKey(work: OpenAlexWork): string {
  const doi = normalizeDoi(work.doi);
  if (doi) return doi;
  return `${normalizeTitle(work.title ?? '')}|${work.publication_year ?? 0}`;
}

export function unionWorks(groups: OpenAlexWork[][]): OpenAlexWork[] {
  const unioned = new Map<string, OpenAlexWork>();
  for (const works of groups) {
    for (const work of works) {
      if (!work.publication_year) continue;
      const key = workKey(work);
      if (!unioned.has(key)) unioned.set(key, work);
    }
  }
  return [...unioned.values()].sort(
    (a, b) => b.publication_year - a.publication_year || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

export interface WorkMetrics {
  pubs: number;
  led: number;
  leadShare: number | null;
  citations: number;
  hIndex: number;
  venueImpactMedian: number | null;
  topQuartileShare: number | null;
}

export function computeMetrics(
  works: OpenAlexWork[],
  authorId: AuthorIds,
  startYear: number,
  throughYear: number,
  articleTypes: string[],
  topQuartileCutoff: number | null,
  anchorInstitution?: string,
): WorkMetrics {
  const last = startYear + throughYear - 1;
  const windowWorks = works.filter((w) => {
    if (!isJournalArticle(w, articleTypes)) return false;
    if (w.publication_year < startYear || w.publication_year > last) return false;
    if (anchorInstitution) {
      if (!hasBylineAt(w, authorId, anchorInstitution)) return false;
    }
    return true;
  });

  const pubs = windowWorks.length;
  const ledWorks = windowWorks.filter((w) => isLed(w, authorId));
  const led = ledWorks.length;
  const leadShare = pubs > 0 ? led / pubs : null;
  const citations = windowWorks.reduce((sum, w) => sum + w.cited_by_count, 0);
  const citationCounts = windowWorks.map((w) => w.cited_by_count).sort((a, b) => b - a);
  const hIndex = computeHIndex(citationCounts);

  const impacts = windowWorks
    .map((w) => w.primary_location?.source?.summary_stats?.['2yr_mean_citedness'])
    .filter((v): v is number => v != null && !isNaN(v));

  const venueImpactMedian = impacts.length > 0 ? medianOf(impacts) : null;

  let topQuartileShare: number | null = null;
  if (topQuartileCutoff != null && impacts.length > 0) {
    const inTopQ = impacts.filter((v) => v >= topQuartileCutoff).length;
    topQuartileShare = inTopQ / impacts.length;
  }

  return { pubs, led, leadShare, citations, hIndex, venueImpactMedian, topQuartileShare };
}

function computeHIndex(sortedCitations: number[]): number {
  let h = 0;
  for (let i = 0; i < sortedCitations.length; i++) {
    if (sortedCitations[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

export function computeTopQuartileCutoff(allWorks: OpenAlexWork[]): number | null {
  const impacts = allWorks
    .filter((w) => isJournalArticle(w))
    .map((w) => w.primary_location?.source?.summary_stats?.['2yr_mean_citedness'])
    .filter((v): v is number => v != null && !isNaN(v))
    .sort((a, b) => a - b);
  if (impacts.length < 4) return null;
  const pos = (impacts.length - 1) * 0.75;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return impacts[lo];
  return impacts[lo] + (impacts[hi] - impacts[lo]) * (pos - lo);
}
