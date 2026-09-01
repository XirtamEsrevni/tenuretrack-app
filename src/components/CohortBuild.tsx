import { useEffect, useRef } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import type { ProgressEvent } from '../types';

interface Props {
  progress: ProgressEvent[];
  building: boolean;
  error: string | null;
  onRun: () => void;
  onBack: () => void;
}

export default function CohortBuild({ progress, building, error, onRun, onBack }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress]);

  const stages = [...new Set(progress.map((p) => p.stage))];

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Build your cohort
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        TenureTrack will fetch authors and works from OpenAlex, estimate career starts, compute
        metrics, and assemble your report. This can take a while — especially without an API key.
        Your progress is cached in this browser, so you can refresh and resume.
      </Typography>

      {!building && progress.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body1" sx={{ mb: 3 }}>
            Ready to build. Click below to start fetching from OpenAlex.
          </Typography>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button onClick={onBack} color="inherit">
              Back
            </Button>
            <Button variant="contained" onClick={onRun} size="large">
              Start build
            </Button>
          </Box>
        </Paper>
      )}

      {(building || progress.length > 0) && (
        <Paper variant="outlined" sx={{ p: 0 }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
            {stages.map((s) => (
              <Chip
                key={s}
                label={s}
                size="small"
                color={
                  building && s === stages[stages.length - 1]
                    ? 'primary'
                    : 'default'
                }
                variant={progress.find((p) => p.stage === s) ? 'filled' : 'outlined'}
              />
            ))}
            {building && (
              <Typography variant="body2" color="primary" sx={{ ml: 'auto' }}>
                Working...
              </Typography>
            )}
          </Box>

          <Box ref={logRef} sx={{ p: 2, maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace' }}>
            {progress.map((evt, i) => (
              <Box key={i} sx={{ py: 0.5, display: 'flex', gap: 1 }}>
                <Typography
                  component="span"
                  sx={{
                    fontSize: '0.85rem',
                    color: 'text.disabled',
                    minWidth: 40,
                    fontFamily: 'monospace',
                  }}
                >
                  {String(i + 1).padStart(3, '0')}
                </Typography>
                <Box>
                  <Typography component="span" sx={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
                    {evt.message}
                  </Typography>
                  {evt.detail && (
                    <Typography
                      component="span"
                      sx={{ fontSize: '0.85rem', color: 'text.secondary', ml: 1, fontFamily: 'monospace' }}
                    >
                      ({evt.detail})
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {!building && (progress.length > 0 || error) && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
          <Button onClick={onBack} color="inherit">
            Back
          </Button>
          <Button variant="contained" onClick={onRun} size="large">
            {error ? 'Try again' : 'Resume build'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
