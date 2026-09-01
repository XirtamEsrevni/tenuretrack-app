import type { OpenAlexWork } from './openalex';
import { sameId, sameRor, shortRor } from './ids';
import { median as medianOf } from './stats';

const PREPRINT_SERVERS = new Set([
  'arxiv',
  'biorxiv',
  'chemrxiv',
  'medrxiv',
  'psyarxiv',
  'ssrn',
  'osf',
  'preprints.org',
]);

export function isJournalArticle(work: OpenAlexWork): boolean {
  if (work.type !== 'article') return false;
  const source = work.primary_location?.source;
  if (!source) return false;
  const name = source.display_name.toLowerCase();
  for (const preprint of PREPRINT_SERVERS) {
    if (name.includes(preprint)) return false;
  }
  return true;
}

export function isLed(work: OpenAlexWork, authorId: string): boolean {
  const authorship = work.authorships.find((a) => sameId(a.author.id, authorId));
  if (!authorship) return false;
  return authorship.author_position === 'last' || authorship.is_corresponding === true;
}

export function roleOf(work: OpenAlexWork, authorId: string): 'led' | 'first_not_led' | 'middle' {
  const authorship = work.authorships.find((a) => sameId(a.author.id, authorId));
  if (!authorship) return 'middle';
  if (authorship.author_position === 'last' || authorship.is_corresponding === true) return 'led';
  if (authorship.author_position === 'first') return 'first_not_led';
  return 'middle';
}

export function institutionsOn(work: OpenAlexWork, authorId: string): string[] {
  const authorship = work.authorships.find((a) => sameId(a.author.id, authorId));
  if (!authorship) return [];
  return authorship.institutions
    .map((i) => i.ror || i.id)
    .filter(Boolean)
    .map((v) => (v.startsWith('http') && v.includes('ror.org') ? shortRor(v) : v));
}

export function hasBylineAt(work: OpenAlexWork, authorId: string, ror: string): boolean {
  if (!ror) return false;
  const want = shortRor(ror);
  const authorship = work.authorships.find((a) => sameId(a.author.id, authorId));
  if (!authorship) return false;
  return authorship.institutions.some((i) => {
    if (i.ror && sameRor(i.ror, want)) return true;
    if (i.id && sameRor(i.id, want)) return true;
    return false;
  });
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
  authorId: string,
  startYear: number,
  throughYear: number,
  articleTypes: string[],
  topQuartileCutoff: number | null,
  anchorInstitution?: string,
): WorkMetrics {
  const last = startYear + throughYear - 1;
  const windowWorks = works.filter((w) => {
    if (!isJournalArticle(w)) return false;
    if (!articleTypes.includes(w.type)) return false;
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
    .filter(isJournalArticle)
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
