import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CatalogEntry } from '../domain/catalogs';

const sourceUrl = new URL('../data/divipola-20261123.csv', import.meta.url);
const sourceVersion = '20261123';

function parseCsvLine(line: string): string[] {
  const fields: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { fields.push(value); value = ''; }
    else value += character;
  }
  if (quoted) throw new Error('DIVIPOLA_INVALID_CSV');
  fields.push(value); return fields;
}

export interface DivipolaSource {
  readonly source: string;
  readonly version: string;
  readonly sha256: string;
  readonly entries: readonly Pick<CatalogEntry, 'catalog' | 'code' | 'label' | 'parentCode' | 'territoryType' | 'active' | 'source'>[];
}

export async function loadDivipola(): Promise<DivipolaSource> {
  const bytes = await readFile(sourceUrl);
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift() ?? '').map(value => value.trim());
  const index = (value: string) => header.indexOf(value);
  const departmentCode = index('Código Departamento'); const departmentName = index('Nombre Departamento');
  const municipalityCode = index('Código Municipio'); const municipalityName = index('Nombre Municipio');
  const typeIndex = index('Tipo: Municipio / Isla / Área no municipalizada');
  if ([departmentCode, departmentName, municipalityCode, municipalityName, typeIndex].some(value => value < 0)) throw new Error('DIVIPOLA_INVALID_CSV_HEADERS');
  const rows = lines.map(parseCsvLine);
  const departments = new Map<string, string>();
  const municipalities = new Set<string>();
  const entries: DivipolaSource['entries'][number][] = [];
  for (const row of rows) {
    const deptCode = row[departmentCode] ?? ''; const deptName = row[departmentName] ?? '';
    const code = row[municipalityCode] ?? ''; const name = row[municipalityName] ?? '';
    const type = row[typeIndex] as CatalogEntry['territoryType'];
    if (!/^\d{2}$/.test(deptCode) || !/^\d{5}$/.test(code) || !code.startsWith(deptCode) || !deptName || !name
      || !['Municipio', 'Isla', 'Área no municipalizada'].includes(type ?? '')) throw new Error('DIVIPOLA_INVALID_ROW');
    const existing = departments.get(deptCode);
    if (existing && existing !== deptName) throw new Error('DIVIPOLA_DUPLICATE_DEPARTMENT');
    departments.set(deptCode, deptName);
    if (municipalities.has(code)) throw new Error('DIVIPOLA_DUPLICATE_MUNICIPALITY');
    municipalities.add(code);
    entries.push({ catalog: 'municipalities', code, label: name, parentCode: deptCode, territoryType: type, active: true, source: `DANE-DIVIPOLA-${sourceVersion}` });
  }
  if (departments.size !== 33 || entries.length !== 1122) throw new Error('DIVIPOLA_UNEXPECTED_COUNTS');
  for (const [code, label] of departments) entries.push({ catalog: 'departments', code, label, parentCode: 'CO', territoryType: null, active: true, source: `DANE-DIVIPOLA-${sourceVersion}` });
  entries.push({ catalog: 'countries', code: 'CO', label: 'Colombia', parentCode: null, territoryType: null, active: true, source: 'ISO-3166-1+DANE' });
  return { source: fileURLToPath(sourceUrl), version: sourceVersion, sha256: createHash('sha256').update(bytes).digest('hex'), entries };
}

export const baseCatalogEntries = [
  ...[
    ['CC', 'Cédula de ciudadanía'], ['CE', 'Cédula de extranjería'], ['TI', 'Tarjeta de identidad'],
    ['RC', 'Registro civil'], ['PA', 'Pasaporte'], ['PPT', 'Permiso por protección temporal'], ['NIT', 'Número de identificación tributaria'],
  ].map(([code, label]) => ({ catalog: 'document-types' as const, code, label, parentCode: null, territoryType: null, active: true, source: 'APPLICATION-BASE' })),
  ...['companies', 'third-parties', 'drivers', 'vehicles'].flatMap(entity => [
    { catalog: 'statuses' as const, code: 'ACTIVE', label: entity === 'companies' ? 'Activa' : 'Activo', parentCode: entity, territoryType: null, active: true, source: 'APPLICATION-BASE' },
    { catalog: 'statuses' as const, code: 'INACTIVE', label: entity === 'companies' ? 'Inactiva' : 'Inactivo', parentCode: entity, territoryType: null, active: true, source: 'APPLICATION-BASE' },
  ]),
];
