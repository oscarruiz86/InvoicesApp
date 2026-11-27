import { createRoot } from 'react-dom/client';
import { Alert, CssBaseline, ThemeProvider } from '@mui/material';
import { createStore } from 'zustand/vanilla';
import { MemoryRouter, Route, Routes } from 'react-router';
import { theme } from '@/shared/theme/theme';
import { AuthorizedNavigation } from '@/modules/authentication/presentation/authorized-navigation';
import { ProtectedRoute } from '@/modules/authentication/presentation/permission-guard';
import { MarkerModuleContext } from '@/app/app';
import { markerModules } from '@/app/module-registry';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';

const params = new URLSearchParams(location.search);
const role = params.get('role') ?? 'APP_ADMIN';
const contextKind = params.get('context') === 'ORGANIZATION' ? 'ORGANIZATION' : 'GLOBAL';
const permissions = role === 'APP_ADMIN' ? ['audit:read'] : [];
const authorization = createStore(() => ({ status:'ready' as const, snapshot:{permissions}, expiresAt:Number.MAX_SAFE_INTEGER, has:(permission:string)=>permissions.includes(permission) })) as unknown as AuthorizationStore;
const authentication = createStore(() => ({ status:'authenticated' as const, error:undefined, login:async()=>{} })) as unknown as AuthenticationStore;
const context = createStore(() => ({ status:'ready' as const, activeContext: contextKind==='GLOBAL'?{kind:'GLOBAL' as const}:{kind:'ORGANIZATION' as const} })) as unknown as ContextStore;
const module = markerModules.find(item=>item.key==='audit')!;
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><MemoryRouter initialEntries={['/audit']}>
  <AuthorizedNavigation store={authorization} contextKind={contextKind} items={[{label:'Auditoría',path:'/audit',permission:'audit:read',context:'global'}]} />
  <Routes><Route path="/audit" element={<ProtectedRoute authentication={authentication} authorization={authorization} permission="audit:read"><MarkerModuleContext module={module} context={context}><h1>Historial seguro</h1></MarkerModuleContext></ProtectedRoute>} /></Routes>
  <Alert severity="info">Rol de prueba: {role}</Alert>
</MemoryRouter></ThemeProvider>);
