import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createAuthorizationStore, type AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { createCompanyApi } from '@/modules/company-management/infrastructure/http-companies';
import type { CompanyTransport } from '@/modules/company-management/application/company-api';
import { CompanyPage } from '@/modules/company-management/presentation/company-page';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import type { CompanyRecord } from '@/modules/company-management/domain/company';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { Permission, PermissionScope } from '@/modules/authentication/domain/permissions';
import { RequestError } from '@/shared/application/request-error';

const globalScope: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const profile = { documentType: 'NIT', documentNumber: '001', verificationDigit: null, businessName: 'Empresa', tradeName: null, email: 'contact@example.com', phone: null, address: null, country: null, department: null, city: null };
const company = { ...profile, id: '0123456789abcdef01234567', status: 'ACTIVE' as const, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'actor', updatedBy: null };
const record: CompanyRecord = { company, version: '1' };
const responses = new Map<string, unknown>([['GET:companies', { items: [{ company, version: '1' }], page: 1, pageSize: 20, total: 1 }], ['GET:item', record], ['POST:companies', record], ['PATCH:item', record], ['POST:status', { ...record, company: { ...company, status: 'INACTIVE' } }]]);
const api: CompanyApi = createCompanyApi({ company: vi.fn(async (method, path) => responses.get(`${method}:${path === 'companies' ? 'companies' : path.endsWith('/status') ? 'status' : 'item'}`)) } as unknown as CompanyTransport);
const authorizationStores: AuthorizationStore[] = [];
function setup(apiOverride: CompanyApi = api, permissions: readonly Permission[] = ['companies:read', 'companies:create', 'companies:update', 'companies:deactivate']) {
  const snapshot = (scope: PermissionScope) => ({ subject: 'actor', scope, roles: ['APP_ADMIN'] as const, permissions, policyVersion: '1', contextRevision: null, evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const });
  let state: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 }; const listeners = new Set<(value: SessionSnapshot) => void>();
  const session: SessionPort = { snapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => { state = { status: 'error' }; listeners.forEach(listener => listener(state)); } };
  const authorization = createAuthorizationStore(async scope => snapshot(scope), session, { automatic: false, visible: () => true }); authorizationStores.push(authorization);
  let contextCurrent = true;
  const context = { register: vi.fn(() => () => {}), capture: vi.fn(() => ({ scope: globalScope, signal: new AbortController().signal, isCurrent: () => contextCurrent, release: vi.fn() })) } as unknown as ContextStore;
  const renderPage = (mode: 'list' | 'create' | 'detail' | 'edit', path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/companies" element={<CompanyPage api={apiOverride} context={context} authorization={authorization} mode={mode} />} />
    <Route path="/companies/new" element={<CompanyPage api={apiOverride} context={context} authorization={authorization} mode={mode} />} />
    <Route path="/companies/:id" element={<CompanyPage api={apiOverride} context={context} authorization={authorization} mode={mode} />} />
    <Route path="/companies/:id/edit" element={<CompanyPage api={apiOverride} context={context} authorization={authorization} mode={mode} />} />
  </Routes></MemoryRouter>);
  return { authorization, context, renderPage, invalidateContext: () => { contextCurrent = false; } };
}
afterEach(() => { cleanup(); authorizationStores.splice(0).forEach(store => store.dispose()); vi.restoreAllMocks(); });

it('renders scoped list filters and announces empty results', async () => {
  const user = userEvent.setup(); const f = setup(); await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('list', '/companies');
  await expect(screen.findByText('Empresa')).resolves.toBeTruthy();
  await user.type(screen.getByLabelText('Buscar por nombre o documento'), '001');
  await waitFor(() => expect(f.context.capture).toHaveBeenCalled());
}, 15000);

it('resets pagination when list filters change', async () => {
  const user = userEvent.setup();
  const list = vi.fn(async (_scope: PermissionScope, query: Record<string, string>) => ({ items: [{ company, version: '1' }], page: Number(query.page ?? 1), pageSize: 20, total: 21 }));
  const f = setup({ ...api, list });
  await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('list', '/companies');
  await screen.findByText('Empresa');
  await user.click(screen.getByRole('button', { name: 'Go to page 2' }));
  await waitFor(() => expect(list.mock.calls.at(-1)?.[1].page).toBe('2'));
  await user.type(screen.getByLabelText('Buscar por nombre o documento'), '001');
  await waitFor(() => expect(list.mock.calls.at(-1)?.[1]).toMatchObject({ page: '1', q: '001' }));
}, 15000);

it('discards a stale list response after a newer filter query completes', async () => {
  const user = userEvent.setup();
  let resolveInitial!: (value: { items: { company: typeof company; version: string }[]; page: number; pageSize: number; total: number }) => void;
  const stale: typeof company = { ...company, id: '1123456789abcdef01234567', businessName: 'Resultado obsoleto' };
  const current: typeof company = { ...company, id: '2123456789abcdef01234567', businessName: 'Resultado vigente' };
  const list = vi.fn(async (_scope: PermissionScope, query: Record<string, string>) => query.q
    ? { items: [{ company: current, version: '1' }], page: 1, pageSize: 20, total: 1 }
    : await new Promise<{ items: { company: typeof company; version: string }[]; page: number; pageSize: number; total: number }>(resolve => { resolveInitial = resolve; }));
  const f = setup({ ...api, list });
  await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('list', '/companies');
  await waitFor(() => expect(list).toHaveBeenCalled());
  await user.type(screen.getByLabelText('Buscar por nombre o documento'), 'vigente');
  expect(await screen.findByText('Resultado vigente')).toBeTruthy();
  await act(async () => resolveInitial({ items: [{ company: stale, version: '1' }], page: 1, pageSize: 20, total: 1 }));
  expect(screen.queryByText('Resultado obsoleto')).toBeNull();
}, 15000);

it('discards a company response after the captured organization context is invalidated', async () => {
  let resolveList!: (value: { items: { company: typeof company; version: string }[]; page: number; pageSize: number; total: number }) => void;
  const list = vi.fn(async () => await new Promise<{ items: { company: typeof company; version: string }[]; page: number; pageSize: number; total: number }>(resolve => { resolveList = resolve; }));
  const f = setup({ ...api, list });
  await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('list', '/companies');
  await waitFor(() => expect(list).toHaveBeenCalled());
  f.invalidateContext();
  await act(async () => resolveList({ items: [{ company, version: '1' }], page: 1, pageSize: 20, total: 1 }));
  expect(screen.queryByText('Empresa')).toBeNull();
  const capture = vi.mocked(f.context.capture).mock.results[0].value;
  expect(capture.release).toHaveBeenCalledOnce();
}, 15000);

it('lets the user retry a failed company list request', async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockRejectedValueOnce(new RequestError('COMPANY_STORAGE_UNAVAILABLE')).mockResolvedValue({ items: [{ company, version: '1' }], page: 1, pageSize: 20, total: 1 });
  const f = setup({ ...api, list });
  await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('list', '/companies');
  await user.click(await screen.findByRole('button', { name: 'Recargar datos' }));
  expect(await screen.findByText('Empresa')).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
}, 15000);

it('validates required fields and submits only validated company data', async () => {
  const user = userEvent.setup(); const create = vi.fn(async () => record); const f = setup({ ...api, create }); await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('create', '/companies/new');
  await user.click(screen.getByRole('button', { name: 'Guardar empresa' }));
  expect(await screen.findByText('Revisa los campos indicados.')).toBeTruthy(); expect(create).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText(/Número de documento/), '001'); await user.type(screen.getByLabelText(/Razón social/), 'Empresa nueva'); await user.type(screen.getByLabelText(/Correo electrónico/), ' CONTACT@example.com ');
  await user.click(screen.getByRole('button', { name: 'Guardar empresa' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(globalScope, expect.objectContaining({ businessName: 'Empresa nueva', documentNumber: '001' }), expect.any(AbortSignal)));
}, 15000);

it('keeps stale edits unsaved and offers an explicit reload after a version conflict', async () => {
  const user = userEvent.setup();
  const update = vi.fn(async () => { throw new RequestError('COMPANY_VERSION_CONFLICT'); });
  const f = setup({ ...api, get: vi.fn(async () => record), update });
  await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('edit', `/companies/${company.id}/edit`);
  await screen.findByLabelText(/Razón social/);
  await user.clear(screen.getByLabelText(/Razón social/));
  await user.type(screen.getByLabelText(/Razón social/), 'Cambio local');
  await user.click(screen.getByRole('button', { name: 'Guardar empresa' }));
  expect(await screen.findByText('La empresa cambió. Recarga los datos antes de volver a guardar.')).toBeTruthy();
  expect(screen.getByDisplayValue('Cambio local')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Recargar datos' })).toBeTruthy();
}, 15000);

it('requires confirmation and waits for the server before changing status', async () => {
  const user = userEvent.setup(); const status = vi.fn(async () => ({ ...record, company: { ...company, status: 'INACTIVE' as const } })); const get = vi.fn().mockResolvedValueOnce(record).mockResolvedValue({ ...record, company: { ...company, status: 'INACTIVE' as const } }); const f = setup({ ...api, get, status }); await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('detail', `/companies/${company.id}`);
  await user.click(await screen.findByRole('button', { name: 'Desactivar empresa' }));
  await user.click(screen.getByRole('button', { name: 'Cancelar' })); await waitForElementToBeRemoved(() => screen.queryByRole('dialog')); expect(status).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Desactivar empresa' })); await user.click(screen.getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(status).toHaveBeenCalledWith(globalScope, company.id, '1', 'INACTIVE', expect.any(AbortSignal)));
  expect(await screen.findByText('Inactiva')).toBeTruthy();
}, 15000);

it('keeps the active state visible when the server rejects a status change', async () => {
  const user = userEvent.setup();
  const status = vi.fn(async () => { throw new RequestError('COMPANY_VERSION_CONFLICT'); });
  const f = setup({ ...api, get: vi.fn(async () => record), status });
  await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('detail', `/companies/${company.id}`);
  await user.click(await screen.findByRole('button', { name: 'Desactivar empresa' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar' }));
  expect(await screen.findByText('La empresa cambió. Recarga los datos antes de volver a guardar.')).toBeTruthy();
  expect(screen.getByText('Activa')).toBeTruthy();
}, 15000);

it('registers the form with the context guard and exposes the draft as dirty', async () => {
  const user = userEvent.setup(); const f = setup(); await act(() => f.authorization.getState().setContext(globalScope));
  f.renderPage('create', '/companies/new');
  await waitFor(() => expect(f.context.register).toHaveBeenCalled());
  await user.type(screen.getByLabelText(/Razón social/), 'Borrador');
  const participant = vi.mocked(f.context.register).mock.calls[0][0];
  expect(participant.dirty()).toBe(true);
  act(() => participant.clear());
  expect(participant.dirty()).toBe(false);
}, 15000);
