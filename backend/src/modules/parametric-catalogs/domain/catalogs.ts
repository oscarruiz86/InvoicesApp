export const catalogNames = ['document-types', 'countries', 'departments', 'municipalities', 'statuses'] as const;
export type CatalogName = typeof catalogNames[number];

export interface CatalogEntry {
  readonly catalog: CatalogName;
  readonly code: string;
  readonly label: string;
  readonly parentCode: string | null;
  readonly territoryType: 'Municipio' | 'Isla' | 'Área no municipalizada' | null;
  readonly active: boolean;
  readonly version: number;
  readonly source: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
}

export type CatalogPatch = Pick<CatalogEntry, 'label' | 'active'>;

export class CatalogError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'RESOURCE_NOT_FOUND' | 'CATALOG_VERSION_CONFLICT' | 'FORBIDDEN' | 'STORAGE_UNAVAILABLE') { super(code); }
}

export function isCatalogName(value: string): value is CatalogName {
  return (catalogNames as readonly string[]).includes(value);
}

export function validateCatalogCode(catalog: CatalogName, code: string): boolean {
  if (catalog === 'countries') return /^[A-Z]{2}$/.test(code);
  if (catalog === 'departments') return /^\d{2}$/.test(code);
  if (catalog === 'municipalities') return /^\d{5}$/.test(code);
  if (catalog === 'statuses') return /^(ACTIVE|INACTIVE)$/.test(code);
  return /^[A-Z0-9_-]{2,12}$/.test(code);
}

export function validateEntry(input: { catalog: CatalogName; code: string; label: string; parentCode?: string | null; territoryType?: CatalogEntry['territoryType'] }): boolean {
  const parentCode = input.parentCode ?? null;
  if (!validateCatalogCode(input.catalog, input.code) || !input.label.trim() || input.label.trim().length > 128) return false;
  if (input.catalog === 'countries') return parentCode === null;
  if (input.catalog === 'departments') return parentCode !== null && /^[A-Z]{2}$/.test(parentCode);
  if (input.catalog === 'municipalities') return Boolean(parentCode && /^\d{2}$/.test(parentCode) && input.code.startsWith(parentCode));
  if (input.catalog === 'statuses') return Boolean(parentCode && /^[a-z][a-z-]{1,31}$/.test(parentCode));
  return parentCode === null;
}
