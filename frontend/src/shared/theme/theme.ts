import { createTheme } from '@mui/material/styles';
export const theme = createTheme({
  palette: { primary: { main: '#17354a' }, secondary: { main: '#087f75' }, background: { default: '#f3f6f8', paper: '#ffffff' } },
  typography: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif', h3: { fontWeight: 700, letterSpacing: '-0.04em' }, button: { textTransform: 'none', fontWeight: 600 } },
  shape: { borderRadius: 16 },
  components: { MuiButton: { defaultProps: { disableElevation: true } }, MuiPaper: { defaultProps: { elevation: 0 } } },
});
