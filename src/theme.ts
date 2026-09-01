import { createTheme } from '@mui/material/styles';
import { indigo, teal, grey } from '@mui/material/colors';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: indigo[700] },
    secondary: { main: teal[600] },
    background: {
      default: grey[50],
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', fontWeight: 500 } },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
  },
});

export default theme;
