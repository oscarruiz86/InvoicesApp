import { useEffect } from 'react';
import { Link } from 'react-router';
import { useStore } from 'zustand';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import type { HealthStore } from './health-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { errorMessage } from '@/shared/components/error-messages';

function HomeAccessCards({ authorization }: { authorization: AuthorizationStore }) {
  const auth = useStore(authorization);
  if (!auth.snapshot || (auth.status !== 'ready' && auth.status !== 'refreshing')) return null;
  const modules = [
    ...(auth.has('companies:read') ? [{ title: 'Empresas', description: 'Consulta y administra las empresas disponibles en tu contexto.', path: '/companies', action: 'Abrir empresas' }] : []),
    ...(auth.has('associations:read') ? [{ title: 'Usuarios', description: 'Consulta usuarios vinculados y administra sus accesos.', path: '/organization-memberships', action: 'Abrir usuarios' }] : []),
  ];
  return <>
    {modules.map(module => <Paper key={module.path} variant="outlined" sx={{ p: 2, minWidth: 0, minHeight: 148 }}><Stack spacing={1.5} sx={{ height: '100%', alignItems: 'flex-start' }}>
      <Typography component="h2" variant="h6">{module.title}</Typography>
      <Typography color="text.secondary" sx={{ flexGrow: 1 }}>{module.description}</Typography>
      <Button component={Link} to={module.path}>{module.action}</Button>
    </Stack></Paper>)}
  </>;
}

export function HomePage({ store, authorization }: { store: HealthStore; authorization?: AuthorizationStore }) {
  const { status, errorCode, check, cancel } = useStore(store);
  useEffect(() => { void check(); return cancel; }, [check, cancel]);
  return <Stack spacing={3}>
    <Box>
      <Typography component="h1" variant="h4">Inicio</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5 }}>Accesos disponibles para este rol y el contexto actual.</Typography>
    </Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      {authorization && <HomeAccessCards authorization={authorization} />}
      <Paper variant="outlined" sx={{ p: 2, minWidth: 0, minHeight: 148 }}><Stack spacing={1.5} sx={{ height: '100%', alignItems: 'flex-start' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%' }}>
          <Typography component="h2" variant="h6">Conexión con la API</Typography>
          <Chip size="small" label={status === 'success' ? 'Disponible' : status === 'loading' ? 'Consultando' : 'Por verificar'} color={status === 'success' ? 'success' : 'default'} />
        </Stack>
        <Typography color="text.secondary" sx={{ flexGrow: 1 }}>Estado del servicio que utiliza la aplicación.</Typography>
        {status === 'loading' && <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center' }} role="status"><CircularProgress size={20} aria-label="Consultando API" /><Typography>Consultando API…</Typography></Stack>}
        {status === 'success' && <Alert severity="success">API disponible</Alert>}
        {status === 'error' && <Alert severity="error"><strong>API no disponible.</strong> {errorMessage(errorCode)}</Alert>}
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button disabled={status === 'loading'} onClick={() => void check()}>{status === 'error' ? 'Reintentar conexión' : 'Comprobar conexión'}</Button>
          <Button component="a" href="/api/docs" target="_blank" rel="noreferrer">Documentación de la API</Button>
        </Stack>
      </Stack></Paper>
    </Box>
  </Stack>;
}
