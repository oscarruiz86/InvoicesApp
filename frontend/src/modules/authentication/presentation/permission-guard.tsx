import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { Alert, Button, Stack, Typography } from '@mui/material';
import type { Permission } from '../domain/permissions';
import type { AuthorizationStore } from './authorization-store';
import type { AuthenticationStore } from './authentication-store';
import { PrivateRoute } from './session-page';
import { errorMessage } from '@/shared/components/error-messages';

export function usePermission(store: AuthorizationStore, permission: Permission) {
  useStore(store);
  return store.getState().has(permission);
}
export function PermissionGuard({ store, permission, eligible = true, children, fallback = null }: { store: AuthorizationStore; permission: Permission; eligible?: boolean; children: ReactNode; fallback?: ReactNode }) {
  return usePermission(store, permission) && eligible ? children : fallback;
}
export function AuthorizationFeedback({ store }: { store: AuthorizationStore }) {
  const state = useStore(store);
  // Permission reads run silently. Protected content remains gated until its
  // first decision; same-scope refreshes retain the authorized screen.
  if (state.status === 'idle' || state.status === 'loading' || state.status === 'refreshing') return null;
  if (state.status === 'denied' || state.status === 'ready') return <Stack spacing={2}><Typography component="h1" variant="h4">Acceso denegado</Typography><Alert severity="warning">Acceso denegado.</Alert></Stack>;
  return <Stack spacing={2}><Typography component="h1" variant="h4">No se pudieron verificar los permisos</Typography><Alert severity="error">{errorMessage(state.error)}</Alert><Button onClick={() => void state.refresh()}>Reintentar permisos</Button></Stack>;
}
function PermissionRoute({ authorization, permission, children }: { authorization: AuthorizationStore; permission: Permission; children: ReactNode }) {
  useStore(authorization);
  const allowed = authorization.getState().has(permission);
  return allowed ? children : <AuthorizationFeedback store={authorization} />;
}
export function ProtectedRoute({ authentication, authorization, permission, children }: { authentication: AuthenticationStore; authorization: AuthorizationStore; permission: Permission; children: ReactNode }) {
  return <PrivateRoute store={authentication}><PermissionRoute authorization={authorization} permission={permission}>{children}</PermissionRoute></PrivateRoute>;
}
