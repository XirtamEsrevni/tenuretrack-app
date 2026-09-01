import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import MetricBand from './MetricBand';
import YearByYearChart from './YearByYearChart';
import ChaperoneEffectChart from './ChaperoneEffectChart';
import type { ReportData } from '../types';

interface Props {
  report: ReportData;
  onDownload: () => void;
  onReset: () => void;
}

export default function ReportView({ report, onDownload, onReset }: Props) {
  const [showFunnel, setShowFunnel] = useState(false);

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5">
            {report.subjectName} against {report.subfieldLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {report.institution} · Started {report.startYear} · Clock year {report.currentCareerYear} · Compared at year {report.comparedAtYear}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onReset} color="inherit">
            Start over
          </Button>
          <Button variant="contained" onClick={onDownload}>
            Download results
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          The cohort is {report.cohortSize} people at {report.institutionCount} institutions, each
          estimated to have begun a first independent faculty appointment between {report.startWindow[0]}{' '}
          and {report.startWindow[1]} in {report.subfieldLabel}. These numbers describe what a group
          of people did. They are not a standard, nobody in the cohort agreed to be measured, and no
          part of this says what any one career should look like.
        </Typography>
      </Alert>

      {report.clockExtensionYears > 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            The tenure clock was stopped for {report.clockExtensionYears} year
            {report.clockExtensionYears === 1 ? '' : 's'}. An extension grants calendar
            time; it does not remove the work done during it. You are compared at clock
            year {report.currentCareerYear} while papers are counted across all{' '}
            {report.comparedAtYear + report.clockExtensionYears} calendar years of the
            appointment. Reading you at calendar year {report.calendarYear} would compare
            you against people who had uninterrupted time, which is what the extension
            exists to prevent.
          </Typography>
        </Alert>
      )}

      {report.currentCareerYear > 6 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            You are in year {report.currentCareerYear}, which is longer than the cohort's window.
            Both sides are read at year {report.comparedAtYear}: a {report.currentCareerYear}-year
            record set against a {report.comparedAtYear}-year one would credit the extra years to one side.
          </Typography>
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {report.subjectName} and the cohort at year {report.comparedAtYear}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A quarter of the cohort sat below p25, half sat below the median, and a quarter sat above
          p75. The position column says which of those stretches this record falls in — it is a
          location in a distribution and nothing more.
        </Typography>
        {report.subjectRows.map((row) => {
          const benchmark = report.benchmarkRows.find(
            (r) => r.career_year === report.comparedAtYear && r.metric === row.metric,
          );
          return <MetricBand key={row.metric} row={row} benchmark={benchmark} />;
        })}
        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2">
            <strong>Why citations have no position:</strong> The cohort's papers in this window are
            eight to eighteen years old and {report.subjectName}'s are at most {report.comparedAtYear}.
            Citations accumulate with time, so setting one count against the other would measure the
            calendar rather than the work. The count is here because it is worth knowing, and unplaced
            because the comparison would not mean anything.
          </Typography>
        </Alert>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          The cohort year by year, up to year {report.comparedAtYear}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Each bar shows the p25-to-p75 range for that metric at that career year, with the median
          marked. Hover for exact values.
        </Typography>
        <YearByYearChart rows={report.benchmarkRows} maxYear={report.comparedAtYear} />
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Where the subfield publishes
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Venue</TableCell>
                <TableCell align="right">Cohort papers</TableCell>
                <TableCell align="right">Impact</TableCell>
                <TableCell align="right">Top quartile</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.venueRows.map((v) => (
                <TableRow key={v.venue}>
                  <TableCell>{v.venue}</TableCell>
                  <TableCell align="right">{v.cohort_papers}</TableCell>
                  <TableCell align="right">{v.impact.toFixed(2)}</TableCell>
                  <TableCell align="right">
                    {v.top_quartile ? (
                      <Chip label="yes" size="small" color="success" />
                    ) : (
                      <Chip label="" size="small" />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          The chaperone effect: who led the papers that reached those venues
        </Typography>
        <ChaperoneEffectChart report={report} />
        <Typography variant="body2" sx={{ mt: 2, mb: 2 }}>
          Comparing the same {report.pairedPeople} people against themselves, the median person
          placed {((report.chaperonePaired.find((r) => r.metric === 'median_led_share')?.value ?? 0) * 100).toFixed(1)}%
          of the papers they led in a top-quartile venue and{' '}
          {((report.chaperonePaired.find((r) => r.metric === 'median_middle_share')?.value ?? 0) * 100).toFixed(1)}%
          of the papers they did not (sign test p = {report.signTestP.toFixed(4)}).
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Role</TableCell>
                <TableCell align="right">People</TableCell>
                <TableCell align="right">Papers</TableCell>
                <TableCell align="right">Top-quartile rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.chaperonePooled.map((r) => (
                <TableRow key={r.role}>
                  <TableCell>{r.role}</TableCell>
                  <TableCell align="right">{r.people}</TableCell>
                  <TableCell align="right">{r.papers}</TableCell>
                  <TableCell align="right">{(r.rate * 100).toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Cross-sectional approximation of Sekara et al., &ldquo;The chaperone effect in scientific
          publishing&rdquo;, PNAS 2018 (doi 10.1073/pnas.1800471115).
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">How the cohort was built</Typography>
          <Button size="small" onClick={() => setShowFunnel(!showFunnel)}>
            {showFunnel ? 'Hide' : 'Show'}
          </Button>
        </Box>
        {showFunnel && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Step</TableCell>
                  <TableCell>Rule</TableCell>
                  <TableCell align="right">People left</TableCell>
                  <TableCell align="right">Removed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.funnelRows.map((f) => (
                  <TableRow key={f.step}>
                    <TableCell>{f.label}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{f.rule}</TableCell>
                    <TableCell align="right">{f.kept}</TableCell>
                    <TableCell align="right">{f.dropped}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
        <Button onClick={onReset} color="inherit">
          Start over
        </Button>
        <Button variant="contained" onClick={onDownload}>
          Download results
        </Button>
      </Box>
    </Box>
  );
}
