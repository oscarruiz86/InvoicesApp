import { useEffect } from 'react';
import { useStore } from 'zustand';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material';
import type { HealthStore } from './health-store';
import { errorMessage } from '@/shared/components/error-messages';

export function HomePage({ store }: { store: HealthStore }) {
  const { status, errorCode, check, cancel } = useStore(store);
  useEffect(() => { void check(); return cancel; }, [check, cancel]);
  return <Stack spacing={4}>
    <Box><Typography variant="overline" color="secondary" sx={{ fontWeight: 700, letterSpacing: 2 }}>Fundamentos</Typography>
      <Typography component="h1" variant="h3" sx={{ fontSize: { xs: '2.2rem', md: '3.2rem' }, mt: 1 }}>Todo empieza con una buena base.</Typography>
      <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 650, fontSize: '1.1rem' }}>Bienvenido a Invoices App. Estamos preparando un espacio claro y organizado para tu operación.</Typography>
    </Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' }, gap: 3 }}>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, minWidth: 0 }}><Stack spacing={3}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}><Typography component="h2" variant="h6">Conexión con la API</Typography><Chip size="small" label={status === 'success' ? 'Disponible' : status === 'loading' ? 'Consultando' : 'Por verificar'} color={status === 'success' ? 'success' : 'default'} /></Stack>
        <Typography color="text.secondary">Comprueba que la aplicación puede comunicarse con el servicio.</Typography>
        {status === 'loading' && <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }} role="status"><CircularProgress size={22} aria-label="Consultando API" /><Typography>Consultando API…</Typography></Stack>}
        {status === 'success' && <Alert severity="success">API disponible</Alert>}
        {status === 'error' && <Alert severity="error"><strong>API no disponible.</strong> {errorMessage(errorCode)}</Alert>}
        <Box><Button variant="contained" disabled={status === 'loading'} onClick={() => void check()}>{status === 'error' ? 'Reintentar conexión' : 'Comprobar conexión'}</Button></Box>
      </Stack></Paper>
      <Paper variant="outlined" sx={{ p: { xs: 3, md: 4 }, bgcolor: 'primary.main', color: 'white', minWidth: 0 }}><Stack spacing={2}>
        <Chip label="Pantalla provisional" size="small" sx={{ alignSelf: 'flex-start', bgcolor: '#ffffff20', color: 'white' }} />
        <Typography component="h2" variant="h5" sx={{ fontWeight: 600 }}>Un punto de partida, con espacio para crecer.</Typography>
        <Typography sx={{ opacity: .8 }}>Las funcionalidades de organizaciones, vehículos y facturas se incorporarán en próximos incrementos.</Typography>
        <Divider sx={{ borderColor: '#ffffff30' }} />
        <Button component="a" href="/api/docs" target="_blank" rel="noreferrer" sx={{ alignSelf: 'flex-start', color: 'white' }}>Consultar documentación de la API ↗</Button>
      </Stack></Paper>
    </Box>
  </Stack>;
}
