import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { Alert, Stack, Typography } from '@mui/material';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';

export function GlobalRolePolicyContextGuard({ context, children }: { context: ContextStore; children: ReactNode }) {
  const state = useStore(context);
  if (state.status !== 'ready' || !state.activeContext) return null;
  if (state.activeContext.kind !== 'GLOBAL') return <Stack spacing={2}>
    <Typography component="h1" variant="h4">Acceso denegado</Typography>
    <Alert severity="warning">Roles y permisos solo está disponible en el contexto GLOBAL.</Alert>
  </Stack>;
  return children;
}
