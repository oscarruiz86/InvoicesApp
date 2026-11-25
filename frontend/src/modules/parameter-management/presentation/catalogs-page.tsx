import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useStore } from 'zustand';
import { DataTable, DataTableAction, DataTableSurface, DataTableSortHeader } from '@/shared/components/data-table';
import { DataPagination } from '@/shared/components/data-pagination';
import { AppliedFilters } from '@/shared/components/applied-filters';
import { ListFeedback } from '@/shared/components/list-feedback';
import { PageHeader } from '@/shared/components/page-header';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { CatalogApi, CatalogName, CatalogOption } from '../application/catalog-api';

const catalogLabels: Record<CatalogName, string> = { 'document-types': 'Tipos de documento', countries: 'Países', departments: 'Departamentos', municipalities: 'Ciudades y municipios', statuses: 'Estados' };
const statusGroups = [{ value: 'companies', label: 'Empresas' }, { value: 'third-parties', label: 'Terceros' }, { value: 'drivers', label: 'Conductores' }, { value: 'vehicles', label: 'Vehículos' }];

export function CatalogsPage({ api, authorization, context }: { api: CatalogApi; authorization: AuthorizationStore; context: ContextStore }) {
  const auth = useStore(authorization); const current = useStore(context);
  const global = current.status === 'ready' && current.activeContext?.kind === 'GLOBAL';
  const canRead = auth.has('parameters:read'); const canUpdate = auth.has('parameters:update');
  const [catalog, setCatalog] = useState<CatalogName>('document-types'); const [parentCode, setParentCode] = useState('CO');
  const [departmentOptions, setDepartmentOptions] = useState<readonly CatalogOption[]>([]); const [items, setItems] = useState<readonly CatalogOption[]>([]);
  const [countryOptions, setCountryOptions] = useState<readonly CatalogOption[]>([]);
  const [state, setState] = useState<'loading'|'ready'|'error'>('loading'); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<CatalogOption|null>(null); const [label, setLabel] = useState(''); const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false); const [newCode, setNewCode] = useState(''); const [newLabel, setNewLabel] = useState('');
  const [newParentCode, setNewParentCode] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('CO');
  const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20); const [sort, setSort] = useState<'code'|'label'>('label'); const [direction, setDirection] = useState<'asc'|'desc'>('asc');
  const request = useRef<AbortController|null>(null);
  const parent = ['municipalities', 'statuses', 'departments'].includes(catalog) ? parentCode : undefined;
  const filteredItems = useMemo(() => items.filter(item => !search.trim() || `${item.code} ${item.label} ${item.territoryType ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).slice().sort((a, b) => (a[sort].localeCompare(b[sort], 'es', { numeric: true }) * (direction === 'asc' ? 1 : -1))), [items, search, sort, direction]);
  const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [catalog, parentCode, search]);
  useEffect(() => { const controller = new AbortController(); void api.list('departments', 'CO', controller.signal).then(setDepartmentOptions).catch(() => { if (!controller.signal.aborted) setDepartmentOptions([]); }); return () => controller.abort(); }, [api]);
  useEffect(() => { const controller = new AbortController(); void api.list('countries', undefined, controller.signal).then(setCountryOptions).catch(() => { if (!controller.signal.aborted) setCountryOptions([]); }); return () => controller.abort(); }, [api]);
  const load = useCallback(async () => { request.current?.abort(); const controller = new AbortController(); request.current = controller; setError('');
    if (catalog === 'municipalities' && !parentCode) { setItems([]); setState('ready'); return; }
    setState('loading');
    try { const result = await api.list(catalog, parent, controller.signal); if (!controller.signal.aborted) { setItems(result); setState('ready'); } }
    catch { if (!controller.signal.aborted) { setItems([]); setState('error'); setError('No se pudo cargar el catálogo.'); } }
    finally { if (request.current === controller) request.current = null; }
  }, [api, catalog, parent]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load]);
  async function saveLabel() {
    if (!selected || saving) return; setSaving(true); setError('');
    try { await api.updateLabel(selected, label); setSelected(null); setNotice('Etiqueta actualizada.'); await load(); }
    catch (failure) { setError(failure instanceof Error && failure.message.includes('VERSION') ? 'El catálogo cambió. Recarga e inténtalo de nuevo.' : 'No se pudo actualizar la etiqueta.'); }
    finally { setSaving(false); }
  }
  async function createDocumentType() {
    if (saving) return; setSaving(true); setError('');
    try { if (!api.createEntry) throw new Error('UNAVAILABLE'); await api.createEntry(catalog, newCode.trim().toUpperCase(), newLabel.trim(), catalog === 'countries' || catalog === 'document-types' ? null : newParentCode); if (catalog === 'countries') setCountryOptions(await api.list('countries')); if (catalog === 'departments') setDepartmentOptions(await api.list('departments', 'CO')); setCreating(false); setNewCode(''); setNewLabel(''); setNotice(`${catalogLabels[catalog]}: elemento creado.`); await load(); }
    catch { setError('No se pudo crear el elemento. Verifica el código, la dependencia y que no exista.'); }
    finally { setSaving(false); }
  }
  async function deactivateDocumentType(item: CatalogOption) {
    if (saving || item.catalog === 'document-types' && item.code === 'NIT' || !window.confirm(`¿Desactivar ${item.label}? Se conservará su historial. No se podrá desactivar si tiene elementos dependientes o registros asociados.`)) return;
    setSaving(true); setError('');
    try { if (!api.deactivateEntry) throw new Error('UNAVAILABLE'); await api.deactivateEntry(item); setNotice(`${catalogLabels[item.catalog]}: elemento desactivado.`); await load(); }
    catch { setError('No se pudo desactivar. Puede tener dependencias o el catálogo pudo cambiar.'); }
    finally { setSaving(false); }
  }
  return <Stack spacing={2} sx={{ width: '100%', minWidth: 0 }}>
    <PageHeader title="Catálogos paramétricos" description="Consulta códigos oficiales y administra las etiquetas visibles." />
    {!global && <Alert severity="warning">La administración de catálogos requiere el contexto GLOBAL.</Alert>}
    {global && !canRead && <Alert severity="warning">Se requiere permiso parameters:read.</Alert>}
    {global && canRead && <>
      {error && <ListFeedback kind="error" title={error}><Button size="small" onClick={() => void load()}>Recargar catálogo</Button></ListFeedback>}{notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', alignItems: { sm: 'center' } }}>
        <TextField select label="Catálogo" value={catalog} onChange={event => { const value = event.target.value as CatalogName; setCatalog(value); setParentCode(value === 'municipalities' ? '' : value === 'statuses' ? 'companies' : 'CO'); }} sx={{ width: { xs: '100%', sm: 260 }, maxWidth: '100%' }}>
          {(Object.keys(catalogLabels) as CatalogName[]).map(key => <MenuItem key={key} value={key}>{catalogLabels[key]}</MenuItem>)}
        </TextField>
        {catalog === 'municipalities' && <TextField select label="Departamento" value={parentCode} onChange={event => setParentCode(event.target.value)} sx={{ width: { xs: '100%', sm: 260 }, maxWidth: '100%' }}>
          <MenuItem value="">Selecciona un departamento</MenuItem>{departmentOptions.map(item => <MenuItem key={item.code} value={item.code}>{item.label} ({item.code})</MenuItem>)}
        </TextField>}
        {catalog === 'departments' && <TextField select label="País" value={parentCode} onChange={event => setParentCode(event.target.value)} sx={{ width: { xs: '100%', sm: 260 }, maxWidth: '100%' }}>{countryOptions.map(item => <MenuItem key={item.code} value={item.code}>{item.label} ({item.code})</MenuItem>)}</TextField>}
        {catalog === 'statuses' && <TextField select label="Entidad" value={parentCode} onChange={event => setParentCode(event.target.value)} sx={{ width: { xs: '100%', sm: 260 }, maxWidth: '100%' }}>
          {statusGroups.map(group => <MenuItem key={group.value} value={group.value}>{group.label}</MenuItem>)}
        </TextField>}
        {['document-types', 'countries', 'departments', 'municipalities'].includes(catalog) && canUpdate && api.createEntry && (catalog !== 'municipalities' || Boolean(parentCode)) && (catalog !== 'departments' || countryOptions.length > 0) && <DataTableAction label={`Agregar ${catalog === 'document-types' ? 'tipo' : catalog === 'countries' ? 'país' : catalog === 'departments' ? 'departamento' : 'municipio'}`} primary onClick={() => { setNewCode(''); setNewLabel(''); setNewParentCode(catalog === 'countries' || catalog === 'document-types' ? '' : parentCode); setNewCountryCode('CO'); setCreating(true); }}><SvgIcon fontSize="small"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" /></SvgIcon></DataTableAction>}
      </Stack>
      {catalog === 'municipalities' && !parentCode && <Alert severity="info">Selecciona un departamento para consultar sus municipios.</Alert>}
      {state === 'loading' && <ListFeedback kind="loading" title="Cargando catálogo…">Estamos consultando los registros.</ListFeedback>}
      {state === 'ready' && !(catalog === 'municipalities' && !parentCode) && <><AppliedFilters filters={search ? [{ key: 'search', label: `Búsqueda: ${search}` }] : []} onRemove={() => setSearch('')} onClear={() => setSearch('')} /><DataTable loading={saving} toolbar={<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: '100%', alignItems: { sm: 'center' } }}><TextField size="small" label="Buscar en el catálogo" value={search} onChange={event => setSearch(event.target.value)} sx={{ width: { xs: '100%', sm: 320 } }} /></Stack>} pagination={<DataPagination page={page} pageSize={pageSize} total={filteredItems.length} label={`Páginas de ${catalogLabels[catalog].toLowerCase()}`} onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel="Actualizar catálogo" refreshDisabled={saving} />}>
      {filteredItems.length === 0 ? <ListFeedback kind="empty" title={search ? 'No hay elementos que coincidan con la búsqueda.' : 'No hay elementos disponibles.'}>Ajusta la búsqueda o crea un elemento para este catálogo.</ListFeedback> : <DataTableSurface loading={saving}><Table size="small" aria-label={catalogLabels[catalog]} sx={{ width: '100%', minWidth: 0, tableLayout: 'fixed', '& thead': { display: { xs: 'none', sm: 'table-header-group' } }, '& tbody tr': { display: { xs: 'block', sm: 'table-row' }, p: { xs: 1, sm: 0 }, borderBottom: { xs: '1px solid', sm: 0 }, borderColor: 'divider' }, '& tbody td': { display: { xs: 'flex', sm: 'table-cell' }, justifyContent: { xs: 'space-between', sm: 'initial' }, alignItems: 'center', gap: 1, borderBottom: { xs: 'none', sm: undefined }, px: { xs: 1, sm: 2 }, py: { xs: 0.75, sm: 1 } }, '& tbody td:nth-of-type(1)::before': { content: { xs: '"Código"', sm: 'none' }, fontWeight: 600 }, '& tbody td:nth-of-type(2)::before': { content: { xs: '"Etiqueta"', sm: 'none' }, fontWeight: 600 }, '& tbody td:nth-of-type(3)::before': { content: { xs: '"Tipo"', sm: 'none' }, fontWeight: 600 }, '& tbody td:nth-of-type(4)::before': { content: { xs: '"Acciones"', sm: 'none' }, fontWeight: 600 } }}><TableHead><TableRow><TableCell><DataTableSortHeader active={sort === 'code'} direction={direction} onClick={() => { setSort('code'); setDirection(previous => previous === 'asc' ? 'desc' : 'asc'); }}>Código</DataTableSortHeader></TableCell><TableCell><DataTableSortHeader active={sort === 'label'} direction={direction} onClick={() => { setSort('label'); setDirection(previous => previous === 'asc' ? 'desc' : 'asc'); }}>Etiqueta</DataTableSortHeader></TableCell><TableCell>Tipo</TableCell><TableCell>Acciones</TableCell></TableRow></TableHead><TableBody>
        {visibleItems.map(item => <TableRow key={`${item.catalog}-${item.parentCode}-${item.code}`} hover><TableCell>{item.code}</TableCell><TableCell sx={{ overflowWrap: 'anywhere' }}>{item.label}</TableCell><TableCell>{item.territoryType ?? '—'}</TableCell><TableCell><Stack direction="row" spacing={0.75}><DataTableAction label="Editar etiqueta" disabled={!canUpdate} onClick={() => { setSelected(item); setLabel(item.label); setError(''); }}><SvgIcon fontSize="small"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75-11.06 11.06Zm17.71-10.04a1 1 0 0 0 0-1.41l-2.51-2.51a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 2-1.66Z" /></SvgIcon></DataTableAction>{['document-types', 'countries', 'departments', 'municipalities'].includes(item.catalog) && <DataTableAction label="Desactivar" disabled={!canUpdate || !api.deactivateEntry || item.catalog === 'document-types' && item.code === 'NIT'} onClick={() => void deactivateDocumentType(item)}><SvgIcon fontSize="small"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z" /></SvgIcon></DataTableAction>}</Stack></TableCell></TableRow>)}
      </TableBody></Table></DataTableSurface>}
      </DataTable></>}
    </>}
    <Dialog open={creating} onClose={() => !saving && setCreating(false)} fullWidth maxWidth="sm"><DialogTitle>Agregar {catalog === 'document-types' ? 'tipo de documento' : catalog === 'countries' ? 'país' : catalog === 'departments' ? 'departamento' : 'municipio'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      {catalog === 'departments' && <TextField select required label="País" value={newParentCode} onChange={event => setNewParentCode(event.target.value)} disabled={saving}>{countryOptions.map(item => <MenuItem key={item.code} value={item.code}>{item.label} ({item.code})</MenuItem>)}</TextField>}
      {catalog === 'municipalities' && <><TextField select label="País" value={newCountryCode} onChange={event => setNewCountryCode(event.target.value)} disabled={saving}>{countryOptions.map(item => <MenuItem key={item.code} value={item.code}>{item.label} ({item.code})</MenuItem>)}</TextField><TextField select required label="Departamento" value={newParentCode} onChange={event => setNewParentCode(event.target.value)} disabled={saving}>{departmentOptions.map(item => <MenuItem key={item.code} value={item.code}>{item.label} ({item.code})</MenuItem>)}</TextField></>}
      {catalog === 'municipalities' && <Alert severity="info">Se creará en {countryOptions.find(item => item.code === newCountryCode)?.label ?? newCountryCode}, departamento {departmentOptions.find(item => item.code === newParentCode)?.label ?? newParentCode} ({newParentCode}). El código DIVIPOLA debe iniciar por {newParentCode}.</Alert>}
      <TextField autoFocus required label="Código" value={newCode} onChange={event => setNewCode(event.target.value.toUpperCase())} disabled={saving} helperText={catalog === 'countries' ? 'Código ISO de 2 letras (ej. CO).' : catalog === 'municipalities' ? `Código DIVIPOLA de 5 dígitos iniciado por ${newParentCode}.` : catalog === 'departments' ? 'Código DIVIPOLA de 2 dígitos.' : 'Código de 2 a 12 letras o números.'} slotProps={{ htmlInput: { maxLength: catalog === 'countries' ? 2 : catalog === 'municipalities' ? 5 : catalog === 'departments' ? 2 : 12 } }} />
      <TextField required label="Etiqueta visible" value={newLabel} onChange={event => setNewLabel(event.target.value)} disabled={saving} slotProps={{ htmlInput: { maxLength: 128 } }} /></Stack></DialogContent><DialogActions><Button disabled={saving} onClick={() => setCreating(false)}>Cancelar</Button><Button variant="contained" disabled={saving || !newLabel.trim() || (catalog === 'countries' ? !/^[A-Z]{2}$/.test(newCode.trim()) : catalog === 'departments' ? !/^\d{2}$/.test(newCode.trim()) || !newParentCode : catalog === 'municipalities' ? !/^\d{5}$/.test(newCode.trim()) || !newParentCode || !newCode.startsWith(newParentCode) : !/^[A-Z0-9_-]{2,12}$/.test(newCode.trim()))} onClick={() => void createDocumentType()}>{saving ? 'Guardando…' : 'Agregar'}</Button></DialogActions></Dialog>
    <Dialog open={selected !== null} onClose={() => !saving && setSelected(null)} fullWidth maxWidth="sm"><DialogTitle>Editar etiqueta</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><Typography>{selected?.code}{selected?.parentCode ? ` · ${selected.parentCode}` : ''}</Typography><TextField autoFocus label="Etiqueta visible" value={label} onChange={event => setLabel(event.target.value)} disabled={saving} slotProps={{ htmlInput: { maxLength: 128 } }} /></Stack></DialogContent><DialogActions><Button disabled={saving} onClick={() => setSelected(null)}>Cancelar</Button><Button variant="contained" disabled={saving || !label.trim() || label.trim() === selected?.label} onClick={() => void saveLabel()}>{saving ? 'Guardando…' : 'Guardar'}</Button></DialogActions></Dialog>
  </Stack>;
}
