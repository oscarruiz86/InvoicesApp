import { createRoot } from 'react-dom/client';
import { createStore } from 'zustand/vanilla';
import { Button, CssBaseline, Stack, ThemeProvider } from '@mui/material';
import { theme } from '@/shared/theme/theme';
import { VehiclesPage } from '@/modules/fleet/presentation/vehicles-page';
import { createVehicleApi } from '@/modules/fleet/infrastructure/http-vehicles';
import { createProtectedHttp } from '@/modules/authentication/infrastructure/protected-http';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore, ContextParticipant } from '@/modules/organization-context/presentation/context-store';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { VehicleDto } from '@/modules/fleet/application/fleet-api';
const params = new URLSearchParams(location.search);
const driver = params.has('driver');
let selected: PermissionScope = { kind: 'organization', companyId: null, thirdPartyId: 'a'.repeat(24) };
const session: SessionPort = { snapshot: () => ({ status: 'authenticated', credentialRevision: 1 }), subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => {} };
const authorization = createAuthorizationStore(async scope => ({ subject: 'browser-test', scope, roles: driver ? ['DRIVER'] : ['THIRD_PARTY_ADMIN'], permissions: driver ? ['vehicles:read'] : ['vehicles:read', 'vehicles:create', 'vehicles:update', 'vehicles:deactivate'], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 }), session, { automatic: false });
await authorization.getState().setContext(selected);
let records: VehicleDto[] = [{ id: 'b'.repeat(24), thirdPartyId: selected.thirdPartyId!, plate: 'ABC123', internalNumber: '0001', propertyCardNumber: '000123', status: 'ACTIVE', version: 1, createdAt: '2026-11-19T00:00:00.000Z', updatedAt: '2026-11-19T00:00:00.000Z', createdBy: 'admin', updatedBy: 'admin', assignmentState: 'UNASSIGNED', currentDriver: null, currentDrivers: [] }];
const http = createProtectedHttp('/api', { getAccessToken: async () => 'test-token' }, session, async (input, init) => {
  const url = new URL(String(input)), method = init?.method ?? 'GET';
  const owner = url.searchParams.get('thirdPartyId');
  const record = records.find(r => url.pathname.includes(r.id) && r.thirdPartyId === owner);
  const error = (code: string, status: number) => Response.json({ error: { code, message: 'Prueba' } }, { status });
  if (driver && url.pathname.endsWith('/status')) return error('FORBIDDEN', 403);
  if (params.get('slow') === (method === 'GET' ? 'read' : 'write')) await new Promise(resolve => setTimeout(resolve, 600));
  if (method === 'GET') {
    if (url.pathname !== '/api/vehicles') return record ? Response.json(record) : error('RESOURCE_NOT_FOUND', 404);
    const q = (url.searchParams.get('q') ?? '').toUpperCase();
    const items = driver ? [] : records.filter(r => r.thirdPartyId === owner && (!q || [r.plate, r.internalNumber, r.propertyCardNumber].some(v => v.includes(q))));
    return Response.json({ items, total: items.length, page: Number(url.searchParams.get('page') ?? 1), pageSize: Number(url.searchParams.get('pageSize') ?? 20) });
  }
  const body = JSON.parse(String(init?.body));
  if (url.pathname.endsWith('/status')) {
    if (!record) return error('RESOURCE_NOT_FOUND', 404);
    if (body.expectedVersion !== record.version) return error('VEHICLE_VERSION_CONFLICT', 409);
    const next = { ...record, status: body.status, version: record.version + 1, assignmentState: 'UNASSIGNED' as const };
    records = records.map(r => r.id === next.id ? next : r); return Response.json(next);
  }
  const fields = body.changes ?? body;
  if (Object.values(fields).includes('DUP123')) return error('VEHICLE_IDENTIFIER_CONFLICT', 409);
  if (params.has('conflict')) return error('VEHICLE_VERSION_CONFLICT', 409);
  if (method === 'POST') {
    const next = { ...records[0], ...fields, id: 'c'.repeat(24), thirdPartyId: owner!, version: 1 };
    records = [...records, next]; return Response.json(next, { status: 201 });
  }
  if (!record) return error('RESOURCE_NOT_FOUND', 404);
  const next = { ...record, ...fields, version: record.version + 1 }; records = records.map(r => r.id === next.id ? next : r); return Response.json(next);
});
http.subscribeForbidden(() => authorization.getState().invalidate());
const state = createStore(() => ({ status: 'ready' as const, generation: 1 }));
const participants = new Set<ContextParticipant>(), requests = new Set<AbortController>();
const context = Object.assign(state, { register: (p: ContextParticipant) => { participants.add(p); return () => { participants.delete(p); }; }, capture: () => {
  const generation = state.getState().generation, scope = selected, controller = new AbortController(); requests.add(controller);
  return { scope, signal: controller.signal, release: () => { requests.delete(controller); }, isCurrent: () => generation === state.getState().generation && !controller.signal.aborted };
} }) as unknown as ContextStore;
async function change() {
  requests.forEach(c => c.abort()); participants.forEach(p => p.clear()); selected = { ...selected, thirdPartyId: 'd'.repeat(24) };
  state.setState(s => ({ generation: s.generation + 1 })); await authorization.getState().setContext(selected);
}
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><Stack spacing={2} sx={{ p: 2, minWidth: 0 }}><Button onClick={() => void change()}>Cambiar tercero</Button><VehiclesPage api={createVehicleApi(http)} authorization={authorization} context={context} /></Stack></ThemeProvider>);
