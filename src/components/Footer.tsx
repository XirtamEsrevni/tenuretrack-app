import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        py: 3,
        px: 2,
        mt: 'auto',
        textAlign: 'center',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        TenureTrack App — original concept by{' '}
        <Link href="https://chemistry.utah.edu/directory/sparks/" target="_blank" rel="noopener">
          Professor Taylor Sparks
        </Link>{' '}
        at the University of Utah. Source code:{' '}
        <Link href="https://github.com/sp8rks/tenuretrack" target="_blank" rel="noopener">
          github.com/sp8rks/tenuretrack
        </Link>
        .
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        This independent app is not affiliated with, endorsed by, or sanctioned by Professor Taylor Sparks or the University of Utah.
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Data: <Link href="https://openalex.org" target="_blank" rel="noopener">OpenAlex</Link> (Priem, Piwowar &amp; Orr, 2022), CC0.
        Chaperone method: Sekara et al., <Link href="https://doi.org/10.1073/pnas.1800471115" target="_blank" rel="noopener">PNAS 2018</Link>.
      </Typography>
    </Box>
  );
}
