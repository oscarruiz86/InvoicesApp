export const editableFields = ['documentType', 'documentNumber', 'verificationDigit', 'businessName', 'tradeName', 'email', 'phone', 'address', 'country', 'department', 'city'] as const;
export type ThirdPartyField = typeof editableFields[number];
export interface ThirdPartyProfile { [key: string]: string | null }
export interface ThirdParty extends ThirdPartyProfile {
  id: string; status: 'ACTIVE' | 'INACTIVE'; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string | null;
}
export interface ThirdPartyRelationship {
  companyId: string; thirdPartyId: string; status: 'ACTIVE' | 'INACTIVE'; version: string;
  createdAt: string | null; updatedAt: string; createdBy: string | null; updatedBy: string | null;
}
export interface ThirdPartyRecord { thirdParty: ThirdParty; version: string; relationship: ThirdPartyRelationship | null }
export interface ThirdPartyList { items: readonly ThirdPartyRecord[]; page: number; pageSize: number; total: number }
