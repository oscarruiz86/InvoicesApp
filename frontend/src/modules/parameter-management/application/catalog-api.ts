export type CatalogName = 'document-types' | 'countries' | 'departments' | 'municipalities' | 'statuses';
export interface CatalogOption { readonly catalog: CatalogName; readonly code: string; readonly label: string; readonly parentCode: string | null; readonly territoryType: 'Municipio' | 'Isla' | 'Área no municipalizada' | null; readonly active: boolean; readonly version: number; readonly source: string; readonly updatedAt: string; readonly updatedBy: string }
export interface CatalogApi {
  list(catalog: CatalogName, parentCode?: string, signal?: AbortSignal): Promise<readonly CatalogOption[]>;
  updateLabel(entry: CatalogOption, label: string, signal?: AbortSignal): Promise<CatalogOption>;
  createEntry?(catalog: CatalogName, code: string, label: string, parentCode: string | null, signal?: AbortSignal): Promise<CatalogOption>;
  deactivateEntry?(entry: CatalogOption, signal?: AbortSignal): Promise<CatalogOption>;
}
