import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { Alert, Button, Stack } from '@mui/material';
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
  if (state.status === 'idle' || state.status === 'loading') return <Alert severity="info" role="status">Verificando permisos…</Alert>;
  if (state.status === 'denied' || state.status === 'ready') return <Alert severity="warning">Acceso denegado.</Alert>;
  return <Stack spacing={2}><Alert severity="error">{errorMessage(state.error)}</Alert><Button onClick={() => void state.refresh()}>Reintentar permisos</Button></Stack>;
}
function PermissionRoute({ authorization, permission, children }: { authorization: AuthorizationStore; permission: Permission; children: ReactNode }) {
  const allowed = usePermission(authorization, permission);
  return allowed ? children : <AuthorizationFeedback store={authorization} />;
}
export function ProtectedRoute({ authentication, authorization, permission, children }: { authentication: AuthenticationStore; authorization: AuthorizationStore; permission: Permission; children: ReactNode }) {
  return <PrivateRoute store={authentication}><PermissionRoute authorization={authorization} permission={permission}>{children}</PermissionRoute></PrivateRoute>;
}
