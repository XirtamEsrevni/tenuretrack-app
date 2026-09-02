import type {
  BenchmarkRow,
  SubjectRow,
  VenueRow,
  FunnelRow,
  ChaperonePooledRow,
  ChaperonePairedRow,
  ReportData,
} from '../types';
import { quantile, bootstrapCI } from './stats';
import {
  computeMetrics,
  computeTopQuartileCutoff,
  isJournalArticle,
} from './metrics';
import type { OpenAlexWork } from './openalex';
import { chaperoneFromMembers, type CohortMember } from './chaperone';
import { clockYear, comparisonHorizon, HORIZON_YEARS } from './subject';
import { sameId } from './ids';

export type { CohortMember };

const METRIC_LABELS: Record<string, string> = {
  pubs: 'Journal articles',
  led: 'Led articles (last or corresponding)',
  lead_share: 'Share of articles led',
  citations: 'Citations to those articles',
  h_index: 'h-index over those articles',
  venue_impact_median: 'Median venue impact',
  top_quartile_share: 'Share in top-quartile venues',
};

const METRIC_ORDER = [
  'pubs',
  'led',
  'lead_share',
  'citations',
  'h_index',
  'venue_impact_median',
  'top_quartile_share',
];

const BOOTSTRAP_ITERATIONS = 500;

export interface BuildReportInput {
  subjectName: string;
  institution: string;
  startYear: number;
  clockExtension: number;
  subjectWorks: OpenAlexWork[];
  subjectAuthorId: string;
  subjectInstitutionRor?: string;
  cohortMembers: CohortMember[];
  articleTypes: string[];
  funnelRows: FunnelRow[];
  subfieldLabel: string;
  startWindow: [number, number];
  nowYear?: number;
}

export interface BuildResult {
  report: ReportData;
  funnel: FunnelRow[];
}

function metricValue(
  metrics: ReturnType<typeof computeMetrics>,
  key: string,
): number | null {
  const map: Record<string, number | null> = {
    pubs: metrics.pubs,
    led: metrics.led,
    lead_share: metrics.leadShare,
    citations: metrics.citations,
    h_index: metrics.hIndex,
    venue_impact_median: metrics.venueImpactMedian,
    top_quartile_share: metrics.topQuartileShare,
  };
  return map[key] ?? null;
}

export function positionOf(value: number, p25: number, p50: number, p75: number): string {
  if (isNaN(p25) || isNaN(p50) || isNaN(p75)) return 'not compared';
  if (value < p25) return 'below p25';
  if (value === p50) return 'at the median';
  if (value < p50) return 'between p25 and the median';
  if (value <= p75) return 'between the median and p75';
  return 'above p75';
}

export function buildReport(input: BuildReportInput): BuildResult {
  const nowYear = input.nowYear ?? new Date().getFullYear();
  const calendarYear = nowYear - input.startYear + 1;
  const currentCareerYear = clockYear(input.startYear, input.clockExtension, nowYear);
  const comparedAtYear = comparisonHorizon(currentCareerYear, HORIZON_YEARS);
  // Stopped-clock years grant calendar time; they do not remove the work done
  // during them. Count papers across the calendar years the subject actually
  // had, and compare at the clock year.
  const subjectWindow = comparedAtYear + input.clockExtension;

  const allCohortWorks = input.cohortMembers.flatMap((m) => m.works);
  const topQuartileCutoff = computeTopQuartileCutoff(allCohortWorks);

  const benchmarkRows: BenchmarkRow[] = [];
  for (let year = 1; year <= HORIZON_YEARS; year++) {
    for (const metricKey of METRIC_ORDER) {
      const values: number[] = [];
      for (const member of input.cohortMembers) {
        const metrics = computeMetrics(
          member.works,
          member.authorId,
          member.startYear,
          year,
          input.articleTypes,
          topQuartileCutoff,
        );
        const val = metricValue(metrics, metricKey);
        if (val != null && !isNaN(val)) values.push(val);
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
    input.subjectWorks,
    input.subjectAuthorId,
    input.startYear,
    subjectWindow,
    input.articleTypes,
    topQuartileCutoff,
    input.subjectInstitutionRor,
  );

  const cohortAtComparison = benchmarkRows.filter((r) => r.career_year === comparedAtYear);
  const subjectRows: SubjectRow[] = METRIC_ORDER.map((metricKey) => {
    const cohortRow = cohortAtComparison.find((r) => r.metric === metricKey)!;
    const subjectVal = metricValue(subjectMetrics, metricKey);
    const val = subjectVal ?? NaN;
    const missing = subjectVal == null || isNaN(subjectVal);
    const compared = metricKey !== 'citations' && !missing;
    let position = 'not compared';
    if (compared && !isNaN(cohortRow.p25)) {
      position = positionOf(val, cohortRow.p25, cohortRow.p50, cohortRow.p75);
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

  const chaperone = chaperoneFromMembers(
    input.cohortMembers,
    topQuartileCutoff,
    input.articleTypes,
  );

  const chaperonePooled: ChaperonePooledRow[] = chaperone.pooled.map((r) => ({
    role: r.role,
    people: r.people,
    papers: r.papers,
    rate: r.rate ?? 0,
  }));

  const chaperonePaired: ChaperonePairedRow[] = [
    { metric: 'median_led_share', value: chaperone.paired.medianLedShare ?? 0 },
    { metric: 'median_middle_share', value: chaperone.paired.medianMiddleShare ?? 0 },
    { metric: 'sign_test_p', value: chaperone.paired.pValue ?? 1 },
    { metric: 'paired_people', value: chaperone.paired.people },
    { metric: 'higher_not_led', value: chaperone.paired.higherOnMiddle },
    { metric: 'higher_led', value: chaperone.paired.higherOnLed },
    { metric: 'same', value: chaperone.paired.ties },
  ];

  const institutionCount = new Set(
    input.cohortMembers.flatMap((m) =>
      m.works.flatMap((w) =>
        w.authorships
          .filter((a) => sameId(a.author.id, m.authorId))
          .flatMap((a) => a.institutions.map((i) => i.id)),
      ),
    ),
  ).size;

  const report: ReportData = {
    subjectName: input.subjectName,
    institution: input.institution,
    startYear: input.startYear,
    currentCareerYear,
    calendarYear,
    comparedAtYear,
    clockExtensionYears: input.clockExtension,
    cohortSize: input.cohortMembers.length,
    institutionCount,
    startWindow: input.startWindow,
    subfieldLabel: input.subfieldLabel,
    subjectRows,
    benchmarkRows,
    venueRows,
    funnelRows: input.funnelRows,
    chaperonePooled,
    chaperonePaired,
    chaperoneVenues: chaperone.venues,
    gapValue: chaperone.gap.gap ?? 0,
    gapLow: chaperone.gap.lo ?? 0,
    gapHigh: chaperone.gap.hi ?? 0,
    signTestP: chaperone.paired.pValue ?? 1,
    pairedPeople: chaperone.paired.people,
    pairedHigherNotLed: chaperone.paired.higherOnMiddle,
    pairedHigherLed: chaperone.paired.higherOnLed,
    pairedSame: chaperone.paired.ties,
  };

  return { report, funnel: input.funnelRows };
}

export { positionOf as positionLabel };
