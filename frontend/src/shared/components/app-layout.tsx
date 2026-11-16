import type { ReactNode } from 'react';
import { AppBar, Box, Chip, Container, Stack, Toolbar, Typography } from '@mui/material';
export function AppLayout({ children }: { children: ReactNode }) {
  return <Box sx={{ minHeight: '100dvh' }}>
    <AppBar position="static" elevation={0} color="transparent" sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Container maxWidth="lg"><Toolbar disableGutters sx={{ gap: 2, minHeight: 76 }}>
        <Box aria-hidden="true" sx={{ bgcolor: 'primary.main', color: 'white', borderRadius: 2, p: 1.2, fontWeight: 800 }}>IA</Box>
        <Typography sx={{ flexGrow: 1, fontWeight: 700, color: 'primary.main' }}>Invoices App</Typography>
        <Chip label="Desarrollo" size="small" variant="outlined" />
      </Toolbar></Container>
    </AppBar>
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>{children}</Container>
    <Container component="footer" maxWidth="lg" sx={{ py: 3 }}><Stack><Typography variant="caption" color="text.secondary">Invoices App · Fundamentos técnicos</Typography></Stack></Container>
  </Box>;
}
