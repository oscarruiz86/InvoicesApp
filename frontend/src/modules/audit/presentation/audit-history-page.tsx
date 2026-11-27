import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, FormControl, InputLabel, LinearProgress, MenuItem, Paper, Select, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataTable, DataTableSurface } from '@/shared/components/data-table';
import { DataTableAction } from '@/shared/components/data-table';
import { CursorPagination } from '@/shared/components/cursor-pagination';
import { PageHeader } from '@/shared/components/page-header';
import { FormDialog } from '@/shared/components/form-dialog';
import { ListFeedback } from '@/shared/components/list-feedback';
import { ListFilterDialog } from '@/shared/components/list-filter-dialog';
import { AppliedFilters } from '@/shared/components/applied-filters';
import type { AuditHistoryEvent, AuditHistoryFilters, AuditHistoryReadPort, AuditSource } from '../application/audit-history-api';
import { auditActionLabel } from './audit-labels';

const sourceLabels: Record<AuditSource, string> = { authorization:'Autorización', organizations:'Organizaciones', 'keycloak-admin':'Keycloak', fleet:'Flota', invoices:'Facturas', 'invoice-sync':'Sincronización de facturas', configuration:'Configuración', 'parametric-catalogs':'Catálogos', audit:'Auditoría' };
const date = (value: string) => new Intl.DateTimeFormat('es-CO', { dateStyle:'medium', timeStyle:'medium', timeZone:'America/Bogota' }).format(new Date(value)) + ' COT';
const dateUtc = (value: string) => new Intl.DateTimeFormat('es-CO', { dateStyle:'medium', timeStyle:'medium', timeZone:'UTC' }).format(new Date(value)) + ' UTC';
const label = (event: AuditHistoryEvent) => `${auditActionLabel(event.action,event.source)} · ${sourceLabels[event.source]}`;
function dateFilter(value: string) { return value ? new Date(`${value}${value.length === 16 ? ':00.000' : ''}Z`).toISOString() : undefined; }
function inputDate(value?: string) { return value ? value.slice(0,16) : ''; }

export function AuditHistoryPage({ api }: { readonly api: AuditHistoryReadPort }) {
  const [filters, setFilters] = useState<AuditHistoryFilters>({}); const [draft, setDraft] = useState({ from:'', to:'', source:'' as AuditSource|'', action:'', actor:'', result:'' as ''|'allowed'|'denied' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pageSize, setPageSize] = useState(20); const [cursors, setCursors] = useState<(string|undefined)[]>([undefined]); const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<{ items: readonly AuditHistoryEvent[]; nextCursor: string|null }|null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string|null>(null);
  const [detail, setDetail] = useState<AuditHistoryEvent|null>(null); const [detailOpen, setDetailOpen] = useState(false); const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState<string|null>(null);
  const generation = useRef(0); const listController = useRef<AbortController|undefined>(undefined); const detailController = useRef<AbortController|undefined>(undefined); const mounted = useRef(false);
  const load = useCallback(async () => {
    listController.current?.abort(); const current = ++generation.current; const controller = new AbortController(); listController.current = controller; setLoading(true); setError(null);
    try { const result = await api.list(filters, pageSize, cursors[pageIndex], controller.signal); if (mounted.current && current === generation.current) setPage(result); }
    catch (failure) { if (mounted.current && current === generation.current) setError(errorMessage(failure instanceof ApplicationError ? failure.code : 'UNEXPECTED')); }
    finally { if (mounted.current && current === generation.current) setLoading(false); }
  }, [api, cursors, filters, pageIndex, pageSize]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; listController.current?.abort(); detailController.current?.abort(); }; }, []);
  useEffect(() => { void load(); }, [load]);
  const apply = () => {
    const next: AuditHistoryFilters = { ...(dateFilter(draft.from) ? { from:dateFilter(draft.from) } : {}), ...(dateFilter(draft.to) ? { to:dateFilter(draft.to) } : {}),
      ...(draft.source ? { source:draft.source } : {}), ...(draft.action.trim() ? { action:draft.action.trim().toUpperCase() } : {}), ...(draft.actor.trim() ? { actor:draft.actor.trim() } : {}), ...(draft.result ? { result:draft.result } : {}) };
    setPage(null); setError(null); setFilters(next); setCursors([undefined]); setPageIndex(0); setFiltersOpen(false);
  };
  const clear = () => { setDraft({ from:'', to:'', source:'', action:'', actor:'', result:'' }); setFilters({}); setPage(null); setError(null); setCursors([undefined]); setPageIndex(0); setFiltersOpen(false); };
  const openFilters = () => { setDraft({ from:inputDate(filters.from), to:inputDate(filters.to), source:filters.source ?? '', action:filters.action ?? '', actor:filters.actor ?? '', result:filters.result ?? '' }); setFiltersOpen(true); };
  const removeFilter = (key: string) => { const next = { ...filters }; delete (next as Record<string,string|undefined>)[key]; setFilters(next); setPage(null); setCursors([undefined]); setPageIndex(0); };
  const nextPage = () => { if (!page?.nextCursor) return; const next = [...cursors.slice(0, pageIndex + 1), page.nextCursor]; setCursors(next); setPageIndex(pageIndex + 1); setPage(null); };
  const openDetail = async (eventId: string) => {
    detailController.current?.abort(); const controller = new AbortController(); detailController.current = controller; setDetail(null); setDetailError(null); setDetailOpen(true); setDetailLoading(true);
    try { const value = await api.get(eventId, controller.signal); if (mounted.current && !controller.signal.aborted) setDetail(value); }
    catch (failure) { if (mounted.current && !controller.signal.aborted) setDetailError(errorMessage(failure instanceof ApplicationError ? failure.code : 'UNEXPECTED')); }
    finally { if (mounted.current && !controller.signal.aborted) setDetailLoading(false); }
  };
  const detailFields = detail ? [['Fecha (Colombia)', date(detail.occurredAt)],['Origen', sourceLabels[detail.source]],['Actor', detail.actor.displayName ? `${detail.actor.displayName} · ${detail.actor.subject}` : `${detail.actor.kind} · ${detail.actor.subject}`],['Acción', auditActionLabel(detail.action,detail.source)],['Código de acción', detail.action],['Resultado', detail.result === 'allowed' ? 'Permitida' : 'Denegada'],['Razón', detail.reason],['Correlación', detail.correlationId],['Ámbito', detail.scope ? `Empresa: ${detail.displayNames?.company ? `${detail.displayNames.company} · ` : ''}${detail.scope.companyId ?? '—'} · Tercero: ${detail.displayNames?.thirdParty ? `${detail.displayNames.thirdParty} · ` : ''}${detail.scope.thirdPartyId ?? '—'}` : '—'],['Recurso', detail.resource ? `${detail.resource.type} · ${detail.displayNames?.resource ? `${detail.displayNames.resource} · ` : ''}${detail.resource.id ?? '—'}` : '—'],['Versión anterior', detail.beforeVersion ?? '—'],['Versión nueva', detail.afterVersion ?? '—'],['Eventos suprimidos', detail.suppressed ?? '—']] as const : [];
  return <Stack spacing={2} sx={{ minWidth:0 }}>
    <PageHeader title="Auditoría" description="Historial central de eventos normalizados. La consulta queda registrada y su evento aparece en consultas posteriores." />
    <Alert severity="info">Se muestran los productores ya integrados al journal; este historial no implica cobertura completa. La captura de administración Keycloak en producción sigue fuera de cobertura.</Alert>
    <AppliedFilters filters={[
      ...(filters.from ? [{key:'from',label:`Desde UTC: ${dateUtc(filters.from)}`}] : []), ...(filters.to ? [{key:'to',label:`Hasta UTC: ${dateUtc(filters.to)}`}] : []),
      ...(filters.source ? [{key:'source',label:`Origen: ${sourceLabels[filters.source]}`}] : []), ...(filters.action ? [{key:'action',label:`Acción: ${auditActionLabel(filters.action)}`}] : []),
      ...(filters.actor ? [{key:'actor',label:`Actor: ${filters.actor}`}] : []),
      ...(filters.result ? [{key:'result',label:`Resultado: ${filters.result==='allowed'?'Permitida':'Denegada'}`}] : []),
    ]} onRemove={removeFilter} onClear={clear} />
    {error && <ListFeedback kind="error" title={error} action={<Button color="inherit" size="small" onClick={()=>void load()}>Reintentar</Button>} />}
    {loading && <LinearProgress aria-label="Cargando eventos de auditoría" />}
    {!loading && !error && page?.items.length===0 && <ListFeedback kind="empty" title="No hay eventos para los filtros seleccionados." />}
    <DataTable loading={loading} toolbar={<DataTableAction label="Filtrar eventos de auditoría" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>} pagination={<CursorPagination page={pageIndex+1} pageSize={pageSize} itemCount={page?.items.length ?? 0} hasNext={Boolean(page?.nextCursor)} disabled={loading} onPageChange={value=>{ if (value === pageIndex + 2) nextPage(); else if (value >= 1 && value <= pageIndex + 1 && value !== pageIndex + 1) { setPageIndex(value-1); setPage(null); } }} onPageSizeChange={size=>{setPageSize(size);setPage(null);setCursors([undefined]);setPageIndex(0);}} onRefresh={()=>void load()} label="Paginación de auditoría" refreshLabel="Actualizar eventos de auditoría" />}>
      {(page||loading) && <DataTableSurface loading={loading} sx={{ display:{xs:'none',md:'block'} }}><Table size="medium" aria-label="Eventos de auditoría" sx={{ tableLayout:'fixed', '& .MuiTableCell-root':{ overflowWrap:'anywhere' } }}><TableHead><TableRow><TableCell>Fecha (Colombia)</TableCell><TableCell>Origen</TableCell><TableCell>Actor</TableCell><TableCell>Acción</TableCell><TableCell>Resultado</TableCell><TableCell>Detalle</TableCell></TableRow></TableHead><TableBody>{page?.items.map(event=><TableRow key={event.eventId} hover><TableCell>{date(event.occurredAt)}</TableCell><TableCell>{sourceLabels[event.source]}</TableCell><TableCell>{event.actor.displayName ?? event.actor.subject}</TableCell><TableCell>{auditActionLabel(event.action,event.source)}</TableCell><TableCell>{event.result==='allowed'?'Permitida':'Denegada'}</TableCell><TableCell><DataTableAction label="Ver detalle" onClick={()=>void openDetail(event.eventId)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></SvgIcon></DataTableAction></TableCell></TableRow>)}</TableBody></Table></DataTableSurface>}
      <Stack spacing={1.5} sx={{ display:{xs:'flex',md:'none'} }}>{page?.items.map(event=><Paper key={event.eventId} variant="outlined" sx={{p:1.5,minWidth:0}}><Stack spacing={.5}><Typography sx={{fontWeight:700,overflowWrap:'anywhere'}}>{label(event)}</Typography><Typography variant="body2">{date(event.occurredAt)}</Typography><Typography variant="body2">Actor: {event.actor.displayName ?? event.actor.subject}</Typography><Typography variant="body2">Resultado: {event.result==='allowed'?'Permitida':'Denegada'}</Typography><DataTableAction label="Ver detalle" onClick={()=>void openDetail(event.eventId)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /></SvgIcon></DataTableAction></Stack></Paper>)}</Stack>
    </DataTable>
    <ListFilterDialog open={filtersOpen} title="Filtros de auditoría" onClose={()=>setFiltersOpen(false)} onApply={apply} leadingAction={<Button onClick={clear}>Limpiar</Button>}>
      <Stack spacing={2} sx={{pt:1}}>
        <TextField type="datetime-local" label="Desde (UTC)" value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})} slotProps={{inputLabel:{shrink:true}}} fullWidth />
        <TextField type="datetime-local" label="Hasta (UTC)" value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})} slotProps={{inputLabel:{shrink:true}}} fullWidth />
        <FormControl fullWidth><InputLabel id="audit-source-label">Origen</InputLabel><Select labelId="audit-source-label" label="Origen" value={draft.source} onChange={e=>setDraft({...draft,source:e.target.value as AuditSource|''})}><MenuItem value="">Todos</MenuItem>{Object.entries(sourceLabels).map(([key,value])=><MenuItem key={key} value={key}>{value}</MenuItem>)}</Select></FormControl>
        <TextField label="Acción" value={draft.action} onChange={e=>setDraft({...draft,action:e.target.value})} slotProps={{htmlInput:{maxLength:96}}} />
        <TextField label="Actor (nombre o ID)" value={draft.actor} onChange={e=>setDraft({...draft,actor:e.target.value})} slotProps={{htmlInput:{maxLength:120}}} />
        <FormControl fullWidth><InputLabel id="audit-result-label">Resultado</InputLabel><Select labelId="audit-result-label" label="Resultado" value={draft.result} onChange={e=>setDraft({...draft,result:e.target.value as ''|'allowed'|'denied'})}><MenuItem value="">Todos</MenuItem><MenuItem value="allowed">Permitida</MenuItem><MenuItem value="denied">Denegada</MenuItem></Select></FormControl>
      </Stack>
    </ListFilterDialog>
    <FormDialog open={detailOpen} title="Detalle del evento" onClose={()=>{detailController.current?.abort();setDetailOpen(false);setDetail(null);}} maxWidth="sm" actions={<Button onClick={()=>{detailController.current?.abort();setDetailOpen(false);setDetail(null);}}>Cerrar</Button>}>
      <Stack spacing={1.25} sx={{pt:1}}>{detailLoading&&<Alert severity="info" role="status">Cargando detalle…</Alert>}{detailError&&<Alert severity="error">{detailError}</Alert>}{detailFields.map(([name,value])=><Typography key={name} sx={{overflowWrap:'anywhere'}}><strong>{name}:</strong> {value}</Typography>)}</Stack>
    </FormDialog>
  </Stack>;
}
