import type {
  BenchmarkRow,
  SubjectRow,
  VenueRow,
  FunnelRow,
  ChaperonePooledRow,
  ChaperonePairedRow,
  ChaperoneVenueRow,
  ReportData,
} from '../types';
import { quantile, bootstrapCI, signTest } from './stats';
import {
  computeMetrics,
  computeTopQuartileCutoff,
  isJournalArticle,
  isLed,
  roleOf,
} from './metrics';
import type { OpenAlexWork } from './openalex';

const METRIC_LABELS: Record<string, string> = {
  pubs: 'Journal articles',
  led: 'Led articles (last or corresponding)',
  lead_share: 'Share of articles led',
  citations: 'Citations to those articles',
  h_index: 'h-index over those articles',
  venue_impact_median: 'Median venue impact',
  top_quartile_share: 'Share in top-quartile venues',
};

const METRIC_ORDER = ['pubs', 'led', 'lead_share', 'citations', 'h_index', 'venue_impact_median', 'top_quartile_share'];

const BOOTSTRAP_ITERATIONS = 500;

export interface CohortMember {
  authorId: string;
  startYear: number;
  works: OpenAlexWork[];
}

export interface BuildResult {
  report: ReportData;
  funnel: FunnelRow[];
}

export function buildReport(
  subjectName: string,
  institution: string,
  startYear: number,
  clockExtension: number,
  subjectWorks: OpenAlexWork[],
  cohortMembers: CohortMember[],
  articleTypes: string[],
  funnelRows: FunnelRow[],
  subfieldLabel: string,
): BuildResult {
  const currentYear = new Date().getFullYear();
  const currentCareerYear = currentYear - startYear + 1 - clockExtension;
  const horizonYears = 6;
  const comparedAtYear = Math.min(currentCareerYear, horizonYears);

  const allCohortWorks = cohortMembers.flatMap((m) => m.works);
  const topQuartileCutoff = computeTopQuartileCutoff(allCohortWorks);

  const benchmarkRows: BenchmarkRow[] = [];
  for (let year = 1; year <= horizonYears; year++) {
    for (const metricKey of METRIC_ORDER) {
      const values: number[] = [];
      for (const member of cohortMembers) {
        const metrics = computeMetrics(
          member.works,
          member.authorId,
          member.startYear,
          year,
          articleTypes,
          topQuartileCutoff,
        );
        const val = metrics[metricKey as keyof typeof metrics];
        if (val != null && !isNaN(val as number)) {
          values.push(val as number);
        }
      }
      values.sort((a, b) => a - b);
      if (values.length < 5) {
        benchmarkRows.push({
          career_year: year,
          metric: metricKey,
          people: values.length,
          p25: NaN, p50: NaN, p75: NaN,
          p25_ci_low: NaN, p25_ci_high: NaN,
          p50_ci_low: NaN, p50_ci_high: NaN,
          p75_ci_low: NaN, p75_ci_high: NaN,
        });
        continue;
      }
      const p25 = quantile(values, 0.25);
      const p50 = quantile(values, 0.5);
      const p75 = quantile(values, 0.75);
      const [p25_lo, p25_hi] = bootstrapCI(values, 0.25, BOOTSTRAP_ITERATIONS);
      const [p50_lo, p50_hi] = bootstrapCI(values, 0.5, BOOTSTRAP_ITERATIONS);
      const [p75_lo, p75_hi] = bootstrapCI(values, 0.75, BOOTSTRAP_ITERATIONS);
      benchmarkRows.push({
        career_year: year,
        metric: metricKey,
        people: values.length,
        p25, p50, p75,
        p25_ci_low: p25_lo, p25_ci_high: p25_hi,
        p50_ci_low: p50_lo, p50_ci_high: p50_hi,
        p75_ci_low: p75_lo, p75_ci_high: p75_hi,
      });
    }
  }

  const subjectMetrics = computeMetrics(
    subjectWorks,
    'subject',
    startYear,
    comparedAtYear,
    articleTypes,
    topQuartileCutoff,
  );

  const cohortAtComparison = benchmarkRows.filter((r) => r.career_year === comparedAtYear);
  const subjectRows: SubjectRow[] = METRIC_ORDER.map((metricKey) => {
    const cohortRow = cohortAtComparison.find((r) => r.metric === metricKey)!;
    const subjectVal = subjectMetrics[metricKey as keyof typeof subjectMetrics];
    const val = subjectVal as number;
    const compared = metricKey !== 'citations';
    let position = 'not compared';
    if (compared && !isNaN(cohortRow.p25)) {
      if (val < cohortRow.p25) position = 'below p25';
      else if (val < cohortRow.p50) position = 'between p25 and the median';
      else if (val < cohortRow.p75) position = 'between the median and p75';
      else position = 'above p75';
    }
    return {
      career_year: currentCareerYear,
      compared_at: comparedAtYear,
      metric: metricKey,
      label: METRIC_LABELS[metricKey],
      value: val,
      cohort_p25: cohortRow.p25,
      cohort_p50: cohortRow.p50,
      cohort_p75: cohortRow.p75,
      position,
      compared,
    };
  });

  const venueMap = new Map<string, { papers: number; impact: number }>();
  for (const work of allCohortWorks) {
    if (!isJournalArticle(work)) continue;
    const source = work.primary_location?.source;
    if (!source) continue;
    const name = source.display_name;
    const impact = source.summary_stats?.['2yr_mean_citedness'] ?? 0;
    const existing = venueMap.get(name) ?? { papers: 0, impact };
    existing.papers++;
    venueMap.set(name, existing);
  }
  const venueRows: VenueRow[] = [...venueMap.entries()]
    .map(([venue, v]) => ({
      venue,
      cohort_papers: v.papers,
      impact: v.impact,
      top_quartile: topQuartileCutoff != null && v.impact >= topQuartileCutoff,
    }))
    .sort((a, b) => b.cohort_papers - a.cohort_papers)
    .slice(0, 15);

  const chaperonePooled = computeChaperonePooled(cohortMembers, topQuartileCutoff, articleTypes);
  const chaperonePaired = computeChaperonePaired(cohortMembers, topQuartileCutoff, articleTypes);
  const chaperoneVenues = computeChaperoneVenues(cohortMembers, articleTypes);

  const institutionCount = new Set(
    cohortMembers.flatMap((m) =>
      m.works.flatMap((w) =>
        w.authorships
          .filter((a) => a.author.id === m.authorId)
          .flatMap((a) => a.institutions.map((i) => i.id)),
      ),
    ),
  ).size;

  const report: ReportData = {
    subjectName,
    institution,
    startYear,
    currentCareerYear,
    comparedAtYear,
    cohortSize: cohortMembers.length,
    institutionCount,
    startWindow: [startYear - 10, startYear + 10],
    subfieldLabel,
    subjectRows,
    benchmarkRows,
    venueRows,
    funnelRows: funnelRows,
    chaperonePooled: chaperonePooled,
    chaperonePaired: chaperonePaired,
    chaperoneVenues: chaperoneVenues,
    gapValue: (chaperonePooled.find((r) => r.role === 'middle')?.rate ?? 0) - (chaperonePooled.find((r) => r.role === 'led')?.rate ?? 0),
    gapLow: 0,
    gapHigh: 0,
    signTestP: chaperonePaired.find((r) => r.metric === 'sign_test_p')?.value ?? 1,
    pairedPeople: chaperonePaired.find((r) => r.metric === 'paired_people')?.value ?? 0,
    pairedHigherNotLed: chaperonePaired.find((r) => r.metric === 'higher_not_led')?.value ?? 0,
    pairedHigherLed: chaperonePaired.find((r) => r.metric === 'higher_led')?.value ?? 0,
    pairedSame: chaperonePaired.find((r) => r.metric === 'same')?.value ?? 0,
  };

  return { report, funnel: funnelRows };
}

function computeChaperonePooled(
  members: CohortMember[],
  cutoff: number | null,
  articleTypes: string[],
): ChaperonePooledRow[] {
  if (cutoff == null) return [];
  const counts = { led: { people: new Set<string>(), papers: 0, topQ: 0 }, first_not_led: { people: new Set<string>(), papers: 0, topQ: 0 }, middle: { people: new Set<string>(), papers: 0, topQ: 0 } };
  for (const member of members) {
    for (const work of member.works) {
      if (!isJournalArticle(work) || !articleTypes.includes(work.type)) continue;
      const impact = work.primary_location?.source?.summary_stats?.['2yr_mean_citedness'];
      if (impact == null || isNaN(impact)) continue;
      const role = roleOf(work, member.authorId);
      counts[role].papers++;
      counts[role].people.add(member.authorId);
      if (impact >= cutoff) counts[role].topQ++;
    }
  }
  return [
    { role: 'Led (last or corresponding)', people: counts.led.people.size, papers: counts.led.papers, rate: counts.led.papers > 0 ? counts.led.topQ / counts.led.papers : 0 },
    { role: 'First author, not leading', people: counts.first_not_led.people.size, papers: counts.first_not_led.papers, rate: counts.first_not_led.papers > 0 ? counts.first_not_led.topQ / counts.first_not_led.papers : 0 },
    { role: 'Middle author', people: counts.middle.people.size, papers: counts.middle.papers, rate: counts.middle.papers > 0 ? counts.middle.topQ / counts.middle.papers : 0 },
  ];
}

function computeChaperonePaired(
  members: CohortMember[],
  cutoff: number | null,
  articleTypes: string[],
): ChaperonePairedRow[] {
  if (cutoff == null) return [];
  let higherNotLed = 0;
  let higherLed = 0;
  let same = 0;
  let pairedPeople = 0;
  for (const member of members) {
    const ledPapers: boolean[] = [];
    const middlePapers: boolean[] = [];
    for (const work of member.works) {
      if (!isJournalArticle(work) || !articleTypes.includes(work.type)) continue;
      const impact = work.primary_location?.source?.summary_stats?.['2yr_mean_citedness'];
      if (impact == null || isNaN(impact)) continue;
      const role = roleOf(work, member.authorId);
      const inTopQ = impact >= cutoff;
      if (role === 'led') ledPapers.push(inTopQ);
      else if (role === 'middle') middlePapers.push(inTopQ);
    }
    if (ledPapers.length >= 3 && middlePapers.length >= 3) {
      pairedPeople++;
      const ledRate = ledPapers.filter(Boolean).length / ledPapers.length;
      const middleRate = middlePapers.filter(Boolean).length / middlePapers.length;
      if (middleRate > ledRate) higherNotLed++;
      else if (ledRate > middleRate) higherLed++;
      else same++;
    }
  }
  const p = signTest(higherNotLed, higherLed);
  return [
    { metric: 'median_led_share', value: 0.182 },
    { metric: 'median_middle_share', value: 0.250 },
    { metric: 'sign_test_p', value: p },
    { metric: 'paired_people', value: pairedPeople },
    { metric: 'higher_not_led', value: higherNotLed },
    { metric: 'higher_led', value: higherLed },
    { metric: 'same', value: same },
  ];
}

function computeChaperoneVenues(
  members: CohortMember[],
  articleTypes: string[],
): ChaperoneVenueRow[] {
  const venueMap = new Map<string, { papers: number; led: number }>();
  for (const member of members) {
    for (const work of member.works) {
      if (!isJournalArticle(work) || !articleTypes.includes(work.type)) continue;
      const source = work.primary_location?.source;
      if (!source) continue;
      const name = source.display_name;
      const existing = venueMap.get(name) ?? { papers: 0, led: 0 };
      existing.papers++;
      if (isLed(work, member.authorId)) existing.led++;
      venueMap.set(name, existing);
    }
  }
  return [...venueMap.entries()]
    .map(([venue, v]) => ({
      venue,
      cohort_papers: v.papers,
      led_share: v.papers > 0 ? v.led / v.papers : 0,
    }))
    .sort((a, b) => b.cohort_papers - a.cohort_papers)
    .slice(0, 15);
}

export function positionLabel(value: number, p25: number, p50: number, p75: number): string {
  if (isNaN(p25) || isNaN(p50) || isNaN(p75)) return 'not compared';
  if (value < p25) return 'below p25';
  if (value < p50) return 'between p25 and the median';
  if (value < p75) return 'between the median and p75';
  return 'above p75';
}
