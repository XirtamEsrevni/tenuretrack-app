import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Stack from '@mui/material/Stack';
import type { BenchmarkRow } from '../types';

interface Props {
  rows: BenchmarkRow[];
  maxYear: number;
}

const METRIC_LABELS: Record<string, string> = {
  pubs: 'Journal articles',
  led: 'Led articles',
  lead_share: 'Share led',
  citations: 'Citations',
  h_index: 'h-index',
  venue_impact_median: 'Median venue impact',
  top_quartile_share: 'Top-quartile share',
};

const METRIC_ORDER = ['pubs', 'led', 'lead_share', 'citations', 'h_index', 'venue_impact_median', 'top_quartile_share'];

const CHART_W = 760;
const CHART_H = 220;
const PAD_L = 52;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;

export default function YearByYearChart({ rows, maxYear }: Props) {
  const [activeMetric, setActiveMetric] = useState<string>('pubs');

  const years = Array.from({ length: maxYear }, (_, i) => i + 1);

  const metricRows = rows.filter((r) => r.metric === activeMetric);
  const isPercent = activeMetric === 'lead_share' || activeMetric === 'top_quartile_share';

  const fmt = (v: number) => {
    if (isNaN(v)) return '—';
    return isPercent ? `${(v * 100).toFixed(0)}%` : v < 10 ? v.toFixed(1) : v.toFixed(0);
  };

  const allVals = metricRows.flatMap((r) => [r.p25, r.p50, r.p75, r.p75_ci_high, r.p25_ci_low]).filter((v) => !isNaN(v));
  const min = allVals.length ? Math.min(...allVals) : 0;
  const max = allVals.length ? Math.max(...allVals) : 1;
  const range = max - min || 1;
  const pad = range * 0.12;
  const scaleMin = Math.max(0, min - pad);
  const scaleMax = max + pad;

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  const xForYear = (year: number) => PAD_L + ((year - 0.5) / maxYear) * plotW;
  const yForVal = (v: number) => PAD_T + plotH - ((v - scaleMin) / (scaleMax - scaleMin)) * plotH;

  const ticks = 5;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => scaleMin + ((scaleMax - scaleMin) * i) / ticks);

  const medianLine = metricRows
    .filter((r) => !isNaN(r.p50))
    .map((r) => `${xForYear(r.career_year)},${yForVal(r.p50)}`)
    .join(' ');

  return (
    <Box>
      <ToggleButtonGroup
        exclusive
        value={activeMetric}
        onChange={(_, v) => v && setActiveMetric(v)}
        size="small"
        sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}
      >
        {METRIC_ORDER.map((m) => (
          <ToggleButton key={m} value={m} sx={{ textTransform: 'none', fontSize: '0.75rem', py: 0.25, px: 1 }}>
            {METRIC_LABELS[m]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box sx={{ width: '100%', overflowX: 'auto' }}>
        <svg width={CHART_W} height={CHART_H} style={{ maxWidth: '100%' }}>
          {/* Y-axis gridlines + labels */}
          {tickVals.map((tv, i) => {
            const y = yForVal(tv);
            return (
              <g key={i}>
                <line x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                <text x={PAD_L - 6} y={y + 3} textAnchor="end" fontSize={9} fill="rgba(0,0,0,0.45)">
                  {fmt(tv)}
                </text>
              </g>
            );
          })}

          {/* X-axis labels */}
          {years.map((yr) => (
            <text key={yr} x={xForYear(yr)} y={CHART_H - 8} textAnchor="middle" fontSize={9} fill="rgba(0,0,0,0.5)">
              Y{yr}
            </text>
          ))}

          {/* CI whiskers + quartile bands + median dots */}
          {metricRows.map((r) => {
            if (isNaN(r.p25)) return null;
            const cx = xForYear(r.career_year);
            const bandHalf = (plotW / maxYear) * 0.32;

            return (
              <g key={r.career_year}>
                {/* p25 CI whisker */}
                {!isNaN(r.p25_ci_low) && !isNaN(r.p25_ci_high) && (
                  <line x1={cx} y1={yForVal(r.p25_ci_low)} x2={cx} y2={yForVal(r.p25_ci_high)} stroke="rgba(0,0,0,0.18)" strokeWidth={1} />
                )}
                {/* p75 CI whisker */}
                {!isNaN(r.p75_ci_low) && !isNaN(r.p75_ci_high) && (
                  <line x1={cx} y1={yForVal(r.p75_ci_low)} x2={cx} y2={yForVal(r.p75_ci_high)} stroke="rgba(0,0,0,0.18)" strokeWidth={1} />
                )}
                {/* Quartile band */}
                <Tooltip
                  title={`Year ${r.career_year}: p25=${fmt(r.p25)}, median=${fmt(r.p50)}, p75=${fmt(r.p75)} (${r.people} people)`}
                  arrow
                >
                  <rect
                    x={cx - bandHalf}
                    y={yForVal(r.p75)}
                    width={bandHalf * 2}
                    height={Math.max(yForVal(r.p25) - yForVal(r.p75), 2)}
                    rx={3}
                    fill="rgba(63,81,181,0.14)"
                    stroke="rgba(63,81,181,0.35)"
                    strokeWidth={1}
                  />
                </Tooltip>
                {/* Median dot */}
                <circle cx={cx} cy={yForVal(r.p50)} r={3.5} fill="#3f51b5" stroke="#fff" strokeWidth={1} />
              </g>
            );
          })}

          {/* Median trend line */}
          {medianLine && (
            <polyline
              points={medianLine}
              fill="none"
              stroke="rgba(63,81,181,0.6)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}

          {/* Axes */}
          <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={CHART_H - PAD_B} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
          <line x1={PAD_L} y1={CHART_H - PAD_B} x2={CHART_W - PAD_R} y2={CHART_H - PAD_B} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
        </svg>
      </Box>

      <Stack direction="row" spacing={3} sx={{ mt: 1, flexWrap: 'wrap' }}>
        <LegendDot color="rgba(63,81,181,0.14)" label="p25–p75 interquartile range" />
        <LegendDot color="#3f51b5" label="Median" circle />
        <LegendLine label="95% bootstrap CI" />
        <LegendDash label="Median trend" />
      </Stack>
    </Box>
  );
}

function LegendDot({ color, label, circle }: { color: string; label: string; circle?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={{
          width: circle ? 10 : 14,
          height: circle ? 10 : 10,
          borderRadius: circle ? '50%' : 1,
          bgcolor: color,
          border: circle ? 'none' : '1px solid',
          borderColor: 'rgba(63,81,181,0.35)',
        }}
      />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

function LegendLine({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ width: 14, height: 2, bgcolor: 'rgba(0,0,0,0.18)' }} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}

function LegendDash({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <svg width={14} height={4}>
        <line x1={0} y1={2} x2={14} y2={2} stroke="rgba(63,81,181,0.6)" strokeWidth={1.5} strokeDasharray="4 3" />
      </svg>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
