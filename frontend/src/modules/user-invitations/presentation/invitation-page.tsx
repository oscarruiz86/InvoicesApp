import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Skeleton, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import { ThirdPartyPicker, type ThirdPartyOption } from '@/modules/third-party-management/presentation/third-party-picker';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { SuccessNotice } from '@/shared/components/success-notice';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { getRoleLabel } from '@shared/role-labels';
import type { IdentityCandidate, InvitationApi, InvitationListTarget, InvitationRecord, InvitationRole, InvitationStatus, OrganizationTarget } from '../application/invitation-api';

type InvitationSortKey = 'email' | 'role' | 'status' | 'delivery' | 'created' | 'expires';
type InvitationAction = { kind: 'cancel' | 'resend'; invitation: InvitationRecord } | null;
const deliveryStatusLabel: Record<InvitationRecord['deliveryStatus'], string> = { UNKNOWN: 'Pendiente', LOGGED: 'Completada', FAILED: 'Fallida' };
const invitationStatusLabel: Record<InvitationStatus, string> = { PENDING: 'Pendiente', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', EXPIRED: 'Vencida' };
const invitationStatusColor: Record<InvitationStatus, 'warning' | 'success' | 'error' | 'default'> = { PENDING: 'warning', ACCEPTED: 'success', REJECTED: 'error', CANCELLED: 'default', EXPIRED: 'warning' };
const statusDate = (invitation: InvitationRecord) => invitation.status === 'EXPIRED' || invitation.status === 'PENDING' ? null : invitation.resolvedAt ?? invitation.createdAt;
const formatStatusDate = (value: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(value));

function failureMessage(error: unknown) {
  if (error instanceof RequestError) return ({ INVITATION_EXISTS: 'Ya existe una invitación pendiente para este correo.', MEMBERSHIP_EXISTS: 'El usuario ya está vinculado a esta organización.', INVALID_ROLES: 'Los roles no se pueden asignar en este ámbito.', VERSION_CONFLICT: 'La invitación cambió; recarga antes de continuar.', INVITATION_EXPIRED: 'La invitación venció.', LAST_ADMINISTRATOR_REQUIRED: 'La empresa debe conservar un administrador.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar la operación.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}

const formatDate = (value: string) => new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

function InvitationStatusView({ invitation }: { invitation: InvitationRecord }) {
  const date = statusDate(invitation);
  return <Stack spacing={0.25} sx={{ alignItems: 'flex-start' }}>
    <Chip size="small" label={invitationStatusLabel[invitation.status]} color={invitationStatusColor[invitation.status]} />
    {date && <Typography component="time" dateTime={date} variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', lineHeight: 1.2, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{formatStatusDate(date)}</Typography>}
  </Stack>;
}

export function InvitationPage({ api, context, authorization, companies }: { api: InvitationApi; context: ContextStore; authorization: AuthorizationStore; companies?: CompanyApi }) {
  const contextState = useStore(context); const auth = useStore(authorization); const active = contextState.activeContext;
  const roles = auth.snapshot?.roles ?? [];
  const canChangeOrganizationType = roles.includes('APP_ADMIN') || roles.includes('COMPANY_ADMIN') || active?.kind === 'ORGANIZATION' && active.roles.includes('COMPANY_ADMIN');
  const initialType: 'COMPANY' | 'THIRD_PARTY' | 'ALL' = canChangeOrganizationType ? 'ALL' : active?.kind === 'ORGANIZATION' ? active.organizationType : 'ALL';
  const [organizationType, setOrganizationType] = useState<'COMPANY' | 'THIRD_PARTY' | 'ALL'>(initialType);
  const [organizationId, setOrganizationId] = useState(active?.kind === 'ORGANIZATION' && !active.roles.includes('COMPANY_ADMIN') ? active.organizationId : '');
  const [companyId, setCompanyId] = useState(active?.kind === 'ORGANIZATION' ? active.organizationType === 'COMPANY' ? active.organizationId : auth.scope.companyId ?? '' : auth.scope.companyId ?? '');
  const [companyName, setCompanyName] = useState(active?.kind === 'ORGANIZATION' && active.organizationType === 'COMPANY' ? active.organizationName : '');
  const [thirdPartyName, setThirdPartyName] = useState(active?.kind === 'ORGANIZATION' && active.organizationType === 'THIRD_PARTY' ? active.organizationName : '');
  const [status, setStatus] = useState<InvitationStatus | ''>(''); const [draftStatus, setDraftStatus] = useState<InvitationStatus | ''>('');
  const [emailFilter, setEmailFilter] = useState(''); const [draftEmailFilter, setDraftEmailFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<InvitationRole | ''>(''); const [draftRoleFilter, setDraftRoleFilter] = useState<InvitationRole | ''>('');
  const [deliveryFilter, setDeliveryFilter] = useState<InvitationRecord['deliveryStatus'] | ''>(''); const [draftDeliveryFilter, setDraftDeliveryFilter] = useState<InvitationRecord['deliveryStatus'] | ''>('');
  const [draftOrganizationType, setDraftOrganizationType] = useState<'COMPANY' | 'THIRD_PARTY' | 'ALL'>(initialType);
  const [draftOrganizationId, setDraftOrganizationId] = useState(active?.kind === 'ORGANIZATION' && !active.roles.includes('COMPANY_ADMIN') ? active.organizationId : '');
  const [draftThirdPartyName, setDraftThirdPartyName] = useState(active?.kind === 'ORGANIZATION' && active.organizationType === 'THIRD_PARTY' ? active.organizationName : '');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20);
  const [items, setItems] = useState<Awaited<ReturnType<InvitationApi['list']>> | null>(null);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); const [createOpen, setCreateOpen] = useState(false);
  const [createTargetType, setCreateTargetType] = useState<'COMPANY' | 'THIRD_PARTY'>(roles.includes('COMPANY_ADMIN') ? 'THIRD_PARTY' : 'COMPANY');
  const [createTargetOrganizationId, setCreateTargetOrganizationId] = useState(''); const [createTargetThirdPartyName, setCreateTargetThirdPartyName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState(''); const [selectedRole, setSelectedRole] = useState<InvitationRole>('COMPANY_ADMIN');
  const [identityCandidates, setIdentityCandidates] = useState<readonly IdentityCandidate[]>([]); const [identitySearchBusy, setIdentitySearchBusy] = useState(false); const [identitySearchError, setIdentitySearchError] = useState<string | null>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false); const [companyQuery, setCompanyQuery] = useState(''); const [companyPage, setCompanyPage] = useState(1); const [companyPageSize, setCompanyPageSize] = useState(5);
  const [companyResults, setCompanyResults] = useState<Awaited<ReturnType<CompanyApi['list']>> | null>(null); const [companyPickerError, setCompanyPickerError] = useState<string | null>(null); const [companyPickerLoading, setCompanyPickerLoading] = useState(false);
  const [thirdPartyPickerOpen, setThirdPartyPickerOpen] = useState(false);
  const [createThirdPartyPickerOpen, setCreateThirdPartyPickerOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<InvitationAction>(null);
  const [sortBy, setSortBy] = useState<InvitationSortKey>('created'); const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const generation = useRef(0); const identityGeneration = useRef(0); const mounted = useRef(true);
  const authorizationAvailable = Boolean(auth.snapshot && (auth.status === 'ready' || auth.status === 'refreshing'));
  const canChooseCompany = Boolean(companies && roles.includes('APP_ADMIN'));

  useEffect(() => {
    generation.current++;
    setItems(null); setError(null); setNotice(null); setPage(1); setStatus('');
    setThirdPartyPickerOpen(false);
    if (active?.kind === 'ORGANIZATION') {
      const aggregateAccess = canChangeOrganizationType || active.roles.includes('COMPANY_ADMIN');
      setOrganizationType(aggregateAccess ? 'ALL' : active.organizationType);
      setOrganizationId(aggregateAccess && active.organizationType !== 'COMPANY' ? '' : active.organizationId);
      setCompanyId(active.organizationType === 'COMPANY' ? active.organizationId : auth.scope.companyId ?? '');
      setCompanyName(active.organizationType === 'COMPANY' ? active.organizationName : '');
      setThirdPartyName(active.organizationType === 'THIRD_PARTY' ? active.organizationName : '');
    }
  }, [contextState.generation, active?.kind === 'ORGANIZATION' ? active.organizationId : null, auth.scope.companyId, canChangeOrganizationType]);

  const target = useMemo<OrganizationTarget | null>(() => organizationType !== 'ALL' && organizationId.trim() ? {
    organizationId: organizationId.trim(), organizationType,
    companyId: organizationType === 'THIRD_PARTY' ? companyId.trim() || auth.scope.companyId : null,
  } : null, [organizationId, organizationType, companyId, auth.scope.companyId]);
  const listTarget = useMemo<OrganizationTarget | InvitationListTarget | null>(() => organizationType === 'ALL'
    ? companyId.trim() ? { organizationId: companyId.trim(), organizationType: 'ALL', companyId: companyId.trim() } : null
    : target, [companyId, organizationType, target]);
  const createTarget = useMemo<OrganizationTarget | null>(() => {
    if (createTargetType === 'COMPANY') return companyId.trim() ? { organizationId: companyId.trim(), organizationType: 'COMPANY', companyId: null } : null;
    return createTargetOrganizationId.trim() && companyId.trim()
      ? { organizationId: createTargetOrganizationId.trim(), organizationType: 'THIRD_PARTY', companyId: companyId.trim() }
      : null;
  }, [companyId, createTargetOrganizationId, createTargetType]);
  const createRoleOptions = useMemo<InvitationRole[]>(() => !createTarget ? [] : createTarget.organizationType === 'COMPANY'
    ? roles.includes('APP_ADMIN') ? ['COMPANY_ADMIN'] : []
    : roles.includes('COMPANY_ADMIN') ? ['THIRD_PARTY_ADMIN'] : roles.includes('THIRD_PARTY_ADMIN') ? ['DRIVER'] : [], [createTarget, roles]);

  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!listTarget || contextState.status !== 'ready' || !authorizationAvailable) { setItems(null); setLoading(false); return; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setError(null); setLoading(true);
    try {
      capture = context.capture(); const result = await api.list(capture.scope, listTarget, status, page, capture.signal, pageSize, {
        email: emailFilter, ...(roleFilter ? { role: roleFilter } : {}), ...(deliveryFilter ? { delivery: deliveryFilter } : {}),
      });
      if (mounted.current && request === generation.current && capture.isCurrent()) setItems(result);
    } catch (failure) { if (mounted.current && request === generation.current && (!capture || capture.isCurrent())) setError(failureMessage(failure)); }
    finally { capture?.release(); if (mounted.current && request === generation.current) setLoading(false); }
  }, [api, authorizationAvailable, context, contextState.status, listTarget, status, emailFilter, roleFilter, deliveryFilter, page, pageSize]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (createRoleOptions.length && !createRoleOptions.includes(selectedRole)) setSelectedRole(createRoleOptions[0]); }, [createRoleOptions, selectedRole]);

  useEffect(() => {
    if (!companies || !companyPickerOpen || !authorizationAvailable) return;
    const controller = new AbortController(); setCompanyPickerError(null); setCompanyPickerLoading(true);
    const query = companyQuery.trim();
    void companies.list(auth.scope, { page: String(companyPage), pageSize: String(companyPageSize), sort: 'businessName', direction: 'asc', ...(query ? { q: query } : {}) }, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setCompanyResults(value); setCompanyPickerError(null); } })
      .catch(() => { if (!controller.signal.aborted) setCompanyPickerError('No fue posible consultar empresas.'); })
      .finally(() => { if (!controller.signal.aborted) setCompanyPickerLoading(false); });
    return () => controller.abort();
  }, [companies, auth.scope, authorizationAvailable, companyPickerOpen, companyQuery, companyPage, companyPageSize]);
  useEffect(() => {
    const request = ++identityGeneration.current; const query = recipientEmail.trim();
    if (!createOpen || !createTarget || query.length < 3) { setIdentityCandidates([]); setIdentitySearchBusy(false); setIdentitySearchError(null); return; }
    const timer = window.setTimeout(() => {
      let capture: ReturnType<ContextStore['capture']> | undefined; setIdentitySearchBusy(true); setIdentitySearchError(null);
      try {
        capture = context.capture();
        void api.searchUsers(capture.scope, createTarget, query, '', capture.signal)
          .then(value => { if (request === identityGeneration.current && capture?.isCurrent()) setIdentityCandidates(value); })
          .catch(failure => { if (request === identityGeneration.current && (!capture || capture.isCurrent())) setIdentitySearchError(failureMessage(failure)); })
          .finally(() => { capture?.release(); if (request === identityGeneration.current) setIdentitySearchBusy(false); });
      } catch (failure) { capture?.release(); if (request === identityGeneration.current) { setIdentitySearchError(failureMessage(failure)); setIdentitySearchBusy(false); } }
    }, 300);
    return () => { window.clearTimeout(timer); identityGeneration.current++; };
  }, [api, context, createOpen, createTarget, recipientEmail]);

  const mutate = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>, success: string) => {
    if (busy) return false;
    setBusy(true); setError(null); setNotice(null); let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); await operation(capture.scope, capture.signal); if (capture.isCurrent()) { setNotice(success); await load(); } return true; }
    catch (failure) { setError(failureMessage(failure)); return false; }
    finally { capture?.release(); if (mounted.current) setBusy(false); }
  };
  const openCompanyPicker = () => { setCompanyQuery(''); setCompanyPage(1); setCompanyResults(null); setCompanyPickerError(null); setCompanyPickerLoading(true); setCompanyPickerOpen(true); };
  const chooseCompany = (record: NonNullable<typeof companyResults>['items'][number]) => {
    const name = record.company.businessName ?? record.company.tradeName ?? record.company.id;
    setCompanyId(record.company.id); setCompanyName(name); setOrganizationType('ALL'); setOrganizationId(record.company.id); setThirdPartyName('');
    setCreateTargetType('COMPANY'); setCreateTargetOrganizationId(''); setCreateTargetThirdPartyName(''); setRecipientEmail(''); setIdentityCandidates([]);
    setStatus(''); setPage(1); setError(null); setCompanyPickerOpen(false);
  };
  const chooseOrganizationType = (next: 'COMPANY' | 'THIRD_PARTY' | 'ALL') => {
    setDraftOrganizationType(next); setDraftThirdPartyName('');
    setDraftOrganizationId(next === 'COMPANY' || next === 'ALL' ? companyId : '');
  };
  const openThirdPartyPicker = () => { setThirdPartyPickerOpen(true); };
  const chooseThirdParty = (record: ThirdPartyOption) => {
    setDraftOrganizationId(record.id); setDraftThirdPartyName(record.name); setThirdPartyPickerOpen(false);
  };
  const searchThirdParties = useCallback((selectedCompanyId: string, search: string, signal: AbortSignal) => api.thirdParties(auth.scope, selectedCompanyId, search, signal), [api, auth.scope]);
  const clearStatusFilter = () => { setStatus(''); setPage(1); };
  const clearEmailFilter = () => { setEmailFilter(''); setPage(1); };
  const clearRoleFilter = () => { setRoleFilter(''); setPage(1); };
  const clearDeliveryFilter = () => { setDeliveryFilter(''); setPage(1); };
  const openFilters = () => {
    setDraftStatus(status); setDraftEmailFilter(emailFilter); setDraftRoleFilter(roleFilter); setDraftDeliveryFilter(deliveryFilter);
    setDraftOrganizationType(organizationType); setDraftOrganizationId(organizationId); setDraftThirdPartyName(thirdPartyName); setFiltersOpen(true);
  };
  const applyFilters = () => {
    const nextOrganizationId = draftOrganizationType === 'COMPANY' || draftOrganizationType === 'ALL' ? companyId : draftOrganizationId;
    setOrganizationType(draftOrganizationType); setOrganizationId(nextOrganizationId); setThirdPartyName(draftOrganizationType === 'THIRD_PARTY' ? draftThirdPartyName : '');
    setStatus(draftStatus); setEmailFilter(draftEmailFilter.trim()); setRoleFilter(draftRoleFilter); setDeliveryFilter(draftDeliveryFilter); setPage(1); setFiltersOpen(false);
  };
  const clearFilters = () => {
    const defaultType: 'COMPANY' | 'THIRD_PARTY' | 'ALL' = canChangeOrganizationType ? 'ALL' : initialType;
    const activeThirdParty = active?.kind === 'ORGANIZATION' && active.organizationType === 'THIRD_PARTY';
    const defaultId = defaultType === 'COMPANY' || defaultType === 'ALL' ? companyId : activeThirdParty ? active.organizationId : '';
    const defaultName = defaultType === 'THIRD_PARTY' && activeThirdParty ? active.organizationName : '';
    setDraftStatus(''); setStatus(''); setDraftEmailFilter(''); setEmailFilter(''); setDraftRoleFilter(''); setRoleFilter(''); setDraftDeliveryFilter(''); setDeliveryFilter('');
    setDraftOrganizationType(defaultType); setOrganizationType(defaultType);
    setDraftOrganizationId(defaultId); setOrganizationId(defaultId); setDraftThirdPartyName(defaultName); setThirdPartyName(defaultName);
    setError(null); setPage(1);
  };
  const openCreateInvitation = () => {
    if (!companyId) return;
    const companyAdmin = roles.includes('COMPANY_ADMIN') || active?.kind === 'ORGANIZATION' && active.roles.includes('COMPANY_ADMIN');
    const nextType = target?.organizationType ?? (companyAdmin ? 'THIRD_PARTY' : 'COMPANY');
    setCreateTargetType(nextType);
    setCreateTargetOrganizationId(nextType === 'THIRD_PARTY' && target?.organizationType === 'THIRD_PARTY' ? target.organizationId : '');
    setCreateTargetThirdPartyName(nextType === 'THIRD_PARTY' && target?.organizationType === 'THIRD_PARTY' ? thirdPartyName : '');
    setRecipientEmail(''); setIdentityCandidates([]); setIdentitySearchError(null);
    setSelectedRole(nextType === 'COMPANY' ? 'COMPANY_ADMIN' : roles.includes('COMPANY_ADMIN') ? 'THIRD_PARTY_ADMIN' : 'DRIVER');
    setError(null); setCreateOpen(true);
  };
  const chooseCreateThirdParty = (record: ThirdPartyOption) => {
    setCreateTargetOrganizationId(record.id); setCreateTargetThirdPartyName(record.name); setCreateThirdPartyPickerOpen(false);
  };
  const createInvitation = async () => {
    if (!createTarget || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim()) || !createRoleOptions.includes(selectedRole)) { setError('Ingresa un correo válido y selecciona un rol disponible.'); return; }
    const created = await mutate((scope, signal) => api.create(scope, createTarget, recipientEmail.trim(), [selectedRole], signal), 'Invitación creada.');
    if (created) { setRecipientEmail(''); setCreateOpen(false); }
  };
  const runAction = async () => {
    if (!pendingAction || !listTarget) return;
    const action = pendingAction;
    const succeeded = await mutate((scope, signal) => action.kind === 'cancel'
      ? api.cancel(scope, action.invitation.id, action.invitation.version, signal)
      : api.resend(scope, action.invitation.id, action.invitation.version, signal), action.kind === 'cancel' ? 'Invitación cancelada.' : 'Invitación reenviada.');
    if (succeeded) setPendingAction(null);
  };

  const sortedItems = useMemo(() => {
    const values = [...(items?.items ?? [])];
    const valueFor = (invitation: InvitationRecord): string | number => {
      if (sortBy === 'email') return invitation.recipientEmail;
      if (sortBy === 'role') return invitation.roles.map(getRoleLabel).join(', ');
      if (sortBy === 'status') return invitationStatusLabel[invitation.status];
      if (sortBy === 'delivery') return deliveryStatusLabel[invitation.deliveryStatus];
      return Date.parse(sortBy === 'created' ? invitation.createdAt : invitation.expiresAt);
    };
    values.sort((left, right) => {
      const a = valueFor(left); const b = valueFor(right);
      const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es-CO', { sensitivity: 'base', numeric: true });
      return comparison * (sortDirection === 'asc' ? 1 : -1);
    });
    return values;
  }, [items, sortBy, sortDirection]);
  const sortHeader = (key: InvitationSortKey, label: string) => <DataTableSortHeader active={sortBy === key} direction={sortBy === key ? sortDirection : 'asc'} onClick={() => {
    if (sortBy === key) setSortDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDirection('asc'); }
  }}>{label}</DataTableSortHeader>;
  const canCreate = Boolean(createTarget && createRoleOptions.includes(selectedRole) && !busy);
  const canCreateForCompany = roles.includes('APP_ADMIN');
  const canCreateForThirdParty = roles.includes('COMPANY_ADMIN') || active?.kind === 'ORGANIZATION' && active.roles.includes('COMPANY_ADMIN');
  const canCreateAction = target ? Boolean((target.organizationType === 'COMPANY' ? roles.includes('APP_ADMIN') : roles.includes('COMPANY_ADMIN') || roles.includes('THIRD_PARTY_ADMIN')) && !busy) : Boolean(companyId && (canCreateForCompany || canCreateForThirdParty) && !busy);
  const showTable = Boolean(listTarget && (loading || items?.total));

  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography variant="h4" component="h1">Invitaciones</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap sx={{ alignItems: { sm: 'center' }, flexWrap: 'wrap' }}>
      {canChooseCompany ? <Button variant="outlined" onClick={openCompanyPicker}>Empresa: {companyName || 'Seleccionar empresa'}</Button>
        : companyId ? <Chip variant="outlined" label={`Empresa: ${companyName || (active?.kind === 'ORGANIZATION' && active.organizationType === 'COMPANY' ? active.organizationName : 'Empresa seleccionada')}`} /> : null}
    </Stack>
    {(emailFilter || roleFilter || deliveryFilter || status) && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {emailFilter && <Chip label={`Correo: ${emailFilter}`} onDelete={clearEmailFilter} />}
      {roleFilter && <Chip label={`Rol: ${getRoleLabel(roleFilter)}`} onDelete={clearRoleFilter} />}
      {deliveryFilter && <Chip label={`Entrega: ${deliveryStatusLabel[deliveryFilter]}`} onDelete={clearDeliveryFilter} />}
      {status && <Chip label={`Estado: ${invitationStatusLabel[status]}`} onDelete={clearStatusFilter} />}
    </Stack>}
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {!listTarget && <Alert severity="info">{organizationType === 'THIRD_PARTY' ? companyId ? 'Selecciona un tercero para consultar sus invitaciones.' : 'Selecciona una empresa y un tercero para consultar sus invitaciones.' : 'Selecciona una empresa para consultar sus invitaciones.'}</Alert>}
    {listTarget && <DataTable loading={loading}
      toolbar={!loading ? <>
        {items && items.total > 0 && <DataTableAction label="Filtrar invitaciones" onClick={openFilters} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>}
        {canCreateAction && <DataTableAction label="Crear invitación" primary onClick={openCreateInvitation} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM7 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h12v-2c0-2.66-5.33-4-8-4ZM7 14c-.34 0-.73.02-1.15.06C3.63 14.36 0 15.54 0 18v2h5v-2c0-1.72.91-3.02 2.4-3.94L7 14Zm14-6V5h-2v3h-3v2h3v3h2v-3h3V8h-3Z" /></SvgIcon></DataTableAction>}
      </> : undefined}
      pagination={items && items.total > 0 ? <DataPagination page={page} pageSize={items.pageSize} total={items.total} disabled={loading} label="Páginas de invitaciones"
        onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel="Actualizar invitaciones" refreshDisabled={busy} /> : undefined}>
      {listTarget && loading && <Alert severity="info" role="status" sx={{ display: { xs: 'block', md: 'none' } }}>Cargando invitaciones…</Alert>}
      {items && !loading && items.total === 0 && <>
        <Alert severity="info">No hay invitaciones para este filtro.</Alert>
      </>}
      {showTable && <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small" aria-label="Invitaciones enviadas" sx={{ width: '100%', tableLayout: 'fixed', minWidth: { md: 0, lg: 900 } }}>
          <TableHead><TableRow>
            <TableCell sx={{ width: organizationType === 'ALL' ? { xs: '32%', lg: '14%' } : { xs: '34%', lg: '18%' } }} sortDirection={sortBy === 'email' ? sortDirection : false}>{sortHeader('email', 'Correo')}</TableCell>
            {organizationType === 'ALL' && <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, width: '10%' }}>Organización</TableCell>}
            <TableCell sx={{ width: organizationType === 'ALL' ? { xs: '29%', lg: '13%' } : { xs: '28%', lg: '19%' } }} sortDirection={sortBy === 'role' ? sortDirection : false}>{sortHeader('role', 'Rol')}</TableCell>
            <TableCell sx={{ width: organizationType === 'ALL' ? { xs: '18%', lg: '10%' } : { xs: '18%', lg: '14%' } }} sortDirection={sortBy === 'status' ? sortDirection : false}>{sortHeader('status', 'Estado')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, width: '11%' }} sortDirection={sortBy === 'delivery' ? sortDirection : false}>{sortHeader('delivery', 'Entrega')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, width: '11%' }} sortDirection={sortBy === 'created' ? sortDirection : false}>{sortHeader('created', 'Creada')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, width: '11%' }} sortDirection={sortBy === 'expires' ? sortDirection : false}>{sortHeader('expires', 'Vence')}</TableCell>
            <TableCell sx={{ width: organizationType === 'ALL' ? { xs: '21%', lg: '19%' } : { xs: '20%', lg: '18%' } }}>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>{loading ? <TableLoadingState columns={organizationType === 'ALL' ? 8 : 7} rows={5} label="Cargando invitaciones" /> : sortedItems.map(invitation => {
            const current = invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) > Date.now();
            return <TableRow key={invitation.id} hover>
              <TableCell sx={{ overflowWrap: 'anywhere' }}>{invitation.recipientEmail}</TableCell>
              {organizationType === 'ALL' && <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, overflowWrap: 'anywhere' }}>{invitation.organizationName ?? (invitation.organizationType === 'COMPANY' ? companyName || 'Empresa' : 'Tercero')}</TableCell>}
              <TableCell>{invitation.roles.map(getRoleLabel).join(', ')}</TableCell>
              <TableCell><InvitationStatusView invitation={invitation} /></TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{deliveryStatusLabel[invitation.deliveryStatus]}</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{formatDate(invitation.createdAt)}</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>{formatDate(invitation.expiresAt)}</TableCell>
              <TableCell>{current && <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Button size="small" disabled={busy} onClick={() => setPendingAction({ kind: 'resend', invitation })}>Reenviar</Button>
                <Button size="small" color="warning" disabled={busy} onClick={() => setPendingAction({ kind: 'cancel', invitation })}>Cancelar</Button>
              </Stack>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </DataTableSurface>}
      {listTarget && !loading && sortedItems.length > 0 && <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{sortedItems.map(invitation => {
        const current = invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) > Date.now();
        return <Paper variant="outlined" key={invitation.id} sx={{ p: 2, minWidth: 0 }}><Stack spacing={1}>
          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{invitation.recipientEmail}</Typography>
          {organizationType === 'ALL' && <Typography>Organización: {invitation.organizationName ?? (invitation.organizationType === 'COMPANY' ? companyName || 'Empresa' : 'Tercero')}</Typography>}
          <Typography>Rol: {invitation.roles.map(getRoleLabel).join(', ')}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Typography>Estado:</Typography><InvitationStatusView invitation={invitation} /></Stack>
          <Typography>Entrega: {deliveryStatusLabel[invitation.deliveryStatus]}</Typography>
          <Typography>Creada: {formatDate(invitation.createdAt)}</Typography><Typography>Vence: {formatDate(invitation.expiresAt)}</Typography>
          {current && <Stack direction="row" spacing={1}><Button size="small" disabled={busy} onClick={() => setPendingAction({ kind: 'resend', invitation })}>Reenviar</Button><Button size="small" color="warning" disabled={busy} onClick={() => setPendingAction({ kind: 'cancel', invitation })}>Cancelar</Button></Stack>}
        </Stack></Paper>;
      })}</Stack>}
    </DataTable>}

    <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Filtros de invitaciones</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Elige la organización y los estados de invitación que quieres consultar.</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Correo" value={draftEmailFilter} onChange={event => setDraftEmailFilter(event.target.value)} placeholder="Buscar por correo" />
          <TextField select label="Rol" value={draftRoleFilter} onChange={event => setDraftRoleFilter(event.target.value as InvitationRole | '')}>
            <MenuItem value="">Todos los roles</MenuItem>{(['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] as const).map(role => <MenuItem key={role} value={role}>{getRoleLabel(role)}</MenuItem>)}
          </TextField>
          <TextField select label="Entrega" value={draftDeliveryFilter} onChange={event => setDraftDeliveryFilter(event.target.value as InvitationRecord['deliveryStatus'] | '')}>
            <MenuItem value="">Todos los estados de entrega</MenuItem><MenuItem value="UNKNOWN">Pendiente</MenuItem><MenuItem value="LOGGED">Completada</MenuItem><MenuItem value="FAILED">Fallida</MenuItem>
          </TextField>
        </Box>
        <TextField select fullWidth label="Tipo de organización" value={draftOrganizationType} onChange={event => chooseOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY' | 'ALL')} disabled={!canChangeOrganizationType}>
          <MenuItem value="ALL" disabled={!companyId}>Todas</MenuItem><MenuItem value="COMPANY" disabled={!companyId}>Empresa</MenuItem><MenuItem value="THIRD_PARTY" disabled={!companyId}>Tercero</MenuItem>
        </TextField>
        {draftOrganizationType === 'THIRD_PARTY' && <Stack spacing={1}>
          <Button variant="outlined" onClick={openThirdPartyPicker} disabled={!companyId}>{draftThirdPartyName || 'Seleccionar tercero'}</Button>
          {!companyId && <Alert severity="info">Selecciona una empresa para buscar sus terceros.</Alert>}
        </Stack>}
        <TextField select fullWidth label="Estado" value={draftStatus} onChange={event => setDraftStatus(event.target.value as InvitationStatus | '')}>
          <MenuItem value="">Todos los estados</MenuItem><MenuItem value="PENDING">Pendientes</MenuItem><MenuItem value="ACCEPTED">Aceptadas</MenuItem><MenuItem value="REJECTED">Rechazadas</MenuItem><MenuItem value="CANCELLED">Canceladas</MenuItem><MenuItem value="EXPIRED">Vencidas</MenuItem>
        </TextField>
      </Stack></DialogContent><DialogActions>
        <Button onClick={clearFilters}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cancelar</Button><Button variant="contained" onClick={applyFilters}>Aplicar filtros</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={createOpen} onClose={() => !busy && setCreateOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Crear invitación</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Ingresa el correo de la persona y selecciona el destino de su asociación.</Typography>
        {companyId && <Button variant="outlined" sx={{ justifyContent: 'flex-start' }} onClick={openCompanyPicker}>Empresa: {companyName || 'Seleccionar empresa'}</Button>}
        {(canCreateForCompany || canCreateForThirdParty || target?.organizationType === 'THIRD_PARTY' && roles.includes('THIRD_PARTY_ADMIN')) && <TextField select fullWidth label="Tipo de organización" value={createTargetType} disabled={!(canCreateForCompany && canCreateForThirdParty)} onChange={event => {
          setCreateTargetType(event.target.value as 'COMPANY' | 'THIRD_PARTY'); setCreateTargetOrganizationId(''); setCreateTargetThirdPartyName(''); setRecipientEmail(''); setIdentityCandidates([]);
        }}>
          {canCreateForCompany && <MenuItem value="COMPANY">Empresa</MenuItem>}
          {(canCreateForThirdParty || target?.organizationType === 'THIRD_PARTY' && roles.includes('THIRD_PARTY_ADMIN')) && <MenuItem value="THIRD_PARTY">Tercero</MenuItem>}
        </TextField>}
        {createTargetType === 'THIRD_PARTY' && <Button variant="outlined" onClick={() => setCreateThirdPartyPickerOpen(true)} disabled={!companyId}>{createTargetThirdPartyName || 'Seleccionar tercero'}</Button>}
        <Autocomplete freeSolo options={identityCandidates} filterOptions={options => options} loading={identitySearchBusy} inputValue={recipientEmail}
          getOptionLabel={option => typeof option === 'string' ? option : option.email}
          onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') { setRecipientEmail(value); setIdentityCandidates([]); setIdentitySearchError(null); } }}
          onChange={(_event, value) => { if (typeof value === 'string') setRecipientEmail(value); else if (value) { setRecipientEmail(value.email); setIdentitySearchError(null); } }}
          renderOption={(props, candidate) => <li {...props}><Stack><Typography>{candidate.fullName}</Typography><Typography variant="caption">{candidate.email} · {candidate.documentType} {candidate.documentNumber}</Typography></Stack></li>}
          renderInput={params => <TextField {...params} autoFocus label="Correo del usuario" type="email" helperText={identitySearchError ?? (identitySearchBusy ? 'Buscando usuarios…' : 'Escribe para ver coincidencias de correo.')} />} />
        <TextField select fullWidth label="Rol de la asociación" value={selectedRole} onChange={event => setSelectedRole(event.target.value as InvitationRole)} disabled={!createRoleOptions.length}>
          {createRoleOptions.map(role => <MenuItem key={role} value={role}>{getRoleLabel(role)}</MenuItem>)}
        </TextField>
        {!createTarget && createTargetType === 'THIRD_PARTY' && <Alert severity="info">Selecciona un tercero para continuar.</Alert>}
        {createTarget && !createRoleOptions.length && <Alert severity="info">Tu rol actual no puede delegar en esta organización.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
      </Stack></DialogContent><DialogActions>
        <Button onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={() => void createInvitation()} disabled={!canCreate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())}>{busy ? 'Enviando…' : 'Enviar invitación'}</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={companyPickerOpen} onClose={() => setCompanyPickerOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { height: { xs: 'calc(100% - 32px)', sm: '640px' }, maxHeight: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' } } }}>
      <DialogTitle>Seleccionar empresa</DialogTitle><DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}><Stack spacing={2} sx={{ pt: 1, minHeight: 0, flex: 1 }}>
        <TextField autoFocus label="Buscar empresa" value={companyQuery} onChange={event => { setCompanyQuery(event.target.value); setCompanyPage(1); }} placeholder="Nombre o NIT" />
        {companyPickerLoading && <LinearProgress aria-label="Cargando empresas" sx={{ borderRadius: 1 }} />}{companyPickerError && <Alert severity="error">{companyPickerError}</Alert>}
        <Stack spacing={1} aria-busy={companyPickerLoading} sx={{ minHeight: 0, flex: 1, overflowY: 'auto', pr: 0.5, opacity: companyPickerLoading || companyPickerError ? 0.55 : 1, transition: 'opacity 180ms ease' }}>
          {companyPickerLoading && !companyResults ? Array.from({ length: 5 }, (_value, index) => <Skeleton key={index} variant="rounded" height={62} />) : companyResults?.items.map(record => <Button key={record.company.id} disabled={companyPickerLoading || Boolean(companyPickerError)} variant="outlined" sx={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 62 }} onClick={() => chooseCompany(record)}><Stack sx={{ alignItems: 'flex-start' }}><span>{record.company.businessName ?? record.company.tradeName ?? record.company.id}</span><Typography variant="caption">NIT {record.company.documentNumber}</Typography></Stack></Button>)}
          {companyResults && !companyResults.items.length && !companyPickerLoading && <Alert severity="info">No encontramos empresas con esa búsqueda.</Alert>}
        </Stack>
        {companyResults && <DataPagination page={companyPage} pageSize={companyResults.pageSize} total={companyResults.total} disabled={companyPickerLoading} label="Páginas de empresas" onPageChange={setCompanyPage} onPageSizeChange={value => { setCompanyPageSize(value); setCompanyPage(1); }} compact />}
      </Stack></DialogContent><DialogActions><Button onClick={() => setCompanyPickerOpen(false)}>Cancelar</Button></DialogActions>
    </Dialog>

    <ThirdPartyPicker open={thirdPartyPickerOpen} companyId={companyId} search={searchThirdParties} onChoose={chooseThirdParty} onClose={() => setThirdPartyPickerOpen(false)} />
    <ThirdPartyPicker open={createThirdPartyPickerOpen} companyId={companyId} search={searchThirdParties} onChoose={chooseCreateThirdParty} onClose={() => setCreateThirdPartyPickerOpen(false)} />

    <Dialog open={pendingAction !== null} onClose={() => !busy && setPendingAction(null)}>
      <DialogTitle>{pendingAction?.kind === 'cancel' ? 'Cancelar invitación' : 'Reenviar invitación'}</DialogTitle>
      <DialogContent><Typography>{pendingAction?.kind === 'cancel' ? `La invitación a ${pendingAction.invitation.recipientEmail} dejará de estar disponible.` : `Se enviará de nuevo la invitación a ${pendingAction?.invitation.recipientEmail}.`}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => setPendingAction(null)} disabled={busy}>Volver</Button><Button variant="contained" color={pendingAction?.kind === 'cancel' ? 'warning' : 'primary'} onClick={() => void runAction()} disabled={busy}>{busy ? 'Procesando…' : pendingAction?.kind === 'cancel' ? 'Cancelar invitación' : 'Reenviar'}</Button></DialogActions>
    </Dialog>
  </Stack>;
}
