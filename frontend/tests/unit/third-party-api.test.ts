import { expect, it, vi } from 'vitest';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import { ApplicationError } from '@/shared/application/application-error';
import { createThirdPartyApi } from '@/modules/third-party-management/infrastructure/http-third-parties';
import type { ThirdPartyTransport } from '@/modules/third-party-management/application/third-party-api';
import type { ThirdPartyRecord } from '@/modules/third-party-management/domain/third-party';

const companyId = 'a'.repeat(24);
const thirdPartyId = 'b'.repeat(24);
const companyScope: PermissionScope = { kind: 'organization', companyId, thirdPartyId: null };
const record: ThirdPartyRecord = {
  version: '2',
  relationship: { companyId, thirdPartyId, status: 'ACTIVE', version: '1', createdAt: null, updatedAt: '2026-11-18T12:00:00.000Z', createdBy: null, updatedBy: null },
  thirdParty: {
    id: thirdPartyId, documentType: 'NIT', documentNumber: '001', verificationDigit: null, businessName: 'Tercero Andino', tradeName: null,
    email: 'contacto@example.invalid', phone: null, address: null, country: 'Colombia', department: null, city: null, status: 'ACTIVE',
    createdAt: '2026-11-17T12:00:00.000Z', updatedAt: '2026-11-18T12:00:00.000Z', createdBy: 'admin-1', updatedBy: null,
  },
};

function fixture(response: unknown = { items: [record], page: 1, pageSize: 20, total: 1 }) {
  const transport: ThirdPartyTransport = { thirdParty: vi.fn(async () => response) };
  return { api: createThirdPartyApi(transport), transport };
}

it('builds company-scoped list requests and validates the returned page', async () => {
  const f = fixture();
  await expect(f.api.list(companyScope, { page: '2', pageSize: '10', q: 'Tercero' }, AbortSignal.abort())).resolves.toMatchObject({ items: [record], total: 1 });
  expect(f.transport.thirdParty).toHaveBeenCalledWith('GET', 'third-parties', expect.stringContaining('scope=organization'), undefined, expect.any(AbortSignal));
  expect(f.transport.thirdParty).toHaveBeenCalledWith('GET', 'third-parties', expect.stringContaining(`companyId=${companyId}`), undefined, expect.any(AbortSignal));
});

it('sends an optimistic version and rejects malformed or out-of-scope data', async () => {
  const f = fixture(record);
  const signal = AbortSignal.abort();
  await f.api.update(companyScope, thirdPartyId, '2', { city: 'Bogotá' }, signal);
  expect(f.transport.thirdParty).toHaveBeenCalledWith('PATCH', `third-parties/${thirdPartyId}`, expect.stringContaining(`companyId=${companyId}`), { expectedVersion: '2', changes: { city: 'Bogotá' } }, signal);

  const malformed = fixture({ ...record, thirdParty: { ...record.thirdParty, secretToken: 'must-not-pass' } });
  await expect(malformed.api.get(companyScope, thirdPartyId, AbortSignal.abort())).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(() => f.api.list({ kind: 'self', companyId: null, thirdPartyId: null }, {}, AbortSignal.abort())).toThrow(ApplicationError);
  expect(malformed.transport.thirdParty).toHaveBeenCalledOnce();
  expect(f.transport.thirdParty).toHaveBeenCalledOnce();
});

it('propagates non-JSON transport failures and timeouts, and rejects malformed payloads', async () => {
  const nonJson = fixture(Promise.reject(new ApplicationError('INVALID_RESPONSE')));
  await expect(nonJson.api.list(companyScope, {}, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });

  const timedOut = fixture(Promise.reject(new ApplicationError('TIMEOUT')));
  await expect(timedOut.api.get(companyScope, thirdPartyId, new AbortController().signal)).rejects.toMatchObject({ code: 'TIMEOUT' });

  const malformed = fixture({ items: [{ ...record, thirdParty: { ...record.thirdParty, email: 'not-an-email' } }], page: 1, pageSize: 20, total: 1 });
  await expect(malformed.api.list(companyScope, {}, new AbortController().signal)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});
