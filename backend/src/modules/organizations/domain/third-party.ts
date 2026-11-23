export const thirdPartyFields = ['documentType', 'documentNumber', 'verificationDigit', 'businessName', 'tradeName', 'email', 'phone', 'address', 'country', 'department', 'city'] as const;
export type ThirdPartyField = typeof thirdPartyFields[number];
export interface ThirdPartyProfile {
  documentType: 'NIT' | 'CC'; documentNumber: string; verificationDigit: string | null;
  businessName: string; tradeName: string | null; email: string; phone: string | null;
  address: string | null; country: string | null; department: string | null; city: string | null;
}
export interface ThirdParty extends ThirdPartyProfile {
  id: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string | null;
}
export interface ThirdPartyRelationship {
  companyId: string; thirdPartyId: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string | null;
  updatedAt: string; createdBy: string | null; updatedBy: string | null;
}
export interface ThirdPartyRecord { thirdParty: ThirdParty; version: string; relationship: (ThirdPartyRelationship & { version: string }) | null; relatedCompanies?: readonly { id: string; name: string }[] }

export class ThirdPartyError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'THIRD_PARTY_DOCUMENT_CONFLICT' | 'THIRD_PARTY_VERSION_CONFLICT'
    | 'THIRD_PARTY_INACTIVE' | 'RELATIONSHIP_INACTIVE' | 'THIRD_PARTY_STORAGE_UNAVAILABLE', readonly fields: readonly string[] = []) { super(code); }
}

export const thirdPartyId = (value: string) => {
  if (!/^[a-f0-9]{24}$/.test(value)) throw new ThirdPartyError('INVALID_REQUEST', ['id']);
  return value;
};

export function thirdPartyProfile(input: Readonly<Record<string, unknown>>, previous?: ThirdPartyProfile, allowLegacyMissingVerificationDigit = false): ThirdPartyProfile {
  const fields: string[] = [];
  if (Object.keys(input).some(key => !(thirdPartyFields as readonly string[]).includes(key)) || (previous && Object.keys(input).length === 0)) throw new ThirdPartyError('INVALID_REQUEST');
  const values = { ...previous, ...input } as Record<string, unknown>;
  const text = (key: string, max: number, required = false): string | null => {
    const value = values[key];
    if (value === null || value === undefined || value === '') { if (required) fields.push(key); return null; }
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) { fields.push(key); return null; }
    return value.trim() || null;
  };
  const documentType = values.documentType === undefined ? 'NIT' : values.documentType;
  if (documentType !== 'NIT' && documentType !== 'CC') fields.push('documentType');
  const documentNumber = text('documentNumber', 20, true) ?? '';
  if (!/^\d{1,20}$/.test(documentNumber)) fields.push('documentNumber');
  const email = (text('email', 254, true) ?? '').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.push('email');
  const verificationDigit = text('verificationDigit', 1);
  if (documentType === 'NIT' && verificationDigit === null && !allowLegacyMissingVerificationDigit) fields.push('verificationDigit');
  if (documentType === 'CC' && verificationDigit !== null) fields.push('verificationDigit');
  if (verificationDigit !== null && !/^\d$/.test(verificationDigit)) fields.push('verificationDigit');
  const country = text('country', 2); const department = text('department', 2); const city = text('city', 5);
  if (country !== null && !/^[A-Z]{2}$/.test(country)) fields.push('country');
  if (department !== null && !/^\d{2}$/.test(department)) fields.push('department');
  if (city !== null && (!/^\d{5}$/.test(city) || department !== null && !city.startsWith(department))) fields.push('city');
  const profile: ThirdPartyProfile = { documentType: documentType === 'CC' ? 'CC' : 'NIT', documentNumber, verificationDigit, businessName: text('businessName', 256, true) ?? '',
    tradeName: text('tradeName', 256), email, phone: text('phone', 32), address: text('address', 256), country, department, city };
  if (fields.length) throw new ThirdPartyError('INVALID_REQUEST', [...new Set(fields)]);
  return profile;
}
