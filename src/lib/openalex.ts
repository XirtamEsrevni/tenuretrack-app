import { cacheGet, cacheSet, hashKey } from './cache';
import { shortId } from './ids';

const BASE = 'https://api.openalex.org';

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  orcid: string | null;
  affiliations: Array<{
    institution: { id: string; display_name: string; type: string | null; ror: string | null };
    years: number[];
  }>;
  works_count: number;
  topics: Array<{ id: string; display_name: string; count: number; share?: number }>;
  last_known_institutions: Array<{
    institution: { id: string; display_name: string; type: string | null; ror: string | null };
  }>;
}

export interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string;
  publication_year: number;
  type: string;
  cited_by_count: number;
  primary_location: {
    source: {
      id: string;
      display_name: string;
      issn_l: string | null;
      type: string | null;
      is_core: boolean | null;
      summary_stats?: { '2yr_mean_citedness': number | null };
    } | null;
  } | null;
  authorships: Array<{
    author: { id: string; display_name: string };
    institutions: Array<{ id: string; display_name: string; ror: string | null; type: string | null }>;
    author_position: 'first' | 'middle' | 'last';
    is_corresponding: boolean | null;
  }>;
  primary_topic: { id: string; display_name: string } | null;
}

export interface OpenAlexSource {
  id: string;
  display_name: string;
  issn_l: string | null;
  type: string | null;
  is_core: boolean | null;
  summary_stats: { '2yr_mean_citedness': number | null } | null;
}

export interface OpenAlexTopic {
  id: string;
  display_name: string;
}

const MIN_REQUEST_INTERVAL_MS = 100;
let lastRequestTime = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

async function fetchJSON<T>(url: string, headers: HeadersInit, signal?: AbortSignal): Promise<T> {
  const MAX_RETRIES = 5;
  const BASE_DELAY = 1500;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await throttle();
    const res = await fetch(url, { headers, signal });
    if (res.ok) return res.json();
    if (res.status === 429) throw new QuotaExhausted('OpenAlex daily quota exhausted');
    if (res.status >= 500 && attempt < MAX_RETRIES) {
      const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    if (res.status >= 500) {
      throw new Error(
        `OpenAlex returned ${res.status} after ${MAX_RETRIES + 1} attempts. ` +
        'Please try again in a few minutes. Any supplied API key was sent with this request.'
      );
    }
    const body = await res.text();
    let summary = body;
    try {
      const parsed = JSON.parse(body);
      summary = parsed.error || parsed.message || body;
    } catch {
      if (body.length > 200) summary = body.slice(0, 200) + '...';
    }
    throw new Error(`OpenAlex ${res.status}: ${summary}`);
  }
  throw new Error('OpenAlex: max retries exceeded');
}

export class QuotaExhausted extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'QuotaExhausted';
  }
}

export class OpenAlexClient {
  private mailto: string;
  private apiKey: string;
  private onProgress?: (msg: string, detail?: string) => void;
  private signal?: AbortSignal;

  constructor(mailto: string, apiKey: string) {
    this.mailto = mailto.trim();
    this.apiKey = apiKey.trim();
  }

  setProgressHandler(fn: (msg: string, detail?: string) => void): void {
    this.onProgress = fn;
  }

  setAbortSignal(signal: AbortSignal): void {
    this.signal = signal;
  }

  private buildURL(endpoint: string, params: Record<string, string>, select?: string): string {
    const all: Record<string, string> = { ...params, mailto: this.mailto, 'per-page': '200' };
    if (select) all.select = select;
    const qs = Object.entries(all)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `${BASE}/${endpoint}?${qs}`;
  }

  private async cachedFetch<T>(cacheKey: string, url: string): Promise<T> {
    const cached = await cacheGet(cacheKey);
    if (cached) return cached as T;
    // OpenAlex account keys are bearer tokens, not URL query parameters. Keeping
    // the key in the Authorization header prevents it from leaking into caches,
    // browser history, or error messages.
    const headers: Record<string, string> = this.apiKey
      ? { Authorization: `Bearer ${this.apiKey}` }
      : {};
    const data = await fetchJSON<T>(url, headers, this.signal);
    await cacheSet(cacheKey, data);
    return data;
  }

  async getAuthorByOrcid(orcid: string): Promise<OpenAlexAuthor> {
    const params = { filter: `orcid:${orcid}` };
    const url = this.buildURL('authors', params, 'id,display_name,orcid,affiliations,works_count,topics,last_known_institutions');
    const cacheKey = hashKey(['author-orcid', orcid, this.mailto]);
    const data = await this.cachedFetch<{ results: OpenAlexAuthor[]; meta: { count: number } }>(cacheKey, url);
    if (!data.results || data.results.length === 0) {
      throw new Error(`No author found for ORCID ${orcid}`);
    }
    return data.results[0];
  }

  async getAuthorById(id: string): Promise<OpenAlexAuthor> {
    const cacheKey = hashKey(['author-id', id, this.mailto]);
    const url = this.buildURL(`authors/${id.replace('https://openalex.org/', '')}`, {});
    return this.cachedFetch<OpenAlexAuthor>(cacheKey, url);
  }

  async getAuthorsByTopic(topicId: string, countries: string[]): Promise<OpenAlexAuthor[]> {
    const all: OpenAlexAuthor[] = [];
    let cursor = '*';
    // OpenAlex filter values must use the short entity ID (for example T10001).
    // Passing its canonical URL causes the API to return a 500 response.
    const topicShort = topicId.replace('https://openalex.org/', '');
    const countryFilter = countries.length > 0
      ? `,affiliations.institution.country_code:${countries.join('|')}`
      : '';
    const filter = `topics.id:${topicShort},works_count:>10${countryFilter}`;
    while (true) {
      const params: Record<string, string> = { filter, cursor };
      const url = this.buildURL('authors', params, 'id,display_name,orcid,affiliations,works_count,topics,last_known_institutions');
      const cacheKey = hashKey(['authors-topic', topicShort, countries.join(','), cursor, this.mailto]);
      const data = await this.cachedFetch<{ results: OpenAlexAuthor[]; meta: { count: number } }>(cacheKey, url);
      all.push(...data.results);
      if (this.onProgress) {
        this.onProgress(`Fetching candidates from ${topicShort}...`, `${all.length} authors fetched`);
      }
      if (!data.results || data.results.length === 0) break;
      cursor = (data as unknown as { meta: { next_cursor?: string } }).meta?.next_cursor ?? '';
      if (!cursor) break;
    }
    return all;
  }

  async getWorksByAuthor(authorId: string): Promise<OpenAlexWork[]> {
    const all: OpenAlexWork[] = [];
    let cursor = '*';
    const authorShort = authorId.replace('https://openalex.org/', '');
    while (true) {
      const params: Record<string, string> = {
        filter: `author.id:${authorShort}`,
        cursor,
      };
      const url = this.buildURL('works', params, 'id,doi,title,publication_year,type,cited_by_count,primary_location,authorships,primary_topic');
      const cacheKey = hashKey(['works-author', authorShort, cursor, this.mailto]);
      const data = await this.cachedFetch<{ results: OpenAlexWork[]; meta: { count: number; next_cursor?: string } }>(cacheKey, url);
      all.push(...data.results);
      if (this.onProgress) {
        this.onProgress(`Fetching works for ${authorShort}...`, `${all.length} works`);
      }
      if (!data.results || data.results.length === 0) break;
      cursor = data.meta?.next_cursor ?? '';
      if (!cursor) break;
    }
    return all;
  }

  async getWorksByAuthors(authorIds: string[], batchSize = 50): Promise<Map<string, OpenAlexWork[]>> {
    const result = new Map<string, OpenAlexWork[]>();
    for (let i = 0; i < authorIds.length; i += batchSize) {
      const batch = authorIds.slice(i, i + batchSize);
      const ids = batch.map((id) => id.replace('https://openalex.org/', '')).join('|');
      let cursor = '*';
      while (true) {
        const params: Record<string, string> = {
          filter: `author.id:${ids}`,
          cursor,
        };
        const url = this.buildURL('works', params, 'id,doi,title,publication_year,type,cited_by_count,primary_location,authorships,primary_topic');
        const cacheKey = hashKey(['works-batch', ids, cursor, this.mailto]);
        const data = await this.cachedFetch<{ results: OpenAlexWork[]; meta: { count: number; next_cursor?: string } }>(cacheKey, url);
        const wanted = new Map(
          batch.map((id) => [shortId(id).toUpperCase(), id] as const),
        );
        for (const work of data.results) {
          for (const a of work.authorships) {
            const requestedId = wanted.get(shortId(a.author.id).toUpperCase());
            if (!requestedId) continue;
            if (!result.has(requestedId)) result.set(requestedId, []);
            result.get(requestedId)!.push(work);
          }
        }
        if (this.onProgress && i % 200 === 0) {
          this.onProgress(`Fetching works batch ${Math.floor(i / batchSize) + 1}...`, `${i + batch.length}/${authorIds.length} authors`);
        }
        if (!data.results || data.results.length === 0) break;
        cursor = data.meta?.next_cursor ?? '';
        if (!cursor) break;
      }
    }
    return result;
  }

  async getSource(sourceId: string): Promise<OpenAlexSource> {
    const shortId = sourceId.replace('https://openalex.org/', '');
    const cacheKey = hashKey(['source', shortId, this.mailto]);
    const url = this.buildURL(`sources/${shortId}`, {});
    return this.cachedFetch<OpenAlexSource>(cacheKey, url);
  }

  async getTopicsByWork(workId: string): Promise<OpenAlexTopic[]> {
    const shortId = workId.replace('https://openalex.org/', '');
    const cacheKey = hashKey(['topics-work', shortId, this.mailto]);
    const url = this.buildURL(`works/${shortId}`, {});
    const data = await this.cachedFetch<{ primary_topic: OpenAlexTopic; topics?: OpenAlexTopic[] }>(cacheKey, url);
    return data.topics ?? (data.primary_topic ? [data.primary_topic] : []);
  }
}
