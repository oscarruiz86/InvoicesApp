import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import { PageHeader } from '@/shared/components/page-header';

export function LandingPage({ authentication }: { authentication: AuthenticationStore }) {
  return <Box component="section" sx={{ minHeight: '100dvh', display: 'grid', alignItems: 'center', px: { xs: 2, sm: 4 }, py: { xs: 5, md: 8 }, background: theme => `linear-gradient(135deg, ${theme.palette.background.default} 0%, ${theme.palette.action.hover} 100%)` }}>
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: 920, mx: 'auto', p: { xs: 3, sm: 5, md: 7 } }}>
      <Stack spacing={3}>
        <PageHeader title="Invoices App" description="Gestiona empresas, terceros, vehículos, asignaciones e invitaciones desde un solo lugar." />
        <Typography color="text.secondary" sx={{ maxWidth: 650 }}>Consulta la información de tu organización y administra los procesos operativos con los permisos de tu cuenta.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <Button variant="contained" size="large" onClick={() => void authentication.getState().login('/')}>Iniciar sesión</Button>
        </Stack>
      </Stack>
    </Paper>
  </Box>;
}
