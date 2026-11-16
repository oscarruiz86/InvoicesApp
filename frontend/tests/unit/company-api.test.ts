import { describe, expect, it, vi } from 'vitest';
import { createCompanyApi } from '@/modules/company-management/infrastructure/http-companies';
import type { CompanyTransport } from '@/modules/company-management/application/company-api';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
const company = { documentType: 'NIT', documentNumber: '001', verificationDigit: null, businessName: 'Empresa', tradeName: null, email: 'contact@example.com', phone: null, address: null, country: null, department: null, city: null, id: '0123456789abcdef01234567', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'actor', updatedBy: null };
const global: PermissionScope = { kind: 'global', companyId: null, thirdPartyId: null };
const local: PermissionScope = { kind: 'organization', companyId: company.id, thirdPartyId: null };
function setup(response: unknown = { items: [{ company, version: '1' }], page: 1, pageSize: 20, total: 1 }) {
  const transport: CompanyTransport = { company: vi.fn(async () => response) };
  return { api: createCompanyApi(transport), transport };
}
describe('company HTTP adapter', () => {
  it('sends global and selected company scope with list filters', async () => {
    const transport: CompanyTransport = { company: vi.fn(async (_method, path) => path === 'companies' ? { items: [{ company, version: '1' }], page: 1, pageSize: 20, total: 1 } : { company, version: '1' }) };
    const api = createCompanyApi(transport);
    await api.list(global, { page: '2', q: 'Empresa' }, new AbortController().signal);
    expect(transport.company).toHaveBeenCalledWith('GET', 'companies', expect.stringContaining('scope=global'), undefined, expect.any(AbortSignal));
    expect(transport.company).toHaveBeenCalledWith('GET', 'companies', expect.stringContaining('page=2'), undefined, expect.any(AbortSignal));
    await api.get(local, company.id, new AbortController().signal);
    expect(transport.company).toHaveBeenLastCalledWith('GET', `companies/${company.id}`, expect.stringContaining(`companyId=${company.id}`), undefined, expect.any(AbortSignal));
  });
  it('rejects self, third party and malformed returned resources at the boundary', async () => {
    const { api, transport } = setup();
    expect(() => api.list({ kind: 'self', companyId: null, thirdPartyId: null }, {}, new AbortController().signal)).toThrow('FORBIDDEN');
    expect(() => api.list({ kind: 'organization', companyId: company.id, thirdPartyId: 'third-party' }, {}, new AbortController().signal)).toThrow('FORBIDDEN');
    expect(transport.company).not.toHaveBeenCalled();
    const malformed = setup({ items: [{ company: { ...company, status: 'DELETED' }, version: '1' }], page: 1, pageSize: 20, total: 1 });
    await expect(malformed.api.list(global, {}, new AbortController().signal)).rejects.toThrow('INVALID_RESPONSE');
  });
});
