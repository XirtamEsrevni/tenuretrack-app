/** Short OpenAlex entity id (`A123`, `T10001`) from a URL or a bare id. */
export function shortId(value: string): string {
  return value.replace(/^https?:\/\/openalex\.org\//i, '');
}

/** Short ROR (`03r0ha626`) from a URL or a bare id. */
export function shortRor(value: string): string {
  return value.replace(/^https?:\/\/ror\.org\//i, '').toLowerCase();
}

export function sameId(a: string, b: string): boolean {
  return shortId(a).toUpperCase() === shortId(b).toUpperCase();
}

export function sameRor(a: string, b: string): boolean {
  return shortRor(a) === shortRor(b);
}

export function looksLikeRor(value: string): boolean {
  const s = shortRor(value.trim());
  return /^0[a-z0-9]{6,}$/i.test(s);
}

/** ORCID `0000-0002-1825-0097` from a URL or a bare id. */
export function shortOrcid(value: string): string {
  const text = value.trim().replace(/^https?:\/\/orcid\.org\//i, '').toUpperCase();
  return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(text) ? text : '';
}
