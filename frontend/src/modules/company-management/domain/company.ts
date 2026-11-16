export const editableFields = ['documentType', 'documentNumber', 'verificationDigit', 'businessName', 'tradeName', 'email', 'phone', 'address', 'country', 'department', 'city'] as const;
export type CompanyField = typeof editableFields[number];
export type CompanyInput = Record<CompanyField, string | null>;
export interface Company extends CompanyInput { id: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string | null }
export interface CompanyRecord { company: Company; version: string }
export interface CompanyList { items: CompanyRecord[]; page: number; pageSize: number; total: number }
