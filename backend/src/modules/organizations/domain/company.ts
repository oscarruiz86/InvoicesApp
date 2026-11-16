export class CompanyError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'COMPANY_DOCUMENT_CONFLICT' | 'COMPANY_VERSION_CONFLICT' | 'COMPANY_INACTIVE' | 'INVALID_ADMINISTRATOR' | 'COMPANY_STORAGE_UNAVAILABLE' | 'IDENTITY_UNAVAILABLE', readonly fields: readonly string[] = []) { super(code); }
}
export const companyFields = ['documentType', 'documentNumber', 'verificationDigit', 'businessName', 'tradeName', 'email', 'phone', 'address', 'country', 'department', 'city'] as const;
export interface CompanyProfile {
  documentType: 'NIT'; documentNumber: string; verificationDigit: string | null;
  businessName: string; tradeName: string | null; email: string; phone: string | null;
  address: string | null; country: string | null; department: string | null; city: string | null;
}
export interface Company extends CompanyProfile {
  id: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string | null;
}
export interface CompanyRecord { company: Company; version: string }
export const companyId = (value: string) => {
  if (!/^[a-f0-9]{24}$/.test(value)) throw new CompanyError('INVALID_REQUEST', ['id']);
  return value;
};
export function companyProfile(input: Readonly<Record<string, unknown>>, previous?: CompanyProfile): CompanyProfile {
  const fields: string[] = [];
  if (Object.keys(input).some(key => !(companyFields as readonly string[]).includes(key)) || (previous && Object.keys(input).length === 0)) throw new CompanyError('INVALID_REQUEST');
  const values = { ...previous, ...input } as Record<string, unknown>;
  const text = (key: string, max: number, required = false): string | null => {
    const value = values[key];
    if (value === null || value === undefined || value === '') { if (required) fields.push(key); return null; }
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) { fields.push(key); return null; }
    return value.trim() || null;
  };
  const documentType = values.documentType === undefined ? 'NIT' : values.documentType;
  if (documentType !== 'NIT') fields.push('documentType');
  const documentNumber = text('documentNumber', 20, true) ?? '';
  if (!/^\d{1,20}$/.test(documentNumber)) fields.push('documentNumber');
  const email = (text('email', 254, true) ?? '').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.push('email');
  const verificationDigit = text('verificationDigit', 1);
  if (verificationDigit !== null && !/^\d$/.test(verificationDigit)) fields.push('verificationDigit');
  const profile: CompanyProfile = { documentType: 'NIT', documentNumber, verificationDigit, businessName: text('businessName', 256, true) ?? '',
    email, tradeName: text('tradeName', 256), phone: text('phone', 32), address: text('address', 256), country: text('country', 128), department: text('department', 128), city: text('city', 128) };
  if (fields.length) throw new CompanyError('INVALID_REQUEST', [...new Set(fields)]);
  return profile;
}
