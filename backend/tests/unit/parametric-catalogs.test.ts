import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { colombianDocumentTypes } from '@/modules/identity/application/identity-profile-reader';
import { loadDivipola, baseCatalogEntries } from '@/modules/parametric-catalogs/infrastructure/divipola';
import { validateCatalogCode, validateEntry } from '@/modules/parametric-catalogs/domain/catalogs';

describe('parametric catalogs', () => {
  it('validates codes and parent-child hierarchy while preserving DIVIPOLA strings', async () => {
    expect(validateCatalogCode('departments', '05')).toBe(true);
    expect(validateCatalogCode('departments', '5')).toBe(false);
    expect(validateEntry({ catalog: 'municipalities', code: '05001', parentCode: '05', label: 'Medellín' })).toBe(true);
    expect(validateEntry({ catalog: 'municipalities', code: '11001', parentCode: '05', label: 'Bogotá' })).toBe(false);
    const source = await loadDivipola();
    expect(source.entries.filter(value => value.catalog === 'departments')).toHaveLength(33);
    expect(source.entries.filter(value => value.catalog === 'municipalities')).toHaveLength(1122);
    expect(source.entries.find(value => value.catalog === 'municipalities' && value.code === '05001')).toMatchObject({ parentCode: '05', label: 'MEDELLÍN' });
    expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps the personal-document catalog aligned with the Keycloak registration profile', async () => {
    const profile = JSON.parse(await readFile(new URL('../../../keycloak/invoices-user-profile.json', import.meta.url), 'utf8')) as {
      attributes: { name: string; validations: { options: { options: string[] } } }[];
    };
    const keycloakTypes = profile.attributes.find(value => value.name === 'document_type')?.validations.options.options;
    expect(keycloakTypes).toEqual([...colombianDocumentTypes]);
    expect(baseCatalogEntries.filter(value => value.catalog === 'document-types' && value.code !== 'NIT').map(value => value.code)).toEqual([...colombianDocumentTypes]);
  });
});
