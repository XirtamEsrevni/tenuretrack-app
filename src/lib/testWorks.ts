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
  sourceType?: string | null;
  citations?: number;
  kind?: string;
  who?: string;
  extraWho?: Array<{ id: string; position?: 'first' | 'middle' | 'last'; corresponding?: boolean; ror?: string }>;
  impact?: number | null;
  id?: string;
  doi?: string | null;
  title?: string;
  topic?: { id: string; name: string };
}): OpenAlexWork {
  const who = opts.who ?? ME;
  const source = opts.source ?? 'S100';
  const position = opts.position ?? 'middle';
  const sourceType = opts.sourceType ?? (opts.kind === 'preprint' ? 'repository' : 'journal');
  const authorships: OpenAlexWork['authorships'] = [
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
  ];
  for (const extra of opts.extraWho ?? []) {
    authorships.push({
      author: { id: extra.id, display_name: 'Alex Roe' },
      institutions: extra.ror
        ? [{
            id: `https://openalex.org/I${extra.ror}`,
            display_name: extra.ror,
            ror: `https://ror.org/${extra.ror}`,
            type: 'education',
          }]
        : [],
      author_position: extra.position ?? 'middle',
      is_corresponding: extra.corresponding ?? false,
    });
  }
  return {
    id: `https://openalex.org/${opts.id ?? `W${opts.year}${position}${source}${opts.citations ?? 0}`}`,
    doi: opts.doi === undefined ? `https://doi.org/10.1/${opts.year}-${position}-${source}` : opts.doi,
    title: opts.title ?? `Paper ${opts.year}`,
    publication_year: opts.year,
    type: opts.kind ?? 'article',
    cited_by_count: opts.citations ?? 0,
    primary_location: {
      source: source
        ? {
            id: `https://openalex.org/${source}`,
            display_name: opts.sourceName ?? `Journal ${source}`,
            issn_l: null,
            type: sourceType,
            is_core: true,
            summary_stats:
              opts.impact == null ? undefined : { '2yr_mean_citedness': opts.impact },
          }
        : null,
    },
    authorships,
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
  rors?: string[];
  orcid?: string | null;
  worksCount?: number;
  alternatives?: string[];
}): OpenAlexAuthor {
  const id = opts.id ?? ME;
  const rors = opts.rors ?? [opts.ror ?? JOB];
  return {
    id,
    display_name: opts.name ?? 'Alex Roe',
    display_name_alternatives: opts.alternatives ?? [],
    orcid: opts.orcid === undefined ? null : opts.orcid,
    affiliations: rors.map((ror) => ({
      institution: {
        id: `https://openalex.org/I${ror}`,
        display_name: 'Some University',
        type: 'education',
        ror: ror.startsWith('http') ? ror : `https://ror.org/${ror}`,
      },
      years: opts.years ?? [2010, 2016],
    })),
    works_count: opts.worksCount ?? 30,
    topics: (opts.topics ?? [{ id: 'https://openalex.org/T10001', count: 30 }]).map((t) => ({
      id: t.id,
      display_name: t.id,
      count: t.count,
    })),
    last_known_institutions: [],
  };
}
