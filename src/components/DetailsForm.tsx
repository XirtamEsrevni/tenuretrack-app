import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import InfoIcon from '@mui/icons-material/Info';
import Link from '@mui/material/Link';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CircularProgress from '@mui/material/CircularProgress';
import Fade from '@mui/material/Fade';
import type { UserDetails } from '../types';

interface Props {
  onSubmit: (details: UserDetails) => void;
  onLoadExample: () => void;
  error: string | null;
  loading?: boolean;
  loadingMessage?: string;
}

const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DetailsForm({ onSubmit, onLoadExample, error, loading, loadingMessage }: Props) {
  const [email, setEmail] = useState('');
  const [orcid, setOrcid] = useState('');
  const [university, setUniversity] = useState('');
  const [startYear, setStartYear] = useState('');
  const [clockExtension, setClockExtension] = useState('0');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = {
    email: !email ? '' : !EMAIL_RE.test(email) ? 'Enter a valid email address' : '',
    orcid: !orcid ? '' : !ORCID_RE.test(orcid) ? 'Format: 0000-0000-0000-0000' : '',
    university: !university ? '' : '',
    startYear: !startYear ? '' : (Number(startYear) < 1970 || Number(startYear) > 2030) ? 'Enter a year between 1970 and 2030' : '',
    apiKey: !apiKey ? '' : '',
  };

  const hasErrors = Object.values(errors).some((e) => e !== '');
  const hasEmpty = !email || !orcid || !university || !startYear;

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors || hasEmpty) return;
    onSubmit({
      email,
      orcid,
      university,
      startYear: Number(startYear),
      clockExtensionYears: Number(clockExtension) || 0,
      apiKey,
    });
  };

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Your details
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        TenureTrack builds a comparison cohort from OpenAlex and shows where your record falls.
        Nothing you enter here is saved to any server or database.
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Your OpenAlex API key never leaves this browser tab.</strong> It is held in
          memory only for as long as the tab is open and is discarded when you close it. It is
          never written to local storage, cookies, or any database.
        </Typography>
      </Alert>

      <Paper variant="outlined" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <TextField
            label="Email (for OpenAlex polite pool)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={touched && !!errors.email}
            helperText={touched ? errors.email : 'Used only in the API request to OpenAlex; not stored.'}
            type="email"
            fullWidth
          />

          <TextField
            label="ORCID"
            value={orcid}
            onChange={(e) => setOrcid(e.target.value)}
            error={touched && !!errors.orcid}
            helperText={touched ? errors.orcid : 'Format: 0000-0000-0000-0000'}
            placeholder="0000-0000-0000-0000"
            fullWidth
          />

          <TextField
            label="University"
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            error={touched && !!errors.university}
            helperText={touched ? errors.university : 'The institution where your appointment is held.'}
            fullWidth
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Appointment start year"
              value={startYear}
              onChange={(e) => setStartYear(e.target.value)}
              error={touched && !!errors.startYear}
              helperText={touched ? errors.startYear : 'The year your tenure clock started.'}
              type="number"
              sx={{ flex: 1 }}
            />
            <TextField
              label="Clock extension years"
              value={clockExtension}
              onChange={(e) => setClockExtension(e.target.value)}
              helperText="Stopped-clock years not counted."
              type="number"
              sx={{ flex: 1 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="If your tenure clock was stopped (e.g., for parental leave or a pandemic), enter the number of years here. They are subtracted from your career year so the comparison is fair.">
                      <InfoIcon color="action" fontSize="small" />
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          </Box>

          <TextField
            label="OpenAlex API key (optional but recommended)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            type={showKey ? 'text' : 'password'}
            helperText={
              <>
                Get a free key at{' '}
                <Link href="https://openalex.org/settings/api" target="_blank" rel="noopener">
                  openalex.org/settings/api
                </Link>
                . Without one, the build may take multiple sessions.
              </>
            }
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowKey(!showKey)} edge="end">
                    {showKey ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button onClick={onLoadExample} color="inherit" disabled={loading}>
            View example report
          </Button>
          <Button variant="contained" onClick={handleSubmit} size="large" disabled={loading}>
            {loading ? 'Working...' : 'Continue'}
          </Button>
        </Box>

        <Fade in={loading}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
            <CircularProgress size={24} />
            <Box>
              <Typography variant="body2" color="primary" fontWeight={500}>
                {loadingMessage || 'Resolving your ORCID with OpenAlex...'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                This may take a few seconds while we look up your record.
              </Typography>
            </Box>
          </Box>
        </Fade>
      </Paper>
    </Box>
  );
}
