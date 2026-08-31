import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import DescriptionIcon from '@mui/icons-material/Description';
import TableChartIcon from '@mui/icons-material/TableChart';
import type { ReportData } from '../types';
import { packageResults, downloadBlob } from '../lib/download';

interface Props {
  report: ReportData;
  onBack: () => void;
  onReset: () => void;
}

export default function DownloadStep({ report, onBack, onReset }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [packaging, setPackaging] = useState(false);

  const handleDownloadZip = async () => {
    setPackaging(true);
    setError(null);
    const { blob, guardrailPassed, violations } = await packageResults(report);
    setPackaging(false);
    if (!guardrailPassed) {
      setError(`Guardrail check failed: ${violations.join('; ')}`);
      return;
    }
    downloadBlob(blob, `${report.subjectName.replace(/\s+/g, '_')}_tenuretrack.zip`);
  };

  const files = [
    { name: 'report.md', icon: <DescriptionIcon />, desc: 'Full written report in Markdown' },
    { name: 'benchmarks.csv', icon: <TableChartIcon />, desc: 'Year-by-year quartiles with confidence intervals' },
    { name: 'subject.csv', icon: <TableChartIcon />, desc: 'Your values and cohort positions' },
    { name: 'venues.csv', icon: <TableChartIcon />, desc: 'Venue list with impact scores' },
    { name: 'funnel.csv', icon: <TableChartIcon />, desc: 'Cohort construction funnel' },
    { name: 'chaperone.csv', icon: <TableChartIcon />, desc: 'Chaperone effect analysis' },
  ];

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Download your results
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        All files are packaged as a zip. Before packaging, the system scans every output for
        individual author IDs, ORCIDs, and prescriptive language — if any are found, the download
        is blocked.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Files included:
        </Typography>
        <List dense>
          {files.map((f) => (
            <ListItem key={f.name}>
              <ListItemIcon sx={{ minWidth: 36 }}>{f.icon}</ListItemIcon>
              <ListItemText
                primary={f.name}
                secondary={f.desc}
                primaryTypographyProps={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                secondaryTypographyProps={{ fontSize: '0.8rem' }}
              />
            </ListItem>
          ))}
        </List>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onBack} color="inherit">
            Back to report
          </Button>
          <Button onClick={onReset} color="inherit">
            Start over
          </Button>
        </Box>
        <Button variant="contained" onClick={handleDownloadZip} disabled={packaging} size="large">
          {packaging ? 'Packaging...' : 'Download zip'}
        </Button>
      </Box>
    </Box>
  );
}
