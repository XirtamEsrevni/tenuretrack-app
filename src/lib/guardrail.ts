const AUTHOR_ID_RE = /A\d{7,}/g;
const ORCID_RE = /\d{4}-\d{4}-\d{4}-\d{3}[\dX]/gi;
const FORBIDDEN_WORDS = /\b(expected|required|threshold|target|should)\b/gi;

export interface GuardrailResult {
  passed: boolean;
  violations: string[];
}

export function scanText(text: string): GuardrailResult {
  const violations: string[] = [];
  const authorMatches = text.match(AUTHOR_ID_RE);
  if (authorMatches) {
    violations.push(`OpenAlex author IDs found: ${authorMatches.slice(0, 5).join(', ')}`);
  }
  const orcidMatches = text.match(ORCID_RE);
  if (orcidMatches) {
    violations.push(`ORCID patterns found: ${orcidMatches.slice(0, 5).join(', ')}`);
  }
  const forbiddenMatches = text.match(FORBIDDEN_WORDS);
  if (forbiddenMatches) {
    violations.push(`Prescriptive words found: ${forbiddenMatches.slice(0, 5).join(', ')}`);
  }
  return { passed: violations.length === 0, violations };
}

export function scanReport(report: Record<string, unknown>): GuardrailResult {
  const json = JSON.stringify(report);
  return scanText(json);
}
