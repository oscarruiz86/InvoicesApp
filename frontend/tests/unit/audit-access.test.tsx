import { render, screen } from '@testing-library/react';
import { createStore } from 'zustand/vanilla';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';
import { AuthorizedNavigation } from '@/modules/authentication/presentation/authorized-navigation';
import { ProtectedRoute } from '@/modules/authentication/presentation/permission-guard';
import { MarkerModuleContext } from '@/app/app';
import { markerModules } from '@/app/module-registry';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { AuthenticationStore } from '@/modules/authentication/presentation/authentication-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';

function renderRoute(permissions: readonly string[], contextKind: 'GLOBAL'|'ORGANIZATION') {
  const authorization = createStore(() => ({ status:'ready' as const, snapshot:{permissions}, expiresAt:Number.MAX_SAFE_INTEGER, has:(permission:string)=>permissions.includes(permission) })) as unknown as AuthorizationStore;
  const authentication = createStore(() => ({ status:'authenticated' as const, error:undefined, login:vi.fn() })) as unknown as AuthenticationStore;
  const context = createStore(() => ({ status:'ready' as const, activeContext: contextKind==='GLOBAL'?{kind:'GLOBAL' as const}:{kind:'ORGANIZATION' as const} })) as unknown as ContextStore;
  return render(<MemoryRouter initialEntries={['/audit']}><AuthorizedNavigation store={authorization} contextKind={contextKind} items={[{label:'Auditoría',path:'/audit',permission:'audit:read',context:'global'}]} />
    <Routes><Route path="/audit" element={<ProtectedRoute authentication={authentication} authorization={authorization} permission="audit:read"><MarkerModuleContext module={markerModules.find(item=>item.key==='audit')!} context={context}><h1>Historial seguro</h1></MarkerModuleContext></ProtectedRoute>} /></Routes></MemoryRouter>);
}

it('shows the audit route only for an authorized global context', async () => {
  renderRoute(['audit:read'],'GLOBAL');
  expect(screen.getByRole('link',{name:'Auditoría'})).toBeInTheDocument();
});

it('hides navigation and denies direct entry without the effective grant', () => {
  renderRoute([],'GLOBAL');
  expect(screen.queryByRole('link',{name:'Auditoría'})).not.toBeInTheDocument();
  expect(screen.queryByText('Historial seguro')).not.toBeInTheDocument();
});

it('rejects organizational context even if a stale client grant says allowed', () => {
  renderRoute(['audit:read'],'ORGANIZATION');
  expect(screen.queryByText('Historial seguro')).not.toBeInTheDocument();
  expect(screen.getByText('Auditoría solo está disponible en el contexto GLOBAL.')).toBeInTheDocument();
});
