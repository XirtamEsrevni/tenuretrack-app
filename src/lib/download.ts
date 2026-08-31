import JSZip from 'jszip';
import type { ReportData } from '../types';
import { scanText } from './guardrail';

function benchmarksToCSV(data: ReportData): string {
  const headers = 'career_year,metric,people,p25,p50,p75,p25_ci_low,p25_ci_high,p50_ci_low,p50_ci_high,p75_ci_low,p75_ci_high';
  const rows = data.benchmarkRows.map((r) =>
    [r.career_year, r.metric, r.people, r.p25, r.p50, r.p75, r.p25_ci_low, r.p25_ci_high, r.p50_ci_low, r.p50_ci_high, r.p75_ci_low, r.p75_ci_high].join(','),
  );
  return [headers, ...rows].join('\n');
}

function subjectToCSV(data: ReportData): string {
  const headers = 'career_year,compared_at,metric,label,value,cohort_p25,cohort_p50,cohort_p75,position,compared';
  const rows = data.subjectRows.map((r) =>
    [r.career_year, r.compared_at, r.metric, `"${r.label}"`, r.value, r.cohort_p25, r.cohort_p50, r.cohort_p75, `"${r.position}"`, r.compared ? 'yes' : 'no'].join(','),
  );
  return [headers, ...rows].join('\n');
}

function venuesToCSV(data: ReportData): string {
  const headers = 'venue,cohort_papers,impact,top_quartile';
  const rows = data.venueRows.map((r) =>
    `"${r.venue}",${r.cohort_papers},${r.impact.toFixed(4)},${r.top_quartile ? 'yes' : 'no'}`,
  );
  return [headers, ...rows].join('\n');
}

function funnelToCSV(data: ReportData): string {
  const headers = 'step,label,rule,kept,dropped';
  const rows = data.funnelRows.map((r) =>
    `${r.step},"${r.label}","${r.rule.replace(/"/g, '""')}",${r.kept},${r.dropped}`,
  );
  return [headers, ...rows].join('\n');
}

function chaperoneToCSV(data: ReportData): string {
  const lines: string[] = ['section,key,people,papers,value,low,high'];
  for (const r of data.chaperonePooled) {
    lines.push(`pooled_rate,"${r.role}",${r.people},${r.papers},${r.rate.toFixed(4)},,`);
  }
  lines.push(`gap,middle_minus_led,${data.cohortSize},,${data.gapValue.toFixed(4)},${data.gapLow.toFixed(4)},${data.gapHigh.toFixed(4)}`);
  for (const r of data.chaperonePaired) {
    lines.push(`paired,"${r.metric}",${data.pairedPeople},,${r.value},,`);
  }
  for (const r of data.chaperoneVenues) {
    lines.push(`venue,"${r.venue}",,${r.cohort_papers},${r.led_share.toFixed(4)},,`);
  }
  return lines.join('\n');
}

function reportToMarkdown(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`# ${data.subjectName} against ${data.subfieldLabel}, at career year ${data.comparedAtYear}`);
  lines.push('');
  lines.push(`${data.subjectName} started a tenure-line appointment at ${data.institution} in ${data.startYear} and is now in year ${data.currentCareerYear} of it.`);
  if (data.currentCareerYear > 6) {
    lines.push(`That is longer than the cohort's window, so both sides are read at year 6: a ${data.currentCareerYear}-year record set against a 6-year one would credit the extra years to one side.`);
  }
  lines.push('');
  lines.push(`The cohort is ${data.cohortSize} people at ${data.institutionCount} institutions, each estimated to have begun a first independent faculty appointment between ${data.startWindow[0]} and ${data.startWindow[1]} in ${data.subfieldLabel}. ${data.subjectName} is not among them.`);
  lines.push('');
  lines.push('These numbers describe what a group of people did. They are not a standard, nobody in the cohort agreed to be measured, and no part of this says what any one career should look like.');
  lines.push('');
  lines.push(`## ${data.subjectName} and the cohort at year ${data.comparedAtYear}`);
  lines.push('');
  lines.push('A quarter of the cohort sat below p25, half sat below the median, and a quarter sat above p75. The last column says which of those stretches this record falls in. It is a location in a distribution and nothing more.');
  lines.push('');
  lines.push('| Through year ' + data.comparedAtYear + ' | This record | Cohort p25 | Cohort median | Cohort p75 | Where it falls |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of data.subjectRows) {
    const val = r.metric === 'lead_share' || r.metric === 'top_quartile_share' ? r.value.toFixed(2) : String(r.value);
    const p25 = r.metric === 'lead_share' || r.metric === 'top_quartile_share' ? r.cohort_p25.toFixed(2) : String(r.cohort_p25);
    const p50 = r.metric === 'lead_share' || r.metric === 'top_quartile_share' ? r.cohort_p50.toFixed(2) : String(r.cohort_p50);
    const p75 = r.metric === 'lead_share' || r.metric === 'top_quartile_share' ? r.cohort_p75.toFixed(2) : String(r.cohort_p75);
    lines.push(`| ${r.label} | ${val} | ${p25} | ${p50} | ${p75} | ${r.position} |`);
  }
  lines.push('');
  if (data.subjectRows.some((r) => r.metric === 'citations' && !r.compared)) {
    lines.push('### Why citations have no position');
    lines.push('');
    lines.push(`The cohort's papers in this window are eight to eighteen years old and ${data.subjectName}'s are at most ${data.comparedAtYear}. Citations accumulate with time, so setting one count against the other would measure the calendar rather than the work. The count is here because it is worth knowing, and unplaced because the comparison would not mean anything.`);
    lines.push('');
  }
  lines.push(`## The cohort year by year, up to year ${data.comparedAtYear}`);
  lines.push('');
  lines.push('| Cohort median | Year 1 | Year 2 | Year 3 | Year 4 | Year 5 | Year 6 |');
  lines.push('|---|---|---|---|---|---|---|');
  const medianLabels = ['Journal articles', 'Led articles (last or corresponding)', 'Share of articles led', 'Citations to those articles', 'h-index over those articles', 'Median venue impact', 'Share in top-quartile venues'];
  for (let i = 0; i < medianLabels.length; i++) {
    const metricKey = ['pubs', 'led', 'lead_share', 'citations', 'h_index', 'venue_impact_median', 'top_quartile_share'][i];
    const vals: string[] = [medianLabels[i]];
    for (let year = 1; year <= 6; year++) {
      const row = data.benchmarkRows.find((r) => r.career_year === year && r.metric === metricKey);
      if (row) {
        const v = metricKey === 'lead_share' || metricKey === 'top_quartile_share' ? row.p50.toFixed(2) : String(row.p50);
        vals.push(v);
      } else {
        vals.push('-');
      }
    }
    lines.push('| ' + vals.join(' | ') + ' |');
  }
  lines.push('');
  lines.push('## Where the subfield publishes');
  lines.push('');
  lines.push('| Venue | Cohort papers | Impact | Top quartile |');
  lines.push('|---|---|---|---|');
  for (const v of data.venueRows) {
    lines.push(`| ${v.venue} | ${v.cohort_papers} | ${v.impact.toFixed(2)} | ${v.top_quartile ? 'yes' : ''} |`);
  }
  lines.push('');
  lines.push('### The chaperone effect: who led the papers that reached those venues');
  lines.push('');
  lines.push(`Across every paper the cohort wrote, its work reached a top-quartile venue ${(data.gapValue * 100).toFixed(1)}% more often when its members were not leading it.`);
  lines.push('');
  lines.push(`Comparing the same ${data.pairedPeople} people against themselves, the median person placed ${((data.chaperonePaired.find(r => r.metric === 'median_led_share')?.value ?? 0) * 100).toFixed(1)}% of the papers they led in a top-quartile venue and ${((data.chaperonePaired.find(r => r.metric === 'median_middle_share')?.value ?? 0) * 100).toFixed(1)}% of the papers they did not.`);
  lines.push('');
  lines.push(`This is a cross-sectional approximation of Sekara et al., "The chaperone effect in scientific publishing", PNAS 2018 (doi 10.1073/pnas.1800471115).`);
  lines.push('');
  lines.push('## How the cohort was built');
  lines.push('');
  lines.push('| Step | Rule | People left | Removed |');
  lines.push('|---|---|---|---|');
  for (const f of data.funnelRows) {
    lines.push(`| ${f.label} | ${f.rule} | ${f.kept} | ${f.dropped} |`);
  }
  lines.push('');
  lines.push('Method: docs/methods.md. Data: OpenAlex (Priem, Piwowar and Orr, 2022), CC0.');
  return lines.join('\n');
}

export async function packageResults(data: ReportData): Promise<{ blob: Blob; guardrailPassed: boolean; violations: string[] }> {
  const files: Record<string, string> = {
    'report.md': reportToMarkdown(data),
    'benchmarks.csv': benchmarksToCSV(data),
    'subject.csv': subjectToCSV(data),
    'venues.csv': venuesToCSV(data),
    'funnel.csv': funnelToCSV(data),
    'chaperone.csv': chaperoneToCSV(data),
  };

  const allText = Object.values(files).join('\n');
  const scan = scanText(allText);
  if (!scan.passed) {
    return { blob: new Blob([]), guardrailPassed: false, violations: scan.violations };
  }

  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, guardrailPassed: true, violations: [] };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
