import type { OpenAlexAuthor, OpenAlexWork } from './openalex';

export const ME = 'https://openalex.org/A1000001';
export const PHD = '01phd0000';
export const JOB = '02job0000';
export const SECOND_JOB = '03two0000';
export const STRAY = '04med00000';

export function paper(opts: {
  year: number;
  position?: 'first' | 'middle' | 'last';
  corresponding?: boolean;
  ror?: string;
  source?: string;
  sourceName?: string;
  citations?: number;
  kind?: string;
  who?: string;
  impact?: number | null;
  id?: string;
  topic?: { id: string; name: string };
}): OpenAlexWork {
  const who = opts.who ?? ME;
  const source = opts.source ?? 'S100';
  const position = opts.position ?? 'middle';
  return {
    id: `https://openalex.org/${opts.id ?? `W${opts.year}${position}${source}${opts.citations ?? 0}`}`,
    doi: `https://doi.org/10.1/${opts.year}-${position}-${source}`,
    title: `Paper ${opts.year}`,
    publication_year: opts.year,
    type: opts.kind ?? 'article',
    cited_by_count: opts.citations ?? 0,
    primary_location: {
      source: {
        id: `https://openalex.org/${source}`,
        display_name: opts.sourceName ?? `Journal ${source}`,
        issn_l: null,
        type: 'journal',
        is_core: true,
        summary_stats:
          opts.impact == null ? undefined : { '2yr_mean_citedness': opts.impact },
      },
    },
    authorships: [
      {
        author: { id: who, display_name: 'Alex Roe' },
        institutions: opts.ror
          ? [{
              id: `https://openalex.org/I${opts.ror}`,
              display_name: opts.ror,
              ror: `https://ror.org/${opts.ror}`,
              type: 'education',
            }]
          : [],
        author_position: position,
        is_corresponding: opts.corresponding ?? false,
      },
    ],
    primary_topic: opts.topic
      ? { id: opts.topic.id, display_name: opts.topic.name }
      : null,
  };
}

export function makeAuthor(opts: {
  id?: string;
  topics?: Array<{ id: string; count: number }>;
  years?: number[];
  name?: string;
  ror?: string;
}): OpenAlexAuthor {
  const id = opts.id ?? ME;
  return {
    id,
    display_name: opts.name ?? 'Alex Roe',
    orcid: null,
    affiliations: [
      {
        institution: {
          id: `https://openalex.org/I${opts.ror ?? JOB}`,
          display_name: 'Some University',
          type: 'education',
          ror: `https://ror.org/${opts.ror ?? JOB}`,
        },
        years: opts.years ?? [2010, 2016],
      },
    ],
    works_count: 30,
    topics: (opts.topics ?? [{ id: 'https://openalex.org/T10001', count: 30 }]).map((t) => ({
      id: t.id,
      display_name: t.id,
      count: t.count,
    })),
    last_known_institutions: [],
  };
}
