import type { CatalogEntry, CatalogName } from '../domain/catalogs';

export interface CatalogRepositoryPort {
  list(catalog: CatalogName, parentCode?: string): Promise<CatalogEntry[]>;
  updateLabel(input: { readonly catalog: CatalogName; readonly code: string; readonly parentCode: string | null; readonly label: string;
    readonly expectedVersion: number; readonly actor: string; readonly policyVersion: string }): Promise<CatalogEntry>;
  createEntry(input: { readonly catalog: CatalogName; readonly code: string; readonly label: string; readonly parentCode: string | null;
    readonly actor: string; readonly policyVersion: string }): Promise<CatalogEntry>;
  deactivateEntry(input: { readonly catalog: CatalogName; readonly code: string; readonly parentCode: string | null; readonly expectedVersion: number;
    readonly actor: string; readonly policyVersion: string }): Promise<CatalogEntry>;
}
