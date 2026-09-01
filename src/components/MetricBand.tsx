import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import type { SubjectRow, BenchmarkRow } from '../types';


interface Props {
  row: SubjectRow;
  benchmark?: BenchmarkRow;
}

export default function MetricBand({ row, benchmark }: Props) {
  const isPercent = row.metric === 'lead_share' || row.metric === 'top_quartile_share';
  const fmt = (v: number) => {
    if (isNaN(v)) return '—';
    return isPercent ? `${(v * 100).toFixed(1)}%` : v < 100 ? v.toFixed(1) : v.toFixed(0);
  };

  if (!row.compared || isNaN(row.cohort_p25) || isNaN(row.cohort_p75)) {
    return (
      <Box sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ minWidth: 220, fontSize: '0.875rem', fontWeight: 500 }}>{row.label}</Typography>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 700 }}>{fmt(row.value)}</Typography>
        <Typography variant="caption" color="text.disabled">
          {row.compared ? 'insufficient data for comparison' : 'not compared (citations accumulate with time)'}
        </Typography>
      </Box>
    );
  }

  const min = Math.min(row.cohort_p25, row.value);
  const max = Math.max(row.cohort_p75, row.value);
  const range = max - min || 1;
  const pad = range * 0.15;
  const scaleMin = min - pad;
  const scaleMax = max + pad;
  const scale = (v: number) => ((v - scaleMin) / (scaleMax - scaleMin)) * 100;

  const bandLeft = scale(row.cohort_p25);
  const bandWidth = scale(row.cohort_p75) - scale(row.cohort_p25);
  const medianLeft = scale(row.cohort_p50);
  const subjectLeft = scale(row.value);

  let positionColor = 'success.main';
  let positionBg = 'success.50';
  if (row.position.includes('below')) {
    positionColor = 'error.main';
    positionBg = 'error.50';
  } else if (row.position.includes('between p25')) {
    positionColor = 'warning.main';
    positionBg = 'warning.50';
  } else if (row.position.includes('between the median')) {
    positionColor = 'info.main';
    positionBg = 'info.50';
  }

  const ciLow = benchmark?.p50_ci_low;
  const ciHigh = benchmark?.p50_ci_high;
  const ciLeft = ciLow != null && !isNaN(ciLow) ? scale(ciLow) : null;
  const ciRight = ciHigh != null && !isNaN(ciHigh) ? scale(ciHigh) : null;

  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Typography sx={{ minWidth: 220, fontSize: '0.875rem', fontWeight: 500 }}>{row.label}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1,
              bgcolor: positionBg,
              border: '1px solid',
              borderColor: positionColor,
            }}
          >
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: positionColor, lineHeight: 1.2 }}>
              {fmt(row.value)}
            </Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {row.position}
        </Typography>
      </Box>

      <Box sx={{ position: 'relative', height: 28, ml: '220px', mr: 2 }}>
        {/* Track background */}
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 8,
            bottom: 8,
            bgcolor: 'grey.200',
            borderRadius: 5,
          }}
        />
        {/* Quartile band */}
        <Tooltip title={`Cohort p25–p75: ${fmt(row.cohort_p25)} – ${fmt(row.cohort_p75)}`} arrow>
          <Box
            sx={{
              position: 'absolute',
              left: `${bandLeft}%`,
              width: `${bandWidth}%`,
              top: 4,
              bottom: 4,
              bgcolor: 'primary.100',
              border: '1px solid',
              borderColor: 'primary.200',
              borderRadius: 1,
              cursor: 'pointer',
            }}
          />
        </Tooltip>
        {/* CI shading for median */}
        {ciLeft != null && ciRight != null && (
          <Tooltip title={`Median 95% CI: ${fmt(ciLow!)} – ${fmt(ciHigh!)}`} arrow>
            <Box
              sx={{
                position: 'absolute',
                left: `${ciLeft}%`,
                width: `${Math.max(ciRight - ciLeft, 0.5)}%`,
                top: 6,
                bottom: 6,
                bgcolor: 'primary.200',
                opacity: 0.5,
                borderRadius: 0.5,
                cursor: 'pointer',
              }}
            />
          </Tooltip>
        )}
        {/* Median line */}
        <Tooltip title={`Cohort median: ${fmt(row.cohort_p50)}`} arrow>
          <Box
            sx={{
              position: 'absolute',
              left: `${medianLeft}%`,
              top: 2,
              bottom: 2,
              width: 3,
              bgcolor: 'primary.main',
              borderRadius: 1,
              cursor: 'pointer',
            }}
          />
        </Tooltip>
        {/* Subject marker */}
        <Tooltip title={`Your value: ${fmt(row.value)}`} arrow>
          <Box
            sx={{
              position: 'absolute',
              left: `calc(${subjectLeft}% - 7px)`,
              top: 3,
              width: 14,
              height: 22,
              bgcolor: positionColor,
              borderRadius: '50%',
              border: '3px solid',
              borderColor: 'background.paper',
              boxShadow: 1,
              cursor: 'pointer',
            }}
          />
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', ml: '220px', mr: 2, mt: 0.5, justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.disabled">
          p25: {fmt(row.cohort_p25)}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          median: {fmt(row.cohort_p50)}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          p75: {fmt(row.cohort_p75)}
        </Typography>
      </Box>
    </Box>
  );
}
