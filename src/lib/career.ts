import type { OpenAlexWork, OpenAlexAuthor } from './openalex';
import { isJournalArticle, isLed, institutionsOn } from './metrics';

const MIN_LED_AT_INSTITUTION = 2;
const PRINCIPAL_LED_SHARE = 0.2;

export interface StartEstimate {
  authorId: string;
  year: number | null;
  confidence: 'high' | 'low' | 'none';
  institutionRor: string;
  ledPapers: number;
}

export function estimateStart(
  works: OpenAlexWork[],
  authorId: string,
  articleTypes: string[],
): StartEstimate {
  const journalWorks = works.filter((w) =>
    isJournalArticle(w) && articleTypes.includes(w.type),
  );

  const ledWorks = journalWorks.filter((w) => isLed(w, authorId));

  const instLedCounts = new Map<string, { count: number; firstYear: number }>();
  for (const work of ledWorks) {
    const insts = institutionsOn(work, authorId);
    for (const inst of insts) {
      const existing = instLedCounts.get(inst) ?? { count: 0, firstYear: 9999 };
      existing.count++;
      existing.firstYear = Math.min(existing.firstYear, work.publication_year);
      instLedCounts.set(inst, existing);
    }
  }

  if (instLedCounts.size === 0) {
    return { authorId, year: null, confidence: 'none', institutionRor: '', ledPapers: 0 };
  }

  const maxLedAtPost = Math.max(...[...instLedCounts.values()].map((v) => v.count));

  const qualifyingInsts = [...instLedCounts.entries()]
    .filter(([, v]) => v.count >= MIN_LED_AT_INSTITUTION && v.count >= maxLedAtPost * PRINCIPAL_LED_SHARE)
    .sort((a, b) => a[1].firstYear - b[1].firstYear);

  if (qualifyingInsts.length === 0) {
    const firstLed = ledWorks.sort((a, b) => a.publication_year - b.publication_year)[0];
    return {
      authorId,
      year: firstLed ? firstLed.publication_year - 1 : null,
      confidence: 'low',
      institutionRor: '',
      ledPapers: ledWorks.length,
    };
  }

  const earliest = qualifyingInsts[0];
  const hasEarlierNonPost = [...instLedCounts.entries()].some(
    ([inst, v]) =>
      inst !== earliest[0] &&
      v.firstYear < earliest[1].firstYear &&
      v.count < MIN_LED_AT_INSTITUTION,
  );

  if (!hasEarlierNonPost && qualifyingInsts.length === 1) {
    const firstLed = ledWorks.sort((a, b) => a.publication_year - b.publication_year)[0];
    return {
      authorId,
      year: firstLed ? firstLed.publication_year - 1 : null,
      confidence: 'low',
      institutionRor: earliest[0],
      ledPapers: ledWorks.length,
    };
  }

  return {
    authorId,
    year: earliest[1].firstYear,
    confidence: 'high',
    institutionRor: earliest[0],
    ledPapers: earliest[1].count,
  };
}

export function plausibleYears(
  works: OpenAlexWork[],
  windowStart: number,
  windowEnd: number,
): boolean {
  const years = works.map((w) => w.publication_year);
  if (years.length === 0) return false;
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return maxYear >= windowStart && minYear <= windowEnd;
}

export function coreTopicShare(
  author: OpenAlexAuthor,
  topicIds: string[],
): number {
  let total = 0;
  let topicWorkCount = 0;
  for (const topic of author.topics) {
    if (topicIds.includes(topic.id.replace('https://openalex.org/', ''))) {
      topicWorkCount += topic.count;
    }
    total += topic.count;
  }
  if (total === 0) return 0;
  return topicWorkCount / total;
}
