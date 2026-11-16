import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useStore } from 'zustand';
import { Alert, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Pagination, Stack, TextField, Typography } from '@mui/material';
import type { CompanyApi } from '../application/company-api';
import { editableFields, type CompanyRecord, type CompanyList, type CompanyField } from '../domain/company';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import { RequestError } from '@/shared/application/request-error';
import { ApplicationError } from '@/shared/application/application-error';
import { errorMessage } from '@/shared/components/error-messages';

const labels: Record<CompanyField, string> = { documentType: 'Tipo de documento', documentNumber: 'Número de documento', verificationDigit: 'Dígito de verificación', businessName: 'Razón social', tradeName: 'Nombre comercial', email: 'Correo electrónico', phone: 'Teléfono', address: 'Dirección', country: 'País', department: 'Departamento', city: 'Ciudad' };
const emptyForm = () => Object.fromEntries(editableFields.map(key => [key, key === 'documentType' ? 'NIT' : ''])) as Record<CompanyField, string>;
function message(error: unknown) {
  if (error instanceof RequestError) return ({ COMPANY_DOCUMENT_CONFLICT: 'Ya existe una empresa con esa identificación.', COMPANY_VERSION_CONFLICT: 'La empresa cambió. Recarga los datos antes de volver a guardar.', COMPANY_INACTIVE: 'Activa la empresa antes de asociar administradores.', INVALID_ADMINISTRATOR: 'El usuario debe existir, estar habilitado y tener el rol de administrador de empresa.', INVALID_REQUEST: 'Revisa los campos obligatorios y sus formatos.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible guardar.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}
export function CompanyPage({ api, context, authorization, mode }: { api: CompanyApi; context: ContextStore; authorization: AuthorizationStore; mode: 'list' | 'create' | 'detail' | 'edit' }) {
  const { id = '' } = useParams(); const navigate = useNavigate(); const auth = useStore(authorization);
  const [record, setRecord] = useState<CompanyRecord | null>(null); const [list, setList] = useState<CompanyList | null>(null);
  const [form, setForm] = useState(emptyForm); const [error, setError] = useState<string | null>(null); const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState({ q: '', status: '', documentType: '', country: '', department: '', city: '', sort: 'createdAt', direction: 'desc', page: '1', pageSize: '20' });
  const [confirm, setConfirm] = useState<{ kind: 'status' } | null>(null);
  const dirty = useRef(false); const mounted = useRef(false); const generation = useRef(0); const saving = useRef(false);
  const global = auth.scope.kind === 'global';
  useEffect(() => {
    mounted.current = true;
    const unregister = context.register({ dirty: () => dirty.current, clear: () => {
      generation.current++; dirty.current = false; setRecord(null); setList(null); setForm(emptyForm()); setConfirm(null); setError(null); setNotice(null);
    } });
    return () => { mounted.current = false; unregister(); };
  }, [context]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    if (mode === 'create') { setForm(emptyForm()); setRecord(null); dirty.current = false; return; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setLoading(true); setError(null);
    try {
      capture = context.capture();
      if (mode === 'list') {
        const next = await api.list(capture.scope, Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')), capture.signal);
        if (mounted.current && capture.isCurrent() && current === generation.current) setList(next);
      } else {
        const next = await api.get(capture.scope, id, capture.signal);
        if (mounted.current && capture.isCurrent() && current === generation.current) {
          setRecord(next);
          setForm(Object.fromEntries(editableFields.map(key => [key, next.company[key] ?? ''])) as Record<CompanyField, string>); dirty.current = false;
        }
      }
    } catch (failure) { if (mounted.current && current === generation.current && (!capture || capture.isCurrent())) setError(message(failure)); }
    finally { capture?.release(); if (mounted.current && current === generation.current) setLoading(false); }
  }, [api, context, mode, id, query]);
  useEffect(() => { void load(); }, [load]);

  const mutate = async (operation: (capture: ReturnType<ContextStore['capture']>) => Promise<unknown>, after: (result: unknown) => void) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null); setFieldErrors([]); setNotice(null);
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); const result = await operation(capture); if (mounted.current && capture.isCurrent()) after(result); }
    catch (failure) { if (mounted.current && (!capture || capture.isCurrent())) { setError(message(failure)); if (failure instanceof RequestError) setFieldErrors(failure.fields); } }
    finally { capture?.release(); saving.current = false; if (mounted.current) setBusy(false); }
  };
  const save = () => {
    const invalid = ['documentNumber', 'businessName', 'email'].filter(key => !form[key as CompanyField].trim());
    if (!/^\d{1,20}$/.test(form.documentNumber.trim())) invalid.push('documentNumber');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) invalid.push('email');
    if (form.verificationDigit && !/^\d$/.test(form.verificationDigit)) invalid.push('verificationDigit');
    if (invalid.length) { setFieldErrors(invalid); setError('Revisa los campos indicados.'); return; }
    const input = Object.fromEntries(editableFields.map(key => [key, form[key].trim() || null]));
    void mutate(capture => mode === 'create' ? api.create(capture.scope, input, capture.signal) : api.update(capture.scope, id, record!.version, input, capture.signal), result => {
      dirty.current = false; const next = result as CompanyRecord; setRecord(next); navigate(`/companies/${next.company.id}`);
    });
  };
  const confirmMutation = () => {
    if (!record || !confirm) return;
    setConfirm(null);
    void mutate(capture => api.status(capture.scope, id, record.version, record.company.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', capture.signal), () => { setNotice('Cambio confirmado.'); void load(); });
  };
  const filter = (key: keyof typeof query, value: string) => setQuery(previous => ({ ...previous, [key]: value, ...(key === 'page' ? {} : { page: '1' }) }));
  return <Stack spacing={2} sx={{ minWidth: 0, '& button': { minHeight: 44 } }}>
    <Typography variant="h4" component="h1">{mode === 'list' ? 'Empresas' : mode === 'create' ? 'Crear empresa' : mode === 'edit' ? 'Editar empresa' : record?.company.businessName ?? 'Detalle de empresa'}</Typography>
    {mode !== 'list' && <Button component={Link} to="/companies">Volver a empresas</Button>}
    {error && <Alert severity="error">{error}</Alert>}{notice && <Alert severity="success">{notice}</Alert>}
    {loading && <Alert severity="info" role="status">Cargando empresas…</Alert>}
    {error && mode !== 'create' && <Button disabled={busy} onClick={() => { if (!dirty.current || window.confirm('¿Descartar los cambios y recargar?')) void load(); }}>Recargar datos</Button>}
    {mode === 'list' && <>
      {auth.has('companies:create') && global && <Button component={Link} to="/companies/new" variant="contained">Crear empresa</Button>}
      <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <TextField label="Buscar por nombre o documento" value={query.q} onChange={event => filter('q', event.target.value)} />
        <TextField select label="Estado" value={query.status} onChange={event => filter('status', event.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activa</MenuItem><MenuItem value="INACTIVE">Inactiva</MenuItem></TextField>
        <TextField select label="Tipo de documento" value={query.documentType} onChange={event => filter('documentType', event.target.value)} sx={{ minWidth: 150 }}><MenuItem value="">Todos</MenuItem><MenuItem value="NIT">NIT</MenuItem></TextField>
        {(['country', 'department', 'city'] as const).map(key => <TextField key={key} label={labels[key]} value={query[key]} onChange={event => filter(key, event.target.value)} />)}
        <TextField select label="Ordenar por" value={query.sort} onChange={event => filter('sort', event.target.value)} sx={{ minWidth: 150 }}>{[['createdAt', 'Fecha de creación'], ['updatedAt', 'Última actualización'], ['businessName', 'Razón social'], ['documentNumber', 'Documento'], ['status', 'Estado']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <TextField select label="Dirección" value={query.direction} onChange={event => filter('direction', event.target.value)}><MenuItem value="asc">Ascendente</MenuItem><MenuItem value="desc">Descendente</MenuItem></TextField>
        <TextField select label="Por página" value={query.pageSize} onChange={event => filter('pageSize', event.target.value)}>{[10, 20, 50, 100].map(size => <MenuItem key={size} value={String(size)}>{size}</MenuItem>)}</TextField>
      </Stack>
      {!loading && list?.items.length === 0 && <Alert severity="info">No hay empresas que coincidan con la consulta.</Alert>}
      {list?.items.map(item => <Card key={item.company.id}><CardContent><Stack spacing={1}><Typography variant="h6">{item.company.businessName}</Typography><Typography>{item.company.documentType} {item.company.documentNumber}</Typography><Chip label={item.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} sx={{ alignSelf: 'start' }} /><Button component={Link} to={`/companies/${item.company.id}`}>Ver empresa</Button></Stack></CardContent></Card>)}
      {list && <><Typography>Total: {list.total}</Typography><Pagination size="small" count={Math.max(1, Math.ceil(list.total / list.pageSize))} page={Number(query.page)} onChange={(_, value) => filter('page', String(value))} /></>}
    </>}
    {(mode === 'create' || mode === 'edit') && (mode === 'create' || record) && <Stack component="form" noValidate spacing={2} onSubmit={event => { event.preventDefault(); save(); }}>
      {editableFields.map(key => <TextField key={key} label={labels[key]} required={['documentType', 'documentNumber', 'businessName', 'email'].includes(key)} value={form[key]} disabled={busy || key === 'documentType'} error={fieldErrors.includes(key)} helperText={fieldErrors.includes(key) ? 'Revisa este campo.' : key === 'documentNumber' ? 'Solo dígitos, sin separadores ni dígito de verificación.' : undefined} type={key === 'email' ? 'email' : 'text'} onChange={event => { dirty.current = true; setForm(previous => ({ ...previous, [key]: event.target.value })); }} slotProps={{ htmlInput: { maxLength: key === 'documentNumber' ? 20 : key === 'verificationDigit' ? 1 : key === 'phone' ? 32 : ['country', 'department', 'city'].includes(key) ? 128 : key === 'email' ? 254 : 256 } }} />)}
      <Button type="submit" variant="contained" disabled={busy || loading}>{busy ? 'Guardando…' : 'Guardar empresa'}</Button>
    </Stack>}
    {mode === 'detail' && record && <>
      <Chip label={record.company.status === 'ACTIVE' ? 'Activa' : 'Inactiva'} sx={{ alignSelf: 'start' }} />
      {editableFields.map(key => <Typography key={key} sx={{ overflowWrap: 'anywhere' }}><strong>{labels[key]}:</strong> {record.company[key] || 'Sin información'}</Typography>)}
      <Typography>Creada: {new Date(record.company.createdAt).toLocaleString()}</Typography><Typography>Actualizada: {new Date(record.company.updatedAt).toLocaleString()}</Typography>
      {auth.has('companies:update') && <Button component={Link} to={`/companies/${id}/edit`}>Editar empresa</Button>}
      {global && auth.has('companies:deactivate') && <Button disabled={busy} onClick={() => setConfirm({ kind: 'status' })}>{record.company.status === 'ACTIVE' ? 'Desactivar empresa' : 'Activar empresa'}</Button>}
      <Stack spacing={1}><Typography variant="h5" component="h2">Acceso de usuarios</Typography><Typography>Invita y administra usuarios vinculados mediante pertenencias verificadas.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><Button component={Link} to="/invitations">Invitaciones</Button><Button component={Link} to="/organization-memberships">Usuarios vinculados</Button></Stack></Stack>
    </>}
    <Dialog open={confirm !== null} onClose={() => setConfirm(null)}><DialogTitle>Confirmar cambio</DialogTitle><DialogContent><Typography>{record?.company.status === 'ACTIVE' ? 'La empresa dejará de estar disponible como contexto operativo. Se conservarán sus datos y asociaciones.' : 'La empresa volverá a estar disponible para asociaciones activas y permisos vigentes. Las asociaciones revocadas seguirán inactivas.'}</Typography></DialogContent><DialogActions><Button onClick={() => setConfirm(null)}>Cancelar</Button><Button onClick={confirmMutation} disabled={busy}>Confirmar</Button></DialogActions></Dialog>
  </Stack>;
}
