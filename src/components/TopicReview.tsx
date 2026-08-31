import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import type { Topic } from '../types';

interface Props {
  topics: Topic[];
  selectedIds: string[];
  onConfirm: (ids: string[]) => void;
  onBack: () => void;
}

export default function TopicReview({ topics, selectedIds, onConfirm, onBack }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleConfirm = () => {
    onConfirm([...selected]);
  };

  const selectedCount = selected.size;
  const showWarning = selectedCount < 2;

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto' }}>
      <Typography variant="h5" gutterBottom>
        Review your subfield topics
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        These are the OpenAlex topics found most often in your journal articles. The cohort will
        be built from other researchers who also publish in these topics. Select the ones that
        best describe your subfield.
      </Typography>

      {showWarning && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Select at least two topics for a meaningful cohort.
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        {topics.map((topic) => {
          const isSelected = selected.has(topic.id);
          return (
            <Paper
              key={topic.id}
              variant="outlined"
              sx={{
                p: 2,
                cursor: 'pointer',
                borderColor: isSelected ? 'primary.main' : 'divider',
                bgcolor: isSelected ? 'primary.50' : 'background.paper',
                transition: 'all 0.15s',
                '&:hover': { borderColor: 'primary.light' },
              }}
              onClick={() => toggle(topic.id)}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Checkbox checked={isSelected} edge="start" sx={{ mt: -0.5 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    {topic.name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                    <Chip
                      label={`${topic.paperCount} of your papers`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                    {topic.topVenues.slice(0, 3).map((v) => (
                      <Chip key={v} label={v} size="small" variant="outlined" />
                    ))}
                  </Box>
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onBack} color="inherit">
          Back
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          size="large"
          disabled={selectedCount < 2}
        >
          Build cohort ({selectedCount} topics)
        </Button>
      </Box>
    </Box>
  );
}
