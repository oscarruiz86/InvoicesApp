import { describe, expect, it } from 'vitest';
import { companyId, companyProfile } from '@/modules/organizations/domain/company';
const valid = { documentNumber: '00123', businessName: ' Example ', email: ' ADMIN@Example.COM ' };
describe('company domain', () => {
  it('normalizes and preserves identifiers without inferring optional data', () => {
    expect(companyProfile(valid)).toEqual({ documentType: 'NIT', documentNumber: '00123', businessName: 'Example', email: 'admin@example.com', verificationDigit: null, tradeName: null, phone: null, address: null, country: null, department: null, city: null });
  });
  it.each(['documentNumber', 'businessName', 'email'])('rejects missing %s', field => {
    expect(() => companyProfile({ ...valid, [field]: null })).toThrow('INVALID_REQUEST');
  });
  it.each([{ documentNumber: '1.234' }, { documentNumber: '1-2' }, { verificationDigit: '12' }, { documentType: 'OTHER' }, { email: 'a@' }, { businessName: ' ' }, { phone: 'x'.repeat(33) }, { city: 'x'.repeat(129) }, { createdBy: 'forged' }, { status: 'INACTIVE' }])('rejects invalid or server-owned data %j', changes => {
    expect(() => companyProfile({ ...valid, ...changes })).toThrow('INVALID_REQUEST');
  });
  it('distinguishes omission and clearing; rejects empty patch and null required fields', () => {
    const before = companyProfile({ ...valid, city: 'Bogotá' });
    expect(companyProfile({ tradeName: ' ACME ' }, before).city).toBe('Bogotá');
    expect(companyProfile({ city: null }, before).city).toBeNull();
    expect(() => companyProfile({}, before)).toThrow();
    expect(() => companyProfile({ email: null }, before)).toThrow();
    expect(companyId('0123456789abcdef01234567')).toBe('0123456789abcdef01234567');
    expect(() => companyId('legacy')).toThrow();
  });
});
