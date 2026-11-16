import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { CompanyPage } from '@/modules/company-management/presentation/company-page';
import type { CompanyRecord } from '@/modules/company-management/domain/company';

const scope: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const snapshot = (target: PermissionScope) => ({ subject: 'browser-test', scope: target, roles: ['APP_ADMIN'] as const, permissions: ['companies:read', 'companies:create', 'companies:update', 'companies:deactivate'] as const, policyVersion: '1', contextRevision: null, evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const });
let sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
const session: SessionPort = { snapshot: () => sessionState, subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => { sessionState = { status: 'error' }; } };
const authorization = createAuthorizationStore(async target => snapshot(target), session, { automatic: false, visible: () => true });
void authorization.getState().setContext(scope);
const company: CompanyRecord['company'] = { id: '0123456789abcdef01234567', documentType: 'NIT', documentNumber: '000123', verificationDigit: null, businessName: 'Empresa de prueba', tradeName: 'Prueba', email: 'contact@example.com', phone: null, address: null, country: 'Colombia', department: 'Cundinamarca', city: 'Bogotá', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'browser-test', updatedBy: null };
const record: CompanyRecord = { company, version: '1' };
const api: CompanyApi = {
  list: async () => ({ items: [record], page: 1, pageSize: 20, total: 1 }), get: async () => record,
  create: async () => record, update: async () => record, status: async () => ({ ...record, company: { ...company, status: 'INACTIVE' } }),
};
const context = { register: () => () => {}, capture: () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: () => {} }) } as unknown as ContextStore;

createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/companies']}><Routes>
  <Route path="/companies" element={<CompanyPage api={api} context={context} authorization={authorization} mode="list" />} />
  <Route path="/companies/new" element={<CompanyPage api={api} context={context} authorization={authorization} mode="create" />} />
  <Route path="/companies/:id" element={<CompanyPage api={api} context={context} authorization={authorization} mode="detail" />} />
</Routes></MemoryRouter>);
