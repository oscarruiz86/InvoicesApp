import { describe, expect, it } from 'vitest';
import { thirdPartyId, thirdPartyProfile } from '@/modules/organizations/domain/third-party';

const valid = { documentNumber: '00123', verificationDigit: '3', businessName: ' Comercio Andino ', email: ' CONTACT@Example.COM ' };
describe('third-party domain', () => {
  it('normalizes the tax profile and preserves omitted optional fields as null', () => {
    expect(thirdPartyProfile(valid)).toEqual({ documentType: 'NIT', documentNumber: '00123', verificationDigit: '3', businessName: 'Comercio Andino', tradeName: null,
      email: 'contact@example.com', phone: null, address: null, country: null, department: null, city: null });
  });
  it('accepts identity cards without a tax verification digit', () => {
    expect(thirdPartyProfile({ ...valid, documentType: 'CC', verificationDigit: null }).verificationDigit).toBeNull();
  });
  it.each(['documentNumber', 'businessName', 'email'])('rejects missing %s', field => {
    expect(() => thirdPartyProfile({ ...valid, [field]: null })).toThrow('INVALID_REQUEST');
  });
  it.each([{ documentNumber: '1.234' }, { documentNumber: '1-2' }, { documentNumber: '1'.repeat(21) }, { verificationDigit: '12' }, { documentType: 'OTHER' },
    { email: 'bad@' }, { businessName: ' ' }, { phone: 'x'.repeat(33) }, { city: 'x'.repeat(129) }, { createdBy: 'forged' }, { status: 'INACTIVE' }])('rejects malformed or server-owned values %j', changes => {
    expect(() => thirdPartyProfile({ ...valid, ...changes })).toThrow('INVALID_REQUEST');
  });
  it('supports sparse edits, explicit clearing, and stable tax identifiers', () => {
    const before = thirdPartyProfile({ ...valid, country: 'CO', department: '11', city: '11001' });
    expect(thirdPartyProfile({ tradeName: ' Andino ' }, before).city).toBe('11001');
    expect(thirdPartyProfile({ city: null }, before).city).toBeNull();
    expect(() => thirdPartyProfile({}, before)).toThrow('INVALID_REQUEST');
    expect(() => thirdPartyProfile({ email: null }, before)).toThrow('INVALID_REQUEST');
    expect(thirdPartyId('0123456789abcdef01234567')).toBe('0123456789abcdef01234567');
    expect(() => thirdPartyId('legacy')).toThrow('INVALID_REQUEST');
  });
});
