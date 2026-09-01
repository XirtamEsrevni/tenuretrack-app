export interface UserDetails {
  email: string;
  orcid: string;
  university: string;
  startYear: number;
  clockExtensionYears: number;
  apiKey: string;
}

export interface Topic {
  id: string;
  name: string;
  paperCount: number;
  topVenues: string[];
}

export interface Config {
  subject: {
    name: string;
    orcid: string;
    openalex_author_ids: string[];
    institution_name: string;
    start_year: number;
    clock_extension_years: number;
  };
  subfield: {
    label: string;
    topics: Topic[];
    excluded_topics: string[];
  };
  cohort: {
    start_window: [number, number];
    horizon_years: number;
    countries: string[];
    core_topic_share_min: number;
    max_candidates: number;
    min_led_papers: number;
    min_cell_size: number;
    bootstrap_iterations: number;
    article_types: string[];
    excluded_venues: string[];
  };
}

export interface BenchmarkRow {
  career_year: number;
  metric: string;
  people: number;
  p25: number;
  p50: number;
  p75: number;
  p25_ci_low: number;
  p25_ci_high: number;
  p50_ci_low: number;
  p50_ci_high: number;
  p75_ci_low: number;
  p75_ci_high: number;
}

export interface SubjectRow {
  career_year: number;
  compared_at: number;
  metric: string;
  label: string;
  value: number;
  cohort_p25: number;
  cohort_p50: number;
  cohort_p75: number;
  position: string;
  compared: boolean;
}

export interface VenueRow {
  venue: string;
  cohort_papers: number;
  impact: number;
  top_quartile: boolean;
}

export interface FunnelRow {
  step: number;
  label: string;
  rule: string;
  kept: number;
  dropped: number;
}

export interface ChaperonePooledRow {
  role: string;
  people: number;
  papers: number;
  rate: number;
}

export interface ChaperonePairedRow {
  metric: string;
  value: number;
}

export interface ChaperoneVenueRow {
  venue: string;
  cohort_papers: number;
  led_share: number;
}

export interface ReportData {
  subjectName: string;
  institution: string;
  startYear: number;
  currentCareerYear: number;
  calendarYear: number;
  comparedAtYear: number;
  clockExtensionYears: number;
  cohortSize: number;
  institutionCount: number;
  startWindow: [number, number];
  subfieldLabel: string;
  subjectRows: SubjectRow[];
  benchmarkRows: BenchmarkRow[];
  venueRows: VenueRow[];
  funnelRows: FunnelRow[];
  chaperonePooled: ChaperonePooledRow[];
  chaperonePaired: ChaperonePairedRow[];
  chaperoneVenues: ChaperoneVenueRow[];
  gapValue: number;
  gapLow: number;
  gapHigh: number;
  signTestP: number;
  pairedPeople: number;
  pairedHigherNotLed: number;
  pairedHigherLed: number;
  pairedSame: number;
}

export interface ProgressEvent {
  stage: string;
  message: string;
  detail?: string;
  percent?: number;
}

export type WizardStep = 'details' | 'topics' | 'build' | 'report' | 'download';
