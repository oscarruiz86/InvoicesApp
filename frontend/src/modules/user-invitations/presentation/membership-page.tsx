import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Skeleton, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { SuccessNotice } from '@/shared/components/success-notice';
import { getRoleLabel } from '@shared/role-labels';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import type { IdentityCandidate, InvitationApi, InvitationRole, MembershipRecord, OrganizationTarget } from '../application/invitation-api';

type OrganizationFilter = 'ALL' | 'COMPANY' | 'THIRD_PARTY';
type MembershipSortKey = 'user' | 'company' | 'organization' | 'role' | 'status';

function failureMessage(error: unknown) {
  if (error instanceof RequestError) return ({ LAST_ROLE_REQUIRED: 'La pertenencia debe conservar al menos un rol.', LAST_ADMINISTRATOR_REQUIRED: 'La empresa debe conservar un administrador.', VERSION_CONFLICT: 'La pertenencia cambió; recarga los datos.', INVALID_ROLES: 'Los roles no se pueden asignar en este ámbito.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar el cambio.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}

export function MembershipPage({ api, context, authorization, companies }: { api: InvitationApi; context: ContextStore; authorization: AuthorizationStore; companies?: CompanyApi }) {
  const contextState = useStore(context); const auth = useStore(authorization); const active = contextState.activeContext;
  const activeOrganizationId = active?.kind === 'ORGANIZATION' ? active.organizationId : null;
  const activeOrganizationType = active?.kind === 'ORGANIZATION' ? active.organizationType : null;
  const [organizationId, setOrganizationId] = useState(active?.kind === 'ORGANIZATION' ? active.organizationId : '');
  const [organizationType, setOrganizationType] = useState<'COMPANY' | 'THIRD_PARTY'>(active?.kind === 'ORGANIZATION' ? active.organizationType : 'COMPANY');
  const [companyId, setCompanyId] = useState(''); const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | ''>(''); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20);
  const [result, setResult] = useState<{ items: readonly MembershipRecord[]; page: number; pageSize: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false); const [inviteEmail, setInviteEmail] = useState(''); const [inviteRole, setInviteRole] = useState<InvitationRole>('DRIVER');
  const [inviteOrganizationType, setInviteOrganizationType] = useState<'COMPANY' | 'THIRD_PARTY'>('COMPANY');
  const [identityCandidates, setIdentityCandidates] = useState<readonly IdentityCandidate[]>([]); const [identitySearchBusy, setIdentitySearchBusy] = useState(false); const [identitySearchError, setIdentitySearchError] = useState<string | null>(null);
  const [viewMember, setViewMember] = useState<MembershipRecord | null>(null); const [viewOpen, setViewOpen] = useState(false); const [suspendMember, setSuspendMember] = useState<MembershipRecord | null>(null);
  const [viewLoading, setViewLoading] = useState(false); const [viewError, setViewError] = useState<string | null>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false); const [companyQuery, setCompanyQuery] = useState(''); const [companyPage, setCompanyPage] = useState(1); const [companyPageSize, setCompanyPageSize] = useState(5);
  const [companyResults, setCompanyResults] = useState<Awaited<ReturnType<CompanyApi['list']>> | null>(null); const [companyPickerError, setCompanyPickerError] = useState<string | null>(null); const [companyPickerLoading, setCompanyPickerLoading] = useState(false);
  const [companyName, setCompanyName] = useState(active?.kind === 'ORGANIZATION' && active.organizationType === 'COMPANY' ? active.organizationName : '');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<InvitationRole | ''>(''); const [draftRole, setDraftRole] = useState<InvitationRole | ''>('');
  const [filtersOpen, setFiltersOpen] = useState(false); const [organizationTypeFilter, setOrganizationTypeFilter] = useState<OrganizationFilter>('COMPANY'); const [draftOrganizationType, setDraftOrganizationType] = useState<OrganizationFilter>('COMPANY');
  const [thirdPartyId, setThirdPartyId] = useState(''); const [thirdPartyName, setThirdPartyName] = useState(''); const [thirdPartyQuery, setThirdPartyQuery] = useState('');
  const [thirdPartyResults, setThirdPartyResults] = useState<readonly { id: string; name: string }[]>([]); const [thirdPartyError, setThirdPartyError] = useState<string | null>(null);
  const [thirdPartyPickerOpen, setThirdPartyPickerOpen] = useState(false);
  const [pendingSearch, setPendingSearch] = useState('');
  const [draftStatus, setDraftStatus] = useState<'ACTIVE' | 'INACTIVE' | ''>('');
  const [sortBy, setSortBy] = useState<MembershipSortKey>('user'); const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const authorizationAvailable = Boolean(auth.snapshot && (auth.status === 'ready' || auth.status === 'refreshing'));
  const generation = useRef(0); const viewRequestGeneration = useRef(0); const identitySearchGeneration = useRef(0); const mounted = useRef(true); const roles = useMemo(() => auth.snapshot?.roles ?? [], [auth.snapshot?.roles]);
  useEffect(() => {
    generation.current++;
    setResult(null); setError(null); setNotice(null);
    setSearch(''); setRoleFilter(''); setStatus(''); setThirdPartyId(''); setThirdPartyName('');
    if (activeOrganizationId !== null && activeOrganizationType !== null) {
      setOrganizationId(activeOrganizationId); setOrganizationType(activeOrganizationType); setOrganizationTypeFilter(activeOrganizationType); setCompanyId(auth.scope.companyId ?? ''); setPage(1);
      setCompanyName(activeOrganizationType === 'COMPANY' && active?.kind === 'ORGANIZATION' ? active.organizationName : '');
      if (activeOrganizationType === 'COMPANY') setCompanyId(activeOrganizationId);
    }
  }, [contextState.generation, activeOrganizationId, activeOrganizationType, auth.scope.companyId]);
  useEffect(() => {
    if (!companies || !companyPickerOpen || !authorizationAvailable) return;
    const controller = new AbortController(); setCompanyPickerError(null); setCompanyPickerLoading(true);
    const q = companyQuery.trim();
    void companies.list(auth.scope, { page: String(companyPage), pageSize: String(companyPageSize), sort: 'businessName', direction: 'asc', ...(q ? { q } : {}) }, controller.signal)
      .then(value => { if (!controller.signal.aborted) { setCompanyResults(value); setCompanyPickerError(null); } })
      .catch(() => { if (!controller.signal.aborted) setCompanyPickerError('No fue posible consultar empresas.'); })
      .finally(() => { if (!controller.signal.aborted) setCompanyPickerLoading(false); });
    return () => controller.abort();
  }, [auth.scope, authorizationAvailable, companies, companyPickerOpen, companyPage, companyPageSize, companyQuery]);
  useEffect(() => {
    if (!thirdPartyPickerOpen || !authorizationAvailable || !companyId) return;
    const controller = new AbortController(); setThirdPartyError(null);
    void api.thirdParties(auth.scope, companyId, thirdPartyQuery.trim(), controller.signal)
      .then(setThirdPartyResults).catch(() => { if (!controller.signal.aborted) setThirdPartyError('No fue posible consultar terceros asociados.'); });
    return () => controller.abort();
  }, [api, auth.scope, authorizationAvailable, companyId, thirdPartyPickerOpen, thirdPartyQuery]);
  const target = useMemo<OrganizationTarget | null>(() => organizationId.trim() ? { organizationId: organizationId.trim(), organizationType,
    companyId: organizationType === 'THIRD_PARTY' ? companyId.trim() || auth.scope.companyId : null } : null, [organizationId, organizationType, companyId, auth.scope.companyId]);
  const targetFor = (member?: MembershipRecord | null): OrganizationTarget | null => {
    if (member?.organization) return { organizationId: member.organization.id, organizationType: member.organization.organizationType,
      companyId: member.organization.organizationType === 'THIRD_PARTY' ? companyId : null };
    return target;
  };
  const organizationLabel = (member?: MembershipRecord | null) => member?.organization
    ? member.organization.organizationType === 'COMPANY' ? 'Empresa' : member.organization.name
    : target?.organizationType === 'THIRD_PARTY' ? thirdPartyName || target.organizationId : target?.organizationType === 'COMPANY' ? 'Empresa' : 'No disponible';
  const mutableRolesFor = (organizationType: 'COMPANY' | 'THIRD_PARTY'): InvitationRole[] => organizationType === 'COMPANY'
    ? roles.includes('APP_ADMIN') ? ['COMPANY_ADMIN'] : []
    : roles.includes('COMPANY_ADMIN') ? ['THIRD_PARTY_ADMIN'] : roles.includes('THIRD_PARTY_ADMIN') ? ['DRIVER'] : [];
  const inviteRoles = useMemo<InvitationRole[]>(() => inviteOrganizationType === 'COMPANY' ? roles.includes('APP_ADMIN') ? ['COMPANY_ADMIN'] : []
    : roles.includes('COMPANY_ADMIN') ? ['THIRD_PARTY_ADMIN'] : roles.includes('THIRD_PARTY_ADMIN') ? ['DRIVER'] : [], [roles, inviteOrganizationType]);
  const invitationTarget = useMemo<OrganizationTarget | null>(() => {
    if (inviteOrganizationType === 'COMPANY') return companyId ? { organizationId: companyId, organizationType: 'COMPANY', companyId: null } : null;
    return thirdPartyId && companyId ? { organizationId: thirdPartyId, organizationType: 'THIRD_PARTY', companyId } : null;
  }, [inviteOrganizationType, companyId, thirdPartyId]);
  const canInvite = roles.includes('APP_ADMIN') || roles.includes('COMPANY_ADMIN') || roles.includes('THIRD_PARTY_ADMIN');
  const canViewAllTypes = roles.includes('APP_ADMIN') || (roles.includes('COMPANY_ADMIN') && auth.scope.kind === 'organization' && Boolean(auth.scope.companyId) && !auth.scope.thirdPartyId);
  useEffect(() => { if (inviteRoles.length && !inviteRoles.includes(inviteRole)) setInviteRole(inviteRoles[0]); }, [inviteRoles, inviteRole]);
  useEffect(() => {
    const request = ++identitySearchGeneration.current;
    const query = inviteEmail.trim();
    if (!inviteOpen || !invitationTarget || !canInvite || query.length < 3) {
      setIdentityCandidates([]); setIdentitySearchBusy(false); setIdentitySearchError(null);
      return;
    }
    const timer = window.setTimeout(() => {
      let capture: ReturnType<ContextStore['capture']> | undefined;
      setIdentitySearchBusy(true); setIdentitySearchError(null);
      try {
        capture = context.capture();
        void api.searchUsers(capture.scope, invitationTarget, query, '', capture.signal)
          .then(value => { if (request === identitySearchGeneration.current && capture?.isCurrent()) setIdentityCandidates(value); })
          .catch(failure => { if (request === identitySearchGeneration.current && (!capture || capture.isCurrent())) setIdentitySearchError(failureMessage(failure)); })
          .finally(() => { capture?.release(); if (request === identitySearchGeneration.current) setIdentitySearchBusy(false); });
      } catch (failure) {
        capture?.release();
        if (request === identitySearchGeneration.current) { setIdentitySearchError(failureMessage(failure)); setIdentitySearchBusy(false); }
      }
    }, 300);
    return () => { window.clearTimeout(timer); identitySearchGeneration.current++; };
  }, [api, canInvite, context, inviteEmail, inviteOpen, invitationTarget]);
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!target || (organizationTypeFilter === 'ALL' && !companyId) || contextState.status !== 'ready' || !authorizationAvailable) { setResult(null); setLoading(false); return; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setError(null); setLoading(true);
    try {
      capture = context.capture();
      const filters = { search: search.trim(), role: roleFilter || undefined };
      const value = organizationTypeFilter === 'ALL'
        ? await api.membershipsByCompany(capture.scope, companyId, status, page, filters, capture.signal, pageSize)
        : await api.memberships(capture.scope, target, status, page, filters, capture.signal, pageSize);
      if (mounted.current && request === generation.current && capture.isCurrent()) setResult(value);
    } catch (failure) { if (mounted.current && request === generation.current && (!capture || capture.isCurrent())) setError(failureMessage(failure)); }
    finally { capture?.release(); if (mounted.current && request === generation.current) setLoading(false); }
  }, [api, authorizationAvailable, context, contextState.status, target, organizationTypeFilter, companyId, status, page, pageSize, search, roleFilter]);
  useEffect(() => {
    void load();
    const requestGeneration = generation;
    return () => { requestGeneration.current++; };
  }, [load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutate = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>) => {
    if (busy || !target) return;
    setBusy(true); setError(null); setNotice(null); let capture: ReturnType<ContextStore['capture']> | undefined;
    try { capture = context.capture(); await operation(capture.scope, capture.signal); if (capture.isCurrent()) { setNotice('Cambios guardados.'); await load(); } }
    catch (failure) { setError(failureMessage(failure)); }
    finally { capture?.release(); if (mounted.current) setBusy(false); }
  };
  const updateRole = (member: MembershipRecord, role: InvitationRole, remove: boolean) => {
    const memberTarget = targetFor(member);
    const mutableRoles = memberTarget ? mutableRolesFor(memberTarget.organizationType) : [];
    if (!memberTarget || !mutableRoles.includes(role) || (remove && member.roles.length <= 1)) return;
    const next = remove ? member.roles.filter(value => value !== role) : [...new Set([...member.roles, role])];
    void mutate((scope, signal) => api.changeRoles(scope, memberTarget, member.id, member.revision, next, signal));
  };
  const createInvitation = () => {
    if (!invitationTarget || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim()) || !inviteRoles.includes(inviteRole)) {
      setError('Ingresa un correo válido y selecciona un rol disponible.'); return;
    }
    void mutate((scope, signal) => api.create(scope, invitationTarget, inviteEmail.trim(), [inviteRole], signal).then(value => {
      setInviteEmail(''); setInviteOpen(false); return value;
    }));
  };
  const openFilters = () => {
    setDraftOrganizationType(organizationTypeFilter); setDraftStatus(status); setDraftRole(roleFilter); setPendingSearch(search); setFiltersOpen(true);
  };
  const openInvite = () => {
    setError(null); setInviteEmail(''); setInviteOrganizationType(target?.organizationType === 'THIRD_PARTY' || roles.includes('COMPANY_ADMIN') ? 'THIRD_PARTY' : 'COMPANY'); setInviteOpen(true);
  };
  const openCompanyPicker = () => {
    setCompanyQuery(''); setCompanyPage(1); setCompanyResults(null); setCompanyPickerError(null); setCompanyPickerLoading(true); setCompanyPickerOpen(true);
  };
  const applyFilters = () => {
    if (draftOrganizationType === 'ALL' && !canViewAllTypes) return;
    if (draftOrganizationType === 'THIRD_PARTY' && (!companyId || !thirdPartyId)) return;
    if ((draftOrganizationType === 'COMPANY' || draftOrganizationType === 'ALL') && !companyId) return;
    const resolvedType = draftOrganizationType === 'THIRD_PARTY' ? 'THIRD_PARTY' : 'COMPANY';
    setOrganizationTypeFilter(draftOrganizationType); setOrganizationType(resolvedType);
    setOrganizationId(resolvedType === 'COMPANY' ? companyId : thirdPartyId);
    if (draftOrganizationType !== 'THIRD_PARTY') { setThirdPartyId(''); setThirdPartyName(''); }
    setStatus(draftStatus); setRoleFilter(draftRole); setSearch(pendingSearch.trim()); setPage(1); setFiltersOpen(false);
  };
  const clearFilter = (name: 'search' | 'status' | 'role' | 'organization') => {
    if (name === 'search') setSearch('');
    if (name === 'status') setStatus('');
    if (name === 'role') setRoleFilter('');
    if (name === 'organization') { setOrganizationType('COMPANY'); setOrganizationTypeFilter('COMPANY'); setOrganizationId(companyId); setThirdPartyId(''); setThirdPartyName(''); }
    setPage(1);
  };
  const closeMemberView = () => {
    viewRequestGeneration.current++;
    setViewOpen(false); setViewMember(null); setViewError(null); setViewLoading(false);
  };
  const showMember = async (member: MembershipRecord) => {
    const memberTarget = targetFor(member);
    if (!memberTarget) return;
    const request = ++viewRequestGeneration.current;
    setViewOpen(true); setViewMember(null); setViewError(null); setViewLoading(true);
    let capture: ReturnType<ContextStore['capture']> | undefined;
    try {
      capture = context.capture(); const value = await api.profile(capture.scope, memberTarget, member.id, capture.signal);
      if (request === viewRequestGeneration.current && capture.isCurrent()) setViewMember({ ...value, ...(member.organization ? { organization: member.organization } : {}) });
    } catch (failure) { if (request === viewRequestGeneration.current && (!capture || capture.isCurrent())) setViewError(failureMessage(failure)); }
    finally { capture?.release(); if (request === viewRequestGeneration.current) setViewLoading(false); }
  };
  const confirmStatus = () => {
    if (!suspendMember) return;
    const member = suspendMember; const next = member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const memberTarget = targetFor(member);
    if (!memberTarget) return;
    setSuspendMember(null);
    void mutate((scope, signal) => api.changeStatus(scope, memberTarget, member.id, member.revision, next, signal));
  };
  const memberActions = (member: MembershipRecord) => {
    const memberTarget = targetFor(member);
    const mutableRoles = memberTarget ? mutableRolesFor(memberTarget.organizationType) : [];
    const manageable = mutableRoles.length > 0 && member.roles.every(role => mutableRoles.includes(role));
    return <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
    <Button variant="outlined" disabled={busy} onClick={() => void showMember(member)}>Ver</Button>
    {member.status === 'ACTIVE' && manageable && <Button color="warning" disabled={busy} onClick={() => setSuspendMember(member)}>Suspender</Button>}
    {manageable && <>
      {mutableRoles.map(role => member.roles.includes(role)
        ? member.roles.length > 1 && <Button key={role} color="warning" disabled={busy} onClick={() => updateRole(member, role, true)}>Quitar {getRoleLabel(role)}</Button>
        : <Button key={role} disabled={busy} onClick={() => updateRole(member, role, false)}>Asignar {getRoleLabel(role)}</Button>)}
      {member.status === 'INACTIVE' && <Button color="primary" disabled={busy} onClick={() => setSuspendMember(member)}>Reactivar</Button>}
    </>}
  </Stack>;
  };
  const sortedItems = useMemo(() => {
    const values = [...(result?.items ?? [])];
    const valueFor = (member: MembershipRecord) => {
      if (sortBy === 'user') return member.profile?.fullName ?? '';
      if (sortBy === 'company') return companyName;
      if (sortBy === 'organization') return organizationLabel(member);
      if (sortBy === 'role') return member.roles.map(role => getRoleLabel(role)).join(', ');
      return member.status === 'ACTIVE' ? 'Activo' : 'Suspendido';
    };
    values.sort((left, right) => valueFor(left).localeCompare(valueFor(right), 'es-CO', { sensitivity: 'base', numeric: true }) * (sortDirection === 'asc' ? 1 : -1));
    return values;
  }, [companyName, organizationLabel, result, sortBy, sortDirection]);
  const sortHeader = (key: MembershipSortKey, label: string) => <DataTableSortHeader active={sortBy === key}
    direction={sortBy === key ? sortDirection : 'asc'} onClick={() => { if (sortBy === key) setSortDirection(value => value === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDirection('asc'); } }}>{label}</DataTableSortHeader>;
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography variant="h4" component="h1">Usuarios</Typography>
    {companies ? <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}><Button variant="outlined" onClick={openCompanyPicker}>Empresa: {companyName || 'Seleccionar empresa'}</Button></Stack>
      : <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField select label="Tipo de organización" value={organizationType} onChange={event => setOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY')} sx={{ minWidth: 180 }}><MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem></TextField><TextField label="ID de organización" value={organizationId} onChange={event => setOrganizationId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />{organizationType === 'THIRD_PARTY' && <TextField label="ID de empresa relacionada (opcional)" value={companyId} onChange={event => setCompanyId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />}</Stack>}

    {companyId && (search || status || roleFilter || organizationTypeFilter !== 'COMPANY') && <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
      {search && <Chip label={`Búsqueda: ${search}`} onDelete={() => clearFilter('search')} />}
      {status && <Chip label={`Estado: ${status === 'ACTIVE' ? 'Activo' : 'Suspendido'}`} onDelete={() => clearFilter('status')} />}
      {roleFilter && <Chip label={`Rol: ${getRoleLabel(roleFilter)}`} onDelete={() => clearFilter('role')} />}
      {organizationTypeFilter === 'ALL' && <Chip label="Tipo: Todos" onDelete={() => clearFilter('organization')} />}
      {organizationTypeFilter === 'THIRD_PARTY' && <Chip label={`Tercero: ${thirdPartyName || organizationId}`} onDelete={() => clearFilter('organization')} />}
    </Stack>}
    {error && <Alert severity="error">{error}</Alert>}{notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {!companyId && <Alert severity="info">Selecciona una empresa para consultar los usuarios asociados.</Alert>}
    {companyId && (loading || result) && <DataTable loading={loading}
      toolbar={!loading && result && result.total > 0 ? <>
        <DataTableAction label="Filtro" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
        <DataTableAction label="Asociar usuario" primary onClick={openInvite} disabled={!target || !canInvite || busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM7 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h12v-2c0-2.66-5.33-4-8-4ZM7 14c-.34 0-.73.02-1.15.06C3.63 14.36 0 15.54 0 18v2h5v-2c0-1.72.91-3.02 2.4-3.94L7 14Zm14-6V5h-2v3h-3v2h3v3h2v-3h3V8h-3Z" /></SvgIcon></DataTableAction>
      </> : undefined}
      pagination={result && result.total > 0 && <DataPagination page={page} pageSize={result.pageSize} total={result.total} disabled={loading} label="Páginas de usuarios vinculados"
        onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel="Actualizar usuarios" refreshDisabled={busy} />}>
      {companyId && loading && <Alert severity="info" role="status" sx={{ display: { xs: 'block', md: 'none' } }}>Cargando usuarios…</Alert>}
      {result && !loading && !result.items.length && <>
        <Alert severity="info">No hay usuarios vinculados para este filtro.</Alert>
        {target && canInvite && <Button variant="contained" onClick={openInvite} disabled={busy} sx={{ alignSelf: 'flex-start' }}>Asociar usuario</Button>}
      </>}
      {(loading || Boolean(result?.items.length)) && <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small" aria-label="Usuarios asociados" sx={{ tableLayout: 'fixed', minWidth: 760 }}>
          <TableHead><TableRow>
            <TableCell sx={{ width: '16%' }} sortDirection={sortBy === 'user' ? sortDirection : false}>{sortHeader('user', 'Usuario')}</TableCell>
            <TableCell sx={{ width: '12%' }} sortDirection={sortBy === 'company' ? sortDirection : false}>{sortHeader('company', 'Empresa')}</TableCell>
            <TableCell sx={{ width: '14%' }} sortDirection={sortBy === 'organization' ? sortDirection : false}>{sortHeader('organization', 'Organización')}</TableCell>
            <TableCell sx={{ width: '19%' }} sortDirection={sortBy === 'role' ? sortDirection : false}>{sortHeader('role', 'Rol')}</TableCell>
            <TableCell sx={{ width: '15%', minWidth: 112 }} sortDirection={sortBy === 'status' ? sortDirection : false}>{sortHeader('status', 'Estado')}</TableCell><TableCell sx={{ width: '24%' }}>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>{loading ? <TableLoadingState columns={6} rows={5} label="Cargando usuarios" /> : sortedItems.map(member => <TableRow key={member.id} hover>
            <TableCell><Stack><Typography>{member.profile?.fullName ?? 'Perfil no disponible'}</Typography>{member.profile && <Typography variant="caption">{member.profile.documentType} · {member.profile.documentNumber}</Typography>}</Stack></TableCell>
            <TableCell>{companyName || 'No disponible'}</TableCell>
            <TableCell>{organizationLabel(member)}</TableCell>
            <TableCell>{member.roles.map(role => getRoleLabel(role)).join(', ')}</TableCell>
            <TableCell><Chip size="small" label={member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'} color={member.status === 'ACTIVE' ? 'success' : 'default'} sx={{ maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'nowrap' } }} /></TableCell>
            <TableCell>{memberActions(member)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </DataTableSurface>}
      {companyId && !loading && sortedItems.length > 0 && <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{sortedItems.map(member => <Paper variant="outlined" key={member.id} sx={{ p: 2, minWidth: 0 }}><Stack spacing={1}>
        <Typography variant="h6">{member.profile?.fullName ?? 'Perfil no disponible'}</Typography>
        {member.profile && <Typography>Documento: {member.profile.documentType} · {member.profile.documentNumber}</Typography>}
        <Typography>Empresa: {companyName || 'No disponible'}</Typography>
        <Typography>Organización: {organizationLabel(member)}</Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Typography>Estado:</Typography><Chip size="small" label={member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'} color={member.status === 'ACTIVE' ? 'success' : 'default'} sx={{ maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'nowrap' } }} /></Stack><Typography>Roles: {member.roles.map(role => getRoleLabel(role)).join(', ')}</Typography>
        {memberActions(member)}
      </Stack></Paper>)}</Stack>}
    </DataTable>}
    <Dialog open={inviteOpen} onClose={() => !busy && setInviteOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Asociar usuario</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Ingresa el correo de la persona y selecciona el destino de su asociación.</Typography>
        {companyId && <Button variant="outlined" sx={{ justifyContent: 'flex-start' }} onClick={openCompanyPicker}>Empresa: {companyName || 'Seleccionar empresa'}</Button>}
        {target?.organizationType === 'COMPANY' && <TextField select label="Tipo de organización" value={inviteOrganizationType} onChange={event => { setInviteOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY'); setInviteEmail(''); if (event.target.value === 'THIRD_PARTY') { setThirdPartyId(''); setThirdPartyName(''); } }}>
          <MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem>
        </TextField>}
        {inviteOrganizationType === 'THIRD_PARTY' && <Button variant="outlined" onClick={() => { setThirdPartyQuery(''); setThirdPartyPickerOpen(true); }}>{thirdPartyName || 'Seleccionar tercero'}</Button>}
        <Autocomplete freeSolo options={identityCandidates} filterOptions={options => options} loading={identitySearchBusy} inputValue={inviteEmail}
          getOptionLabel={option => typeof option === 'string' ? option : option.email}
          onInputChange={(_event, value, reason) => { if (reason === 'input' || reason === 'clear') { setInviteEmail(value); setIdentityCandidates([]); setIdentitySearchError(null); } }}
          onChange={(_event, value) => { if (typeof value === 'string') setInviteEmail(value); else if (value) { setInviteEmail(value.email); setIdentitySearchError(null); } }}
          renderOption={(props, candidate) => <li {...props}><Stack><Typography>{candidate.fullName}</Typography><Typography variant="caption">{candidate.email} · {candidate.documentType} {candidate.documentNumber}</Typography></Stack></li>}
          renderInput={params => <TextField {...params} autoFocus label="Correo del usuario" type="email" helperText={identitySearchError ?? (identitySearchBusy ? 'Buscando usuarios…' : 'Escribe para ver coincidencias de correo.')} />} />
        <TextField select label="Rol de la asociación" value={inviteRole} onChange={event => setInviteRole(event.target.value as InvitationRole)} disabled={!inviteRoles.length}>
          {inviteRoles.map(role => <MenuItem key={role} value={role}>{getRoleLabel(role)}</MenuItem>)}
        </TextField>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setInviteOpen(false)} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={createInvitation} disabled={busy || !invitationTarget || !inviteEmail.trim() || !inviteRoles.length}>{busy ? 'Enviando…' : 'Enviar invitación'}</Button></DialogActions>
    </Dialog>
    <Dialog open={companyPickerOpen} onClose={() => setCompanyPickerOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { height: { xs: 'calc(100% - 32px)', sm: '640px' }, maxHeight: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' } } }}>
      <DialogTitle>Seleccionar empresa</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <Stack spacing={2} sx={{ pt: 1, minHeight: 0, flex: 1 }}>
          <TextField autoFocus label="Buscar empresa" value={companyQuery} onChange={event => { setCompanyQuery(event.target.value); setCompanyPage(1); }} placeholder="Nombre o NIT" />
          {companyPickerLoading && <LinearProgress aria-label="Cargando empresas" sx={{ borderRadius: 1 }} />}
          {companyPickerError && <Alert severity="error">{companyPickerError}</Alert>}
          <Stack spacing={1} aria-busy={companyPickerLoading} sx={{ minHeight: 0, flex: 1, overflowY: 'auto', pr: 0.5, opacity: companyPickerLoading || companyPickerError ? 0.55 : 1, transition: 'opacity 180ms ease', '& > *': { animation: 'company-picker-appear 180ms ease both' }, '@keyframes company-picker-appear': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'translateY(0)' } } }}>
            {companyPickerLoading && !companyResults ? Array.from({ length: 5 }, (_value, index) => <Skeleton key={index} variant="rounded" height={62} />) : companyResults?.items.map(record => <Button key={record.company.id} disabled={companyPickerLoading || Boolean(companyPickerError)} variant="outlined" sx={{ justifyContent: 'flex-start', textAlign: 'left', minHeight: 62 }} onClick={() => { setOrganizationId(record.company.id); setOrganizationType('COMPANY'); setOrganizationTypeFilter('COMPANY'); setCompanyId(record.company.id); setCompanyName(record.company.businessName ?? record.company.tradeName ?? record.company.id); setSearch(''); setStatus(''); setRoleFilter(''); setThirdPartyId(''); setThirdPartyName(''); setInviteEmail(''); setPage(1); setResult(null); setCompanyPickerOpen(false); }}><Stack sx={{ alignItems: 'flex-start' }}><span>{record.company.businessName ?? record.company.tradeName ?? record.company.id}</span><Typography variant="caption">NIT {record.company.documentNumber}</Typography></Stack></Button>)}
            {companyResults && !companyResults.items.length && !companyPickerLoading && <Alert severity="info">No encontramos empresas con esa búsqueda.</Alert>}
          </Stack>
          {companyResults && <DataPagination page={companyPage} pageSize={companyResults.pageSize} total={companyResults.total} disabled={companyPickerLoading} label="Páginas de empresas"
            onPageChange={setCompanyPage} onPageSizeChange={value => { setCompanyPageSize(value); setCompanyPage(1); }} compact />}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={() => setCompanyPickerOpen(false)}>Cancelar</Button></DialogActions>
    </Dialog>
    <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { height: { xs: 'auto', sm: '480px' }, maxHeight: 'calc(100% - 32px)', display: 'flex', flexDirection: 'column' } } }}><DialogTitle>Filtros de usuarios</DialogTitle><DialogContent sx={{ overflowY: 'auto' }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, pt: 1 }}>
      <Typography sx={{ gridColumn: { sm: '1 / -1' } }}>La empresa se selecciona por separado. Los demás filtros se aplican al contexto seleccionado.</Typography>
      <TextField fullWidth autoFocus label="Buscar usuario o documento" value={pendingSearch} onChange={event => setPendingSearch(event.target.value)} placeholder="Nombre, correo o número de documento" sx={{ gridColumn: { md: '1 / -1' }, minWidth: 0 }} />
      <TextField fullWidth select label="Tipo de organización" value={draftOrganizationType} onChange={event => { setDraftOrganizationType(event.target.value as OrganizationFilter); setDraftRole(''); }} sx={{ minWidth: 0 }}>
        {canViewAllTypes && <MenuItem value="ALL">Todos</MenuItem>}<MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem>
      </TextField>
      {draftOrganizationType === 'THIRD_PARTY' && <Button fullWidth variant="outlined" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => { setThirdPartyQuery(''); setThirdPartyPickerOpen(true); }}>{thirdPartyName || 'Seleccionar tercero'}</Button>}
      <TextField fullWidth select label="Rol" value={draftRole} onChange={event => setDraftRole(event.target.value as InvitationRole | '')} sx={{ minWidth: 0 }}>
        <MenuItem value="">Todos los roles</MenuItem>
        {(draftOrganizationType === 'COMPANY' ? ['COMPANY_ADMIN'] as const : draftOrganizationType === 'THIRD_PARTY' ? ['THIRD_PARTY_ADMIN', 'DRIVER'] as const : ['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] as const).map(role => <MenuItem key={role} value={role}>{getRoleLabel(role)}</MenuItem>)}
      </TextField>
      <TextField fullWidth select label="Estado" value={draftStatus} onChange={event => setDraftStatus(event.target.value as 'ACTIVE' | 'INACTIVE' | '')} sx={{ minWidth: 0 }}>
        <MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activos</MenuItem><MenuItem value="INACTIVE">Suspendidos</MenuItem>
      </TextField>
    </Box></DialogContent><DialogActions><Button onClick={() => { setPendingSearch(''); setDraftOrganizationType('COMPANY'); setDraftRole(''); setDraftStatus(''); }}>Limpiar filtros</Button><Button onClick={() => setFiltersOpen(false)}>Cancelar</Button><Button variant="contained" onClick={applyFilters}>Aplicar filtros</Button></DialogActions></Dialog>
    <Dialog open={thirdPartyPickerOpen} onClose={() => setThirdPartyPickerOpen(false)} fullWidth maxWidth="sm"><DialogTitle>Seleccionar tercero</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField autoFocus label="Buscar tercero" value={thirdPartyQuery} onChange={event => setThirdPartyQuery(event.target.value)} placeholder="Nombre" />{thirdPartyError && <Alert severity="error">{thirdPartyError}</Alert>}{thirdPartyResults.map(record => <Button key={record.id} variant="outlined" sx={{ justifyContent: 'flex-start' }} onClick={() => { setThirdPartyId(record.id); setThirdPartyName(record.name); setInviteEmail(''); setThirdPartyPickerOpen(false); }}>{record.name}</Button>)}{!thirdPartyResults.length && !thirdPartyError && <Alert severity="info">Escribe el nombre para buscar terceros asociados.</Alert>}</Stack></DialogContent><DialogActions><Button onClick={() => setThirdPartyPickerOpen(false)}>Cancelar</Button></DialogActions></Dialog>
    <Dialog open={viewOpen} onClose={closeMemberView} fullWidth maxWidth="sm">
      <DialogTitle>Detalle del usuario</DialogTitle><DialogContent><Stack spacing={1} sx={{ pt: 1 }}>
        {viewLoading && <Stack role="status" aria-label="Cargando información del usuario" spacing={1} sx={{ py: 1 }}><LinearProgress sx={{ borderRadius: 1 }} /><Skeleton variant="text" width="58%" /><Skeleton variant="text" width="82%" /><Skeleton variant="text" width="66%" /><Skeleton variant="rounded" height={44} /></Stack>}{viewError && <Alert severity="error">{viewError}</Alert>}
        {viewMember && <><Typography><strong>Nombre:</strong> {viewMember.profile?.fullName ?? 'Perfil no disponible'}</Typography>
          <Typography><strong>Correo:</strong> {viewMember.profile?.email ?? 'No disponible'}</Typography>
          <Typography><strong>Documento:</strong> {viewMember.profile ? `${viewMember.profile.documentType} · ${viewMember.profile.documentNumber}` : 'No disponible'}</Typography>
          <Typography><strong>Empresa:</strong> {companyName || (target?.organizationType === 'COMPANY' ? active?.kind === 'ORGANIZATION' ? active.organizationName : 'No disponible' : 'No disponible')}</Typography>
          <Typography><strong>Organización:</strong> {organizationLabel(viewMember)}</Typography>
          <Typography><strong>Estado:</strong> {viewMember.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}</Typography>
          <Typography><strong>Roles:</strong> {viewMember.roles.map(role => getRoleLabel(role)).join(', ')}</Typography></>}
      </Stack></DialogContent><DialogActions><Button onClick={closeMemberView}>Cerrar</Button></DialogActions>
    </Dialog>
    <Dialog open={suspendMember !== null} onClose={() => !busy && setSuspendMember(null)}>
      <DialogTitle>{suspendMember?.status === 'ACTIVE' ? 'Suspender asociado' : 'Reactivar asociado'}</DialogTitle>
      <DialogContent><Typography>{suspendMember?.status === 'ACTIVE' ? 'El usuario perderá acceso operativo a esta organización. Sus datos y el historial se conservarán.' : 'El usuario volverá a tener acceso según los roles activos de esta organización.'}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setSuspendMember(null)} disabled={busy}>Cancelar</Button><Button color={suspendMember?.status === 'ACTIVE' ? 'warning' : 'primary'} variant="contained" onClick={confirmStatus} disabled={busy}>{suspendMember?.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}</Button></DialogActions>
    </Dialog>
  </Stack>;
}
