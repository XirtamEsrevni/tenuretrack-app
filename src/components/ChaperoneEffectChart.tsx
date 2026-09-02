import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import type { ReportData } from '../types';

interface Props {
  report: ReportData;
}

const ROLE_COLORS = ['#d32f2f', '#ed6c02', '#2e7d32'];
const ROLE_LABELS = ['Led (last/corresp.)', 'First, not leading', 'Middle author'];

const CHART_W = 420;
const CHART_H = 200;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;

export default function ChaperoneEffectChart({ report }: Props) {
  const pooled = report.chaperonePooled;
  if (pooled.length === 0) return null;

  const maxRate = Math.max(...pooled.map((r) => r.rate), 0.01);
  const scaleMax = Math.ceil(maxRate * 100) / 100 + 0.05;

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const barW = plotW / pooled.length * 0.6;
  const gap = plotW / pooled.length;

  const yForVal = (v: number) => PAD_T + plotH - (v / scaleMax) * plotH;

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => (scaleMax * i) / ticks);

  const ledRate = pooled[0]?.rate ?? 0;
  const middleRate = pooled[2]?.rate ?? 0;
  const gapPct = ((middleRate - ledRate) * 100).toFixed(1);

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Bar chart */}
        <Box sx={{ flex: '1 1 420px', minWidth: 300 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Top-quartile venue rate by author role
          </Typography>
          <svg width={CHART_W} height={CHART_H} style={{ maxWidth: '100%' }}>
            {/* Gridlines */}
            {tickVals.map((tv, i) => {
              const y = yForVal(tv);
              return (
                <g key={i}>
                  <line x1={PAD_L} y1={y} x2={CHART_W - PAD_R} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                  <text x={PAD_L - 5} y={y + 3} textAnchor="end" fontSize={9} fill="rgba(0,0,0,0.45)">
                    {Math.round(tv * 100)}%
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {pooled.map((r, i) => {
              const bx = PAD_L + gap * i + (gap - barW) / 2;
              const bh = (r.rate / scaleMax) * plotH;
              return (
                <Tooltip
                  key={r.role}
                  title={`${r.role}: ${(r.rate * 100).toFixed(1)}% (${r.papers} papers, ${r.people} people)`}
                  arrow
                >
                  <g>
                    <rect
                      x={bx}
                      y={PAD_T + plotH - bh}
                      width={barW}
                      height={bh}
                      rx={4}
                      fill={ROLE_COLORS[i]}
                      opacity={0.85}
                    />
                    <text x={bx + barW / 2} y={PAD_T + plotH - bh - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={ROLE_COLORS[i]}>
                      {(r.rate * 100).toFixed(1)}%
                    </text>
                    <text x={bx + barW / 2} y={CHART_H - 10} textAnchor="middle" fontSize={8} fill="rgba(0,0,0,0.55)">
                      {ROLE_LABELS[i]}
                    </text>
                  </g>
                </Tooltip>
              );
            })}

            {/* Axes */}
            <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={CHART_H - PAD_B} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
            <line x1={PAD_L} y1={CHART_H - PAD_B} x2={CHART_W - PAD_R} y2={CHART_H - PAD_B} stroke="rgba(0,0,0,0.2)" strokeWidth={1} />
          </svg>
        </Box>

        {/* Gap callout + paired comparison */}
        <Box sx={{ flex: '1 1 280px', minWidth: 260 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 2,
              bgcolor: 'primary.50',
              border: '1px solid',
              borderColor: 'primary.100',
              mb: 2,
            }}
          >
            <Typography variant="overline" color="primary.dark" sx={{ fontSize: '0.65rem' }}>
              Chaperone gap
            </Typography>
            <Typography variant="h4" color="primary.main" fontWeight={700}>
              +{gapPct}pp
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The cohort's work reached a top-quartile venue{' '}
              <strong>{gapPct} percentage points</strong> more often when members were{' '}
              <strong>not</strong> leading the paper.
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
              95% CI: [{(report.gapLow * 100).toFixed(1)}, {(report.gapHigh * 100).toFixed(1)}]pp
            </Typography>
          </Box>

          {/* Paired sign test visual */}
          {report.pairedPeople > 0 && (
          <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Paired comparison ({report.pairedPeople} people)
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <PairedBar label="Higher when not led" count={report.pairedHigherNotLed} total={report.pairedPeople} color="#2e7d32" />
            <PairedBar label="Higher when led" count={report.pairedHigherLed} total={report.pairedPeople} color="#d32f2f" />
            <PairedBar label="Same" count={report.pairedSame} total={report.pairedPeople} color="rgba(0,0,0,0.3)" />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Sign test p = {report.signTestP.toFixed(4)} — comparing each person against themselves
          </Typography>
          </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function PairedBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <Box sx={{ flex: 1 }}>
      <Box sx={{ height: 8, borderRadius: 1, bgcolor: 'action.hover', overflow: 'hidden', mb: 0.5 }}>
        <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: color, borderRadius: 1, transition: 'width 0.3s' }} />
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
        {label}
      </Typography>
      <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.7rem' }}>
        {count} ({pct.toFixed(0)}%)
      </Typography>
    </Box>
  );
}
