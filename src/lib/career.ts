import type { OpenAlexWork, OpenAlexAuthor } from './openalex';
import { isJournalArticle, roleOf, institutionsOn } from './metrics';
import { shortId } from './ids';

export const MIN_LED_AT_INSTITUTION = 2;
export const PRINCIPAL_LED_SHARE = 0.2;

export interface StartEstimate {
  authorId: string;
  year: number | null;
  confidence: 'high' | 'low' | 'none';
  institutionRor: string;
  ledPapers: number;
  note?: string;
}

export function estimateStart(
  works: OpenAlexWork[],
  authorId: string,
  articleTypes: string[],
): StartEstimate {
  const journalWorks = works.filter(
    (w) => isJournalArticle(w) && articleTypes.includes(w.type) && w.publication_year,
  );

  if (journalWorks.length === 0) {
    return {
      authorId,
      year: null,
      confidence: 'none',
      institutionRor: '',
      ledPapers: 0,
      note: 'no journal articles on record',
    };
  }

  const firstSeen = new Map<string, number>();
  const ledYears = new Map<string, number[]>();
  const ledAnywhere: number[] = [];

  for (const work of journalWorks) {
    const role = roleOf(work, authorId);
    for (const ror of institutionsOn(work, authorId)) {
      const seen = firstSeen.get(ror);
      if (seen == null || work.publication_year < seen) {
        firstSeen.set(ror, work.publication_year);
      }
      if (role === 'led') {
        const years = ledYears.get(ror) ?? [];
        years.push(work.publication_year);
        ledYears.set(ror, years);
      }
    }
    if (role === 'led') ledAnywhere.push(work.publication_year);
  }

  const principal = Math.max(0, ...[...ledYears.values()].map((y) => y.length));
  const floor = Math.max(MIN_LED_AT_INSTITUTION, PRINCIPAL_LED_SHARE * principal);
  const posts = [...ledYears.entries()].filter(([, years]) => years.length >= floor);

  const qualifying = posts
    .map(([ror, years]) => ({
      year: firstSeen.get(ror) ?? Infinity,
      ror,
      count: years.length,
    }))
    .sort((a, b) => a.year - b.year || a.ror.localeCompare(b.ror));

  for (const post of qualifying) {
    const trainee = [...firstSeen.entries()].some(
      ([other, seen]) => other !== post.ror && seen < post.year && !posts.some(([r]) => r === other),
    );
    if (trainee) {
      return {
        authorId,
        year: post.year,
        confidence: 'high',
        institutionRor: post.ror,
        ledPapers: post.count,
      };
    }
  }

  if (qualifying.length > 0) {
    const first = qualifying[0];
    return {
      authorId,
      year: first.year,
      confidence: 'low',
      institutionRor: first.ror,
      ledPapers: first.count,
      note:
        'no earlier institution that was not itself an independent post, so the trainee years cannot be told apart from them',
    };
  }

  if (ledAnywhere.length > 0) {
    return {
      authorId,
      year: Math.min(...ledAnywhere) - 1,
      confidence: 'low',
      institutionRor: '',
      ledPapers: ledAnywhere.length,
      note: 'no institution holds enough of their led papers to look like a post of their own',
    };
  }

  return {
    authorId,
    year: null,
    confidence: 'none',
    institutionRor: '',
    ledPapers: 0,
    note: 'no led papers, so no independent post to date',
  };
}

/** Cheap pre-filter from affiliation years already on the author record. */
export function plausibleYears(
  author: OpenAlexAuthor,
  windowStart: number,
  windowEnd: number,
): boolean {
  const years = (author.affiliations ?? []).flatMap((a) => a.years ?? []);
  if (years.length === 0) return false;
  return Math.min(...years) <= windowEnd && Math.max(...years) >= windowStart;
}

export function coreTopicShare(author: OpenAlexAuthor, topicIds: string[]): number {
  const wanted = new Set(topicIds.map((id) => shortId(id).toUpperCase()));
  let total = 0;
  let topicWorkCount = 0;
  for (const topic of author.topics ?? []) {
    const id = shortId(topic.id).toUpperCase();
    if (wanted.has(id)) topicWorkCount += topic.count;
    total += topic.count;
  }
  if (total === 0) return 0;
  return topicWorkCount / total;
}

export function rankAndCap(
  authors: OpenAlexAuthor[],
  topicIds: string[],
  limit: number,
): OpenAlexAuthor[] {
  if (limit <= 0 || authors.length <= limit) return authors;
  const ranked = [...authors].sort((a, b) => {
    const shareDiff = coreTopicShare(b, topicIds) - coreTopicShare(a, topicIds);
    if (shareDiff !== 0) return shareDiff;
    return shortId(a.id).toUpperCase().localeCompare(shortId(b.id).toUpperCase());
  });
  return ranked.slice(0, limit);
}

/** Core-topic share of the last person the cap let in, or null if it did not bind. */
export function capCutoffShare(
  kept: OpenAlexAuthor[],
  topicIds: string[],
  limit: number,
): number | null {
  if (limit <= 0 || kept.length < limit || kept.length === 0) return null;
  return Math.min(...kept.map((a) => coreTopicShare(a, topicIds)));
}
