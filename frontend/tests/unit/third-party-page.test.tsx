import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { createStore } from 'zustand/vanilla';
import { createAuthorizationStore, type AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { ThirdPartyPage } from '@/modules/third-party-management/presentation/third-party-page';
import type { ThirdPartyApi } from '@/modules/third-party-management/application/third-party-api';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import type { ThirdParty, ThirdPartyRecord } from '@/modules/third-party-management/domain/third-party';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { SessionPort, SessionSnapshot } from '@/modules/authentication/application/session-ports';
import type { Permission, PermissionScope } from '@/modules/authentication/domain/permissions';
import { RequestError } from '@/shared/application/request-error';

const globalScope: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const profile: ThirdParty = { id: 'b'.repeat(24), documentType: 'NIT', documentNumber: '001', verificationDigit: '3', businessName: 'Tercero Andino', tradeName: null, email: 'contact@example.com', phone: null, address: null, country: 'Colombia', department: null, city: 'Bogotá', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'actor', updatedBy: null };
const record: ThirdPartyRecord = { thirdParty: profile, version: '1', relationship: null };
const permissions: readonly Permission[] = ['third-parties:read', 'third-parties:create', 'third-parties:update', 'third-parties:deactivate'];
const authorizationStores: AuthorizationStore[] = [];

function setup(apiOverride: ThirdPartyApi) {
  const snapshot = (scope: PermissionScope) => ({ subject: 'actor', scope, roles: ['APP_ADMIN'] as const, permissions, policyVersion: '1', contextRevision: null, evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 as const });
  let sessionState: SessionSnapshot = { status: 'authenticated', credentialRevision: 1 };
  const listeners = new Set<(state: SessionSnapshot) => void>();
  const session: SessionPort = { snapshot: () => sessionState, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => { sessionState = { status: 'error' }; listeners.forEach(listener => listener(sessionState)); } };
  const authorization = createAuthorizationStore(async scope => snapshot(scope), session, { automatic: false, visible: () => true });
  authorizationStores.push(authorization);
  let current = true;
  const captured = { scope: globalScope, signal: new AbortController().signal, isCurrent: () => current, release: vi.fn() };
  const contextState = createStore(() => ({ status: 'ready' as const, activeContext: null, availableContexts: { organizations: [], globalAvailable: true }, generation: 0, persistent: false,
    initialize: async () => {}, openSelector: async () => false, select: async () => {}, clear: async () => {} }));
  const context = Object.assign(contextState, { register: vi.fn(() => () => {}), capture: vi.fn(() => captured) }) as unknown as ContextStore;
  const renderPage = (_mode: 'list' | 'create' | 'detail' | 'edit', path: string, companies?: CompanyApi) => render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/third-parties" element={<ThirdPartyPage api={apiOverride} context={context} authorization={authorization} companies={companies} mode="list" />} />
    <Route path="/third-parties/new" element={<ThirdPartyPage api={apiOverride} context={context} authorization={authorization} companies={companies} mode="create" />} />
    <Route path="/third-parties/:id" element={<ThirdPartyPage api={apiOverride} context={context} authorization={authorization} companies={companies} mode="detail" />} />
    <Route path="/third-parties/:id/edit" element={<ThirdPartyPage api={apiOverride} context={context} authorization={authorization} companies={companies} mode="edit" />} />
  </Routes></MemoryRouter>);
  return { authorization, context, renderPage, invalidate: () => { current = false; } };
}

function api(overrides: Partial<ThirdPartyApi> = {}): ThirdPartyApi {
  return { list: vi.fn(async () => ({ items: [{ thirdParty: profile, version: '1', relationship: null }], page: 1, pageSize: 20, total: 1 })),
    get: vi.fn(async () => record), create: vi.fn(async () => record), update: vi.fn(async () => record), status: vi.fn(async () => record),
    getRelationship: vi.fn(async () => null), relationship: vi.fn(async () => record), ...overrides } as ThirdPartyApi;
}

afterEach(() => { cleanup(); authorizationStores.splice(0).forEach(store => store.dispose()); vi.restoreAllMocks(); });

it('filters the list, resets the page when search changes, and announces empty results', async () => {
  const user = userEvent.setup();
  const list = vi.fn(async (_scope: PermissionScope, query: Record<string, string>) => ({ items: query.q ? [] : [{ thirdParty: profile, version: '1', relationship: null }], page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 20), total: query.q ? 0 : 21 }));
  const f = setup(api({ list })); await act(() => f.authorization.getState().setContext(globalScope)); f.renderPage('list', '/third-parties');
  await screen.findAllByText('Tercero Andino');
  expect(list).toHaveBeenCalledWith(globalScope, expect.objectContaining({ page: '1', pageSize: '20', sort: 'businessName' }), expect.any(AbortSignal));
  await user.click(screen.getByRole('button', { name: 'Ir a la página 2' }));
  await waitFor(() => expect(list.mock.calls.at(-1)?.[1].page).toBe('2'));
  await user.click(screen.getByRole('button', { name: 'Filtro' }));
  await user.type(await screen.findByRole('textbox', { name: 'Buscar por nombre o documento' }), 'inexistente');
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
  await waitFor(() => expect(list.mock.calls.at(-1)?.[1]).toMatchObject({ q: 'inexistente', page: '1' }));
  expect(await screen.findByText('No hay terceros que coincidan con la consulta.')).toBeTruthy();
}, 15000);

it('discards an old list response after a newer search completes', async () => {
  const user = userEvent.setup();
  let resolveInitial!: (value: { items: { thirdParty: ThirdParty; version: string; relationship: null }[]; page: number; pageSize: number; total: number }) => void;
  const stale = { ...profile, id: 'c'.repeat(24), businessName: 'Resultado obsoleto' };
  const current = { ...profile, id: 'd'.repeat(24), businessName: 'Resultado vigente' };
  const list = vi.fn(async (_scope: PermissionScope, query: Record<string, string>) => query.q
    ? { items: [{ thirdParty: current, version: '1', relationship: null }], page: 1, pageSize: 20, total: 1 }
    : await new Promise<{ items: { thirdParty: ThirdParty; version: string; relationship: null }[]; page: number; pageSize: number; total: number }>(resolve => { resolveInitial = resolve; }));
  const f = setup(api({ list })); await act(() => f.authorization.getState().setContext(globalScope)); f.renderPage('list', '/third-parties');
  await waitFor(() => expect(list).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Filtro' }));
  await user.type(await screen.findByRole('textbox', { name: 'Buscar por nombre o documento' }), 'vigente');
  await user.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
  expect((await screen.findAllByText('Resultado vigente')).length).toBeGreaterThan(0);
  await act(async () => resolveInitial({ items: [{ thirdParty: stale, version: '1', relationship: null }], page: 1, pageSize: 20, total: 1 }));
  expect(screen.queryByText('Resultado obsoleto')).toBeNull();
}, 15000);

it('discards a list response after the active context invalidates its capture', async () => {
  let resolveList!: (value: { items: { thirdParty: ThirdParty; version: string; relationship: null }[]; page: number; pageSize: number; total: number }) => void;
  const list = vi.fn(async () => await new Promise<{ items: { thirdParty: ThirdParty; version: string; relationship: null }[]; page: number; pageSize: number; total: number }>(resolve => { resolveList = resolve; }));
  const f = setup(api({ list })); await act(() => f.authorization.getState().setContext(globalScope)); f.renderPage('list', '/third-parties');
  await waitFor(() => expect(list).toHaveBeenCalled());
  f.invalidate();
  await act(async () => resolveList({ items: [{ thirdParty: profile, version: '1', relationship: null }], page: 1, pageSize: 20, total: 1 }));
  expect(screen.queryByText('Tercero Andino')).toBeNull();
  expect(vi.mocked(f.context.capture).mock.results[0].value.release).toHaveBeenCalledOnce();
}, 15000);

it('retries a failed list request', async () => {
  const user = userEvent.setup();
  const list = vi.fn().mockRejectedValueOnce(new RequestError('THIRD_PARTY_STORAGE_UNAVAILABLE')).mockResolvedValue({ items: [{ thirdParty: profile, version: '1', relationship: null }], page: 1, pageSize: 20, total: 1 });
  const f = setup(api({ list })); await act(() => f.authorization.getState().setContext(globalScope)); f.renderPage('list', '/third-parties');
  await user.click(await screen.findByRole('button', { name: 'Recargar datos' }));
  expect((await screen.findAllByText('Tercero Andino')).length).toBeGreaterThan(0);
  expect(list).toHaveBeenCalledTimes(2);
}, 15000);

it('keeps the submit disabled for incomplete data and preserves the draft when the user cancels', async () => {
  const user = userEvent.setup(); const create = vi.fn(async () => record); const f = setup(api({ create }));
  const companies = { list: vi.fn(async () => ({ items: [{ company: { id: 'company-1', businessName: 'Empresa Uno', documentNumber: '9001' }, version: '1' }], page: 1, pageSize: 5, total: 1 })) } as unknown as CompanyApi;
  await act(() => f.authorization.getState().setContext(globalScope)); f.renderPage('create', '/third-parties/new', companies);
  const dialog = await screen.findByRole('dialog', { name: 'Crear tercero' });
  const submit = within(dialog).getByRole('button', { name: 'Crear tercero' });
  expect(submit).toBeDisabled();
  await user.type(within(dialog).getByRole('textbox', { name: 'NIT' }), '900123');
  await user.type(within(dialog).getByRole('textbox', { name: 'Razón social' }), 'Borrador');
  await user.type(within(dialog).getByRole('textbox', { name: 'Correo electrónico' }), 'draft@example.com');
  await user.click(within(dialog).getByRole('button', { name: /Seleccionar empresa/ }));
  const companyPicker = await screen.findByRole('dialog', { name: 'Seleccionar empresa' });
  await user.click(within(companyPicker).getByRole('button', { name: /Empresa Uno/ }));
  await waitForElementToBeRemoved(companyPicker);
  expect(submit).toBeEnabled();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  expect(window.confirm).toHaveBeenCalledWith('¿Descartar los cambios y cerrar?');
  expect(within(dialog).getByRole('textbox', { name: 'Razón social' })).toHaveValue('Borrador');
  expect(create).not.toHaveBeenCalled();
}, 30000);
it('requires a fresh read after a version conflict before another edit can be submitted', async () => {
  const user = userEvent.setup();
  const refreshed = { ...record, version: '2', thirdParty: { ...profile, city: 'Cali' } };
  const get = vi.fn().mockResolvedValueOnce(record).mockResolvedValue(refreshed);
  const update = vi.fn().mockRejectedValueOnce(new RequestError('THIRD_PARTY_VERSION_CONFLICT')).mockResolvedValue(refreshed);
  const f = setup(api({ get, update })); await act(() => f.authorization.getState().setContext(globalScope)); f.renderPage('edit', `/third-parties/${profile.id}/edit`);
  await screen.findByLabelText('Ciudad'); await user.clear(screen.getByLabelText('Ciudad')); await user.type(screen.getByLabelText('Ciudad'), 'Medellín');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('El tercero o la relación cambió. Recarga los datos antes de volver a guardar.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled(); expect(update).toHaveBeenCalledTimes(1);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: 'Recargar datos' }));
  await waitFor(() => expect(screen.getByLabelText('Ciudad')).toHaveValue('Cali'));
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
  await user.clear(screen.getByLabelText('Ciudad')); await user.type(screen.getByLabelText('Ciudad'), 'Medellín');
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
  expect(update).toHaveBeenLastCalledWith(globalScope, profile.id, '2', expect.objectContaining({ city: 'Medellín' }), expect.any(AbortSignal));
}, 15000);

it('registers a dirty draft with the context guard and clears it on context change', async () => {
  const user = userEvent.setup(); const create = vi.fn(async () => record); const f = setup(api({ create }));
  await act(() => f.authorization.getState().setContext(globalScope)); f.renderPage('create', '/third-parties/new');
  await user.type(screen.getByRole('textbox', { name: 'Razón social' }), 'Borrador'); await waitFor(() => expect(f.context.register).toHaveBeenCalled());
  const participant = vi.mocked(f.context.register).mock.calls.map(([value]) => value).find(value => value.dirty()); expect(participant).toBeDefined(); if (!participant) throw new Error('El borrador no fue registrado como sucio.');
  act(() => participant.clear());
  expect(participant.dirty()).toBe(false); expect(screen.getByRole('textbox', { name: 'Razón social' })).toHaveValue(''); expect(create).not.toHaveBeenCalled();
}, 15000);
