import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Paper, Skeleton, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { SuccessNotice } from '@/shared/components/success-notice';
import { AppliedFilters } from '@/shared/components/applied-filters';
import { ListFilterDialog } from '@/shared/components/list-filter-dialog';
import { MobileSortControl } from '@/shared/components/mobile-sort-control';
import { StatusChip } from '@/shared/components/status-chip';
import { ListFeedback } from '@/shared/components/list-feedback';
import { FormDialog } from '@/shared/components/form-dialog';
import { CompanySelectionField } from '@/shared/components/company-selection-field';
import { CompanyPickerDialog } from '@/shared/components/company-picker-dialog';
import type { CompanyRecord } from '@/modules/company-management/domain/company';
import { getRoleLabel } from '@shared/role-labels';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import { ThirdPartyPicker } from '@/modules/third-party-management/presentation/third-party-picker';
import type { IdentityCandidate, InvitationApi, InvitationRole, MembershipRecord, OrganizationTarget } from '../application/invitation-api';

type OrganizationFilter = 'ALL' | 'COMPANY' | 'THIRD_PARTY';
type MembershipSortKey = 'user' | 'company' | 'organization' | 'role' | 'status';

function failureMessage(error: unknown) {
  if (error instanceof RequestError) return ({ LAST_ROLE_REQUIRED: 'La pertenencia debe conservar al menos un rol.', LAST_ADMINISTRATOR_REQUIRED: 'La empresa debe conservar un administrador.', VERSION_CONFLICT: 'La pertenencia cambió; recarga los datos.', INVALID_ROLES: 'Los roles no se pueden asignar en este ámbito.' } as Record<string, string>)[error.businessCode] ?? 'No fue posible completar el cambio.';
  return errorMessage(error instanceof ApplicationError ? error.code : 'UNEXPECTED');
}

export function MembershipPage({ api, context, authorization, companies }: { api: InvitationApi; context: ContextStore; authorization: AuthorizationStore; companies?: CompanyApi }) {
  const contextState = useStore(context); const auth = useStore(authorization); const active = contextState.activeContext;
  const initialOrganizationFilter: OrganizationFilter = auth.snapshot?.roles.includes('APP_ADMIN') ? 'ALL' : 'COMPANY';
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
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companyPickerForFilters, setCompanyPickerForFilters] = useState(false); const [draftCompanyId, setDraftCompanyId] = useState(''); const [draftCompanyName, setDraftCompanyName] = useState('');
  const [companyPickerForInvite, setCompanyPickerForInvite] = useState(false); const [inviteCompanyId, setInviteCompanyId] = useState(''); const [inviteCompanyName, setInviteCompanyName] = useState('');
  const [companyName, setCompanyName] = useState(active?.kind === 'ORGANIZATION' && active.organizationType === 'COMPANY' ? active.organizationName : '');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<InvitationRole | ''>(''); const [draftRole, setDraftRole] = useState<InvitationRole | ''>('');
  const [filtersOpen, setFiltersOpen] = useState(false); const [organizationTypeFilter, setOrganizationTypeFilter] = useState<OrganizationFilter>(initialOrganizationFilter); const [draftOrganizationType, setDraftOrganizationType] = useState<OrganizationFilter>(initialOrganizationFilter);
  const [thirdPartyId, setThirdPartyId] = useState(''); const [thirdPartyName, setThirdPartyName] = useState('');
  const [thirdPartyPickerOpen, setThirdPartyPickerOpen] = useState(false);
  const [filterThirdPartyPickerOpen, setFilterThirdPartyPickerOpen] = useState(false);
  const [draftThirdPartyId, setDraftThirdPartyId] = useState(''); const [draftThirdPartyName, setDraftThirdPartyName] = useState('');
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
  const searchThirdParties = useCallback((selectedCompanyId: string, query: string, signal: AbortSignal) => {
    if (!authorizationAvailable) return Promise.reject(new ApplicationError('FORBIDDEN'));
    return api.thirdParties(auth.scope, selectedCompanyId, query, signal);
  }, [api, auth.scope, authorizationAvailable]);
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
    const selectedCompanyId = inviteCompanyId || companyId;
    if (inviteOrganizationType === 'COMPANY') return selectedCompanyId ? { organizationId: selectedCompanyId, organizationType: 'COMPANY', companyId: null } : null;
    return thirdPartyId && selectedCompanyId ? { organizationId: thirdPartyId, organizationType: 'THIRD_PARTY', companyId: selectedCompanyId } : null;
  }, [inviteOrganizationType, companyId, inviteCompanyId, thirdPartyId]);
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
    const allCompanies = organizationTypeFilter === 'ALL' && !companyId && roles.includes('APP_ADMIN');
    if ((!target && !allCompanies) || contextState.status !== 'ready' || !authorizationAvailable) { setResult(null); setLoading(false); return; }
    let capture: ReturnType<ContextStore['capture']> | undefined;
    setError(null); setLoading(true);
    try {
      capture = context.capture();
      const filters = { search: search.trim(), role: roleFilter || undefined };
      const value = organizationTypeFilter === 'ALL'
        ? companyId ? await api.membershipsByCompany(capture.scope, companyId, status, page, filters, capture.signal, pageSize)
          : await api.membershipsAll(capture.scope, status, page, filters, capture.signal, pageSize)
        : await api.memberships(capture.scope, target!, status, page, filters, capture.signal, pageSize);
      if (mounted.current && request === generation.current && capture.isCurrent()) setResult(value);
    } catch (failure) { if (mounted.current && request === generation.current && (!capture || capture.isCurrent())) setError(failureMessage(failure)); }
    finally { capture?.release(); if (mounted.current && request === generation.current) setLoading(false); }
  }, [api, authorizationAvailable, context, contextState.status, target, organizationTypeFilter, companyId, status, page, pageSize, search, roleFilter, roles]);
  useEffect(() => {
    void load();
    const requestGeneration = generation;
    return () => { requestGeneration.current++; };
  }, [load]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const mutate = async (operation: (scope: ReturnType<ContextStore['capture']>['scope'], signal: AbortSignal) => Promise<unknown>, allowGlobalTarget = false) => {
    if (busy || (!target && !allowGlobalTarget)) return;
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
    }), roles.includes('APP_ADMIN'));
  };
  const openFilters = () => {
    setDraftOrganizationType(organizationTypeFilter); setDraftStatus(status); setDraftRole(roleFilter); setPendingSearch(search); setDraftCompanyId(companyId); setDraftCompanyName(companyName); setDraftThirdPartyId(thirdPartyId); setDraftThirdPartyName(thirdPartyName); setFiltersOpen(true);
  };
  const openInvite = () => {
    if (roles.includes('APP_ADMIN') && !companyId) { setCompanyPickerForInvite(true); openCompanyPicker(); return; }
    const nextOrganizationType = target?.organizationType === 'THIRD_PARTY' || roles.includes('COMPANY_ADMIN') ? 'THIRD_PARTY' : 'COMPANY';
    const nextRole = nextOrganizationType === 'COMPANY' ? 'COMPANY_ADMIN' : roles.includes('COMPANY_ADMIN') ? 'THIRD_PARTY_ADMIN' : 'DRIVER';
    setError(null); setInviteEmail(''); setInviteOrganizationType(nextOrganizationType); setInviteRole(nextRole); setInviteOpen(true);
  };
  const openCompanyPicker = () => setCompanyPickerOpen(true);
  const chooseCompany = (record: CompanyRecord) => {
    const name = record.company.businessName ?? record.company.tradeName ?? record.company.id;
    if (companyPickerForFilters) { setDraftCompanyId(record.company.id); setDraftCompanyName(name); setDraftThirdPartyId(''); setDraftThirdPartyName(''); setCompanyPickerForFilters(false); setCompanyPickerOpen(false); return; }
    if (companyPickerForInvite) { setInviteCompanyId(record.company.id); setInviteCompanyName(name); setInviteOrganizationType('COMPANY'); setCompanyPickerForInvite(false); setCompanyPickerOpen(false); setInviteOpen(true); return; }
    setOrganizationId(record.company.id); setOrganizationType('COMPANY'); setOrganizationTypeFilter('COMPANY'); setCompanyId(record.company.id); setCompanyName(name); setSearch(''); setStatus(''); setRoleFilter(''); setThirdPartyId(''); setThirdPartyName(''); setInviteEmail(''); setPage(1); setResult(null); setCompanyPickerOpen(false);
  };
  const openFilterCompanyPicker = () => { setCompanyPickerForFilters(true); setCompanyPickerForInvite(false); openCompanyPicker(); };
  const applyFilters = () => {
    if (draftOrganizationType === 'ALL' && !canViewAllTypes) return;
    if (draftOrganizationType === 'THIRD_PARTY' && (!draftCompanyId || !draftThirdPartyId)) return;
    if (draftOrganizationType === 'COMPANY' && !draftCompanyId) return;
    if (draftOrganizationType === 'ALL' && !draftCompanyId && !roles.includes('APP_ADMIN')) return;
    const resolvedType = draftOrganizationType === 'THIRD_PARTY' ? 'THIRD_PARTY' : 'COMPANY';
    const nextId = resolvedType === 'COMPANY' ? draftCompanyId : draftThirdPartyId;
    const nextSearch = pendingSearch.trim();
    const changed = draftCompanyId !== companyId || draftOrganizationType !== organizationTypeFilter || nextId !== organizationId || draftThirdPartyId !== thirdPartyId || draftStatus !== status || draftRole !== roleFilter || nextSearch !== search;
    if (!changed) { setFiltersOpen(false); return; }
    if (draftCompanyId !== companyId) { setCompanyId(draftCompanyId); setCompanyName(draftCompanyName); }
    setOrganizationTypeFilter(draftOrganizationType); setOrganizationType(resolvedType);
    setOrganizationId(nextId);
    if (draftOrganizationType === 'THIRD_PARTY') { setThirdPartyId(draftThirdPartyId); setThirdPartyName(draftThirdPartyName); }
    else { setThirdPartyId(''); setThirdPartyName(''); }
    setStatus(draftStatus); setRoleFilter(draftRole); setSearch(nextSearch); setPage(1); setFiltersOpen(false);
  };
  const clearFilter = (name: 'search' | 'status' | 'role' | 'organization' | 'company') => {
    if (name === 'search') setSearch('');
    if (name === 'status') setStatus('');
    if (name === 'role') setRoleFilter('');
    if (name === 'organization') { setOrganizationType('COMPANY'); setOrganizationTypeFilter('COMPANY'); setOrganizationId(companyId); setThirdPartyId(''); setThirdPartyName(''); }
    if (name === 'company' && roles.includes('APP_ADMIN')) { setCompanyId(''); setCompanyName(''); setOrganizationTypeFilter('ALL'); setOrganizationId(''); }
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
  const memberTableActions = (member: MembershipRecord) => {
    const memberTarget = targetFor(member); const mutableRoles = memberTarget ? mutableRolesFor(memberTarget.organizationType) : [];
    const manageable = mutableRoles.length > 0 && member.roles.every(role => mutableRoles.includes(role));
    return <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' }}>
      <DataTableAction label={`Consultar usuario ${member.profile?.fullName ?? ''}`.trim()} disabled={busy} onClick={() => void showMember(member)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5c-5 0-9.27 3.11-11 7 1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></SvgIcon></DataTableAction>
      {member.status === 'ACTIVE' && manageable && <DataTableAction label={`Suspender usuario ${member.profile?.fullName ?? ''}`.trim()} disabled={busy} onClick={() => setSuspendMember(member)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z" /></SvgIcon></DataTableAction>}
      {manageable && <>{mutableRoles.map(role => member.roles.includes(role)
        ? member.roles.length > 1 && <DataTableAction key={role} label={`Quitar rol ${getRoleLabel(role)}`} disabled={busy} onClick={() => updateRole(member, role, true)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M19 13H5v-2h14v2Z" /></SvgIcon></DataTableAction>
        : <DataTableAction key={role} label={`Asignar rol ${getRoleLabel(role)}`} disabled={busy} onClick={() => updateRole(member, role, false)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z" /></SvgIcon></DataTableAction>)}
        {member.status === 'INACTIVE' && <DataTableAction label={`Reactivar usuario ${member.profile?.fullName ?? ''}`.trim()} disabled={busy} onClick={() => setSuspendMember(member)}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 2a10 10 0 1 0 7.07 2.93l-1.42 1.42A8 8 0 1 1 12 4V1l5 4-5 4V6a6 6 0 1 0 5.66 8h2.08A8 8 0 1 1 12 2Z" /></SvgIcon></DataTableAction>}</>}
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
    <PageHeader title="Usuarios" />
    {!companies && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField select label="Tipo de organización" value={organizationType} onChange={event => setOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY')} sx={{ minWidth: 180 }}><MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem></TextField><TextField label="ID de organización" value={organizationId} onChange={event => setOrganizationId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />{organizationType === 'THIRD_PARTY' && <TextField label="ID de empresa relacionada (opcional)" value={companyId} onChange={event => setCompanyId(event.target.value)} slotProps={{ htmlInput: { maxLength: 128 } }} />}</Stack>}

    <AppliedFilters filters={[
      ...(roles.includes('APP_ADMIN') && companyId ? [{ key: 'company', label: `Empresa: ${companyName || companyId}` }] : []),
      ...(search ? [{ key: 'search', label: `Búsqueda: ${search}` }] : []),
      ...(status ? [{ key: 'status', label: `Estado: ${status === 'ACTIVE' ? 'Activo' : 'Suspendido'}` }] : []),
      ...(roleFilter ? [{ key: 'role', label: `Rol: ${getRoleLabel(roleFilter)}` }] : []),
      ...(organizationTypeFilter === 'THIRD_PARTY' ? [{ key: 'organization', label: `Tercero: ${thirdPartyName || organizationId}` }] : []),
    ]} onRemove={key => clearFilter(key as 'search' | 'status' | 'role' | 'organization' | 'company')} onClear={() => { clearFilter('search'); clearFilter('status'); clearFilter('role'); clearFilter('organization'); if (roles.includes('APP_ADMIN')) clearFilter('company'); }} />
    {error && <Alert severity="error">{error}</Alert>}{notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {!companyId && !roles.includes('APP_ADMIN') && <Alert severity="info">Selecciona una empresa desde los filtros para consultar los usuarios asociados.</Alert>}
    {(companyId || companies) && (loading || result || companies) && <DataTable loading={loading} mobileSortAction={<MobileSortControl fields={[
      { key: 'user', label: 'Usuario' }, { key: 'company', label: 'Empresa' }, { key: 'organization', label: 'Organización' }, { key: 'role', label: 'Rol' }, { key: 'status', label: 'Estado' },
    ]} sortBy={sortBy} direction={sortDirection} onChange={(key, direction) => { setSortBy(key as MembershipSortKey); setSortDirection(direction); }} />}
      toolbar={!loading ? <>
        {canInvite && (result || roles.includes('APP_ADMIN')) && <DataTableAction label="Asociar usuario" primary onClick={openInvite} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM7 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h12v-2c0-2.66-5.33-4-8-4ZM7 14c-.34 0-.73.02-1.15.06C3.63 14.36 0 15.54 0 18v2h5v-2c0-1.72.91-3.02 2.4-3.94L7 14Zm14-6V5h-2v3h-3v2h3v3h2v-3h3V8h-3Z" /></SvgIcon></DataTableAction>}
        {companies && <DataTableAction label="Filtrar usuarios" onClick={openFilters}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>}
      </> : undefined}
      pagination={result && result.total > 0 && <DataPagination page={page} pageSize={result.pageSize} total={result.total} disabled={loading} label="Páginas de usuarios vinculados"
        onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel="Actualizar usuarios" refreshDisabled={busy} />}>
      {(companyId || roles.includes('APP_ADMIN')) && loading && <Alert severity="info" role="status" sx={{ display: { xs: 'block', md: 'none' } }}>Cargando usuarios…</Alert>}
      {result && !loading && !result.items.length && <ListFeedback kind="empty" title="No hay usuarios que coincidan con la consulta.">Ajusta la búsqueda o limpia los filtros.</ListFeedback>}
      {(loading || Boolean(result)) && <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small" aria-label="Usuarios asociados" sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { minWidth: 0, overflowWrap: 'anywhere' } }}>
          <TableHead><TableRow>
            <TableCell sx={{ width: { xs: '28%', xl: '16%' } }} sortDirection={sortBy === 'user' ? sortDirection : false}>{sortHeader('user', 'Usuario')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' }, width: '12%' }} sortDirection={sortBy === 'company' ? sortDirection : false}>{sortHeader('company', 'Empresa')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' }, width: '14%' }} sortDirection={sortBy === 'organization' ? sortDirection : false}>{sortHeader('organization', 'Organización')}</TableCell>
            <TableCell sx={{ width: { xs: '25%', xl: '19%' } }} sortDirection={sortBy === 'role' ? sortDirection : false}>{sortHeader('role', 'Rol')}</TableCell>
            <TableCell sx={{ width: { xs: '22%', xl: '15%' }, minWidth: { xs: 0, xl: 112 } }} sortDirection={sortBy === 'status' ? sortDirection : false}>{sortHeader('status', 'Estado')}</TableCell><TableCell sx={{ width: { xs: '25%', xl: '24%' } }}>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>{loading ? <TableLoadingState columns={6} rows={5} label="Cargando usuarios" responsiveLayouts={[
            { columns: 4, rowSx: { display: { xs: 'none', md: 'table-row', xl: 'none' } } },
            { columns: 6, rowSx: { display: { xs: 'none', xl: 'table-row' } } },
          ]} /> : sortedItems.map(member => <TableRow key={member.id} hover>
            <TableCell><Stack><Typography>{member.profile?.fullName ?? 'Perfil no disponible'}</Typography>{member.profile && <Typography variant="caption">{member.profile.documentType} · {member.profile.documentNumber}</Typography>}</Stack></TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{companyName || 'No disponible'}</TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{organizationLabel(member)}</TableCell>
            <TableCell>{member.roles.map(role => getRoleLabel(role)).join(', ')}</TableCell>
            <TableCell><StatusChip label={member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'} tone={member.status === 'ACTIVE' ? 'success' : 'danger'} /></TableCell>
            <TableCell>{memberTableActions(member)}</TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </DataTableSurface>}
      {(companyId || roles.includes('APP_ADMIN')) && !loading && sortedItems.length > 0 && <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{sortedItems.map(member => <Paper variant="outlined" key={member.id} sx={{ p: 2, minWidth: 0 }}><Stack spacing={1}>
        <Typography variant="h6">{member.profile?.fullName ?? 'Perfil no disponible'}</Typography>
        {member.profile && <Typography>Documento: {member.profile.documentType} · {member.profile.documentNumber}</Typography>}
        <Typography>Empresa: {companyName || 'No disponible'}</Typography>
        <Typography>Organización: {organizationLabel(member)}</Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Typography>Estado:</Typography><StatusChip label={member.status === 'ACTIVE' ? 'Activo' : 'Suspendido'} tone={member.status === 'ACTIVE' ? 'success' : 'danger'} /></Stack><Typography>Roles: {member.roles.map(role => getRoleLabel(role)).join(', ')}</Typography>
        {memberActions(member)}
      </Stack></Paper>)}</Stack>}
    </DataTable>}
    <FormDialog open={inviteOpen} onClose={() => setInviteOpen(false)} busy={busy} maxWidth="sm" title="Asociar usuario" actions={<>
      <Button onClick={() => setInviteOpen(false)} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={createInvitation} disabled={busy || !invitationTarget || !inviteEmail.trim() || !inviteRoles.length}>{busy ? 'Enviando…' : 'Enviar invitación'}</Button>
    </>}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Ingresa el correo de la persona y selecciona el destino de su asociación.</Typography>
        {(roles.includes('APP_ADMIN') || companyId) && <CompanySelectionField label="Empresa destino" value={inviteCompanyName || companyName} placeholder="Seleccionar empresa" onClick={() => { setCompanyPickerForInvite(true); setCompanyPickerForFilters(false); openCompanyPicker(); }} />}
        {target?.organizationType === 'COMPANY' && <TextField select label="Tipo de organización" value={inviteOrganizationType} onChange={event => { setInviteOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY'); setInviteEmail(''); if (event.target.value === 'THIRD_PARTY') { setThirdPartyId(''); setThirdPartyName(''); } }}>
          <MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem>
        </TextField>}
        {inviteOrganizationType === 'THIRD_PARTY' && <Button variant="outlined" onClick={() => setThirdPartyPickerOpen(true)}>{thirdPartyName || 'Seleccionar tercero'}</Button>}
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
      </Stack>
    </FormDialog>
    {companies && <CompanyPickerDialog open={companyPickerOpen} api={companies} scope={auth.scope} onChoose={chooseCompany} onClose={() => { setCompanyPickerForFilters(false); setCompanyPickerForInvite(false); setCompanyPickerOpen(false); }} />}
    <ListFilterDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={applyFilters} title="Filtros de usuarios" maxWidth="sm" leadingAction={<Button onClick={() => { setPendingSearch(''); setDraftOrganizationType('COMPANY'); setDraftRole(''); setDraftStatus(''); setDraftCompanyId(companyId); setDraftCompanyName(companyName); setDraftThirdPartyId(''); setDraftThirdPartyName(''); }}>Limpiar filtros</Button>}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, pt: 1 }}>
      <Typography sx={{ gridColumn: { sm: '1 / -1' } }}>Selecciona empresa y combina los filtros para consultar usuarios asociados.</Typography>
      {companies && <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}><CompanySelectionField value={draftCompanyName} placeholder="Todas las empresas" onClick={openFilterCompanyPicker} /></Box>}
      <TextField fullWidth autoFocus label="Buscar usuario o documento" value={pendingSearch} onChange={event => setPendingSearch(event.target.value)} placeholder="Nombre, correo o número de documento" sx={{ gridColumn: { md: '1 / -1' }, minWidth: 0 }} />
      <TextField fullWidth select label="Tipo de organización" value={draftOrganizationType} onChange={event => { const next = event.target.value as OrganizationFilter; setDraftOrganizationType(next); setDraftRole(''); if (next !== 'THIRD_PARTY') { setDraftThirdPartyId(''); setDraftThirdPartyName(''); } }} sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
        {canViewAllTypes && <MenuItem value="ALL">Todos</MenuItem>}<MenuItem value="COMPANY">Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem>
      </TextField>
      {draftOrganizationType === 'THIRD_PARTY' && <Stack spacing={1} sx={{ gridColumn: { md: '1 / -1' }, minWidth: 0 }}><Button fullWidth variant="outlined" disabled={!draftCompanyId} sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => setFilterThirdPartyPickerOpen(true)}>{draftThirdPartyName || 'Seleccionar tercero'}</Button>{!draftCompanyId && <Alert severity="info">Selecciona una empresa para consultar sus terceros.</Alert>}</Stack>}
      <TextField fullWidth select label="Rol" value={draftRole} onChange={event => setDraftRole(event.target.value as InvitationRole | '')} sx={{ minWidth: 0 }}>
        <MenuItem value="">Todos los roles</MenuItem>
        {(draftOrganizationType === 'COMPANY' ? ['COMPANY_ADMIN'] as const : draftOrganizationType === 'THIRD_PARTY' ? ['THIRD_PARTY_ADMIN', 'DRIVER'] as const : ['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] as const).map(role => <MenuItem key={role} value={role}>{getRoleLabel(role)}</MenuItem>)}
      </TextField>
      <TextField fullWidth select label="Estado" value={draftStatus} onChange={event => setDraftStatus(event.target.value as 'ACTIVE' | 'INACTIVE' | '')} sx={{ minWidth: 0 }}>
        <MenuItem value="">Todos</MenuItem><MenuItem value="ACTIVE">Activos</MenuItem><MenuItem value="INACTIVE">Suspendidos</MenuItem>
      </TextField>
      </Box>
    </ListFilterDialog>
      <ThirdPartyPicker open={filterThirdPartyPickerOpen} companyId={draftCompanyId} search={searchThirdParties}
      onChoose={record => { setDraftThirdPartyId(record.id); setDraftThirdPartyName(record.name); setFilterThirdPartyPickerOpen(false); }} onClose={() => setFilterThirdPartyPickerOpen(false)} />
    <ThirdPartyPicker open={thirdPartyPickerOpen} companyId={inviteCompanyId || companyId} search={searchThirdParties}
      onChoose={record => { setThirdPartyId(record.id); setThirdPartyName(record.name); setInviteEmail(''); setThirdPartyPickerOpen(false); }} onClose={() => setThirdPartyPickerOpen(false)} />
    <FormDialog open={viewOpen} onClose={closeMemberView} maxWidth="sm" title="Detalle del usuario" actions={<Button onClick={closeMemberView}>Cerrar</Button>}>
      <Stack spacing={1} sx={{ pt: 1 }}>
        {viewLoading && <Stack role="status" aria-label="Cargando información del usuario" spacing={1} sx={{ py: 1 }}><LinearProgress sx={{ borderRadius: 1 }} /><Skeleton variant="text" width="58%" /><Skeleton variant="text" width="82%" /><Skeleton variant="text" width="66%" /><Skeleton variant="rounded" height={44} /></Stack>}{viewError && <Alert severity="error">{viewError}</Alert>}
        {viewMember && <><Typography><strong>Nombre:</strong> {viewMember.profile?.fullName ?? 'Perfil no disponible'}</Typography>
          <Typography><strong>Correo:</strong> {viewMember.profile?.email ?? 'No disponible'}</Typography>
          <Typography><strong>Documento:</strong> {viewMember.profile ? `${viewMember.profile.documentType} · ${viewMember.profile.documentNumber}` : 'No disponible'}</Typography>
          <Typography><strong>Empresa:</strong> {companyName || (target?.organizationType === 'COMPANY' ? active?.kind === 'ORGANIZATION' ? active.organizationName : 'No disponible' : 'No disponible')}</Typography>
          <Typography><strong>Organización:</strong> {organizationLabel(viewMember)}</Typography>
          <Typography><strong>Estado:</strong> {viewMember.status === 'ACTIVE' ? 'Activo' : 'Suspendido'}</Typography>
          <Typography><strong>Roles:</strong> {viewMember.roles.map(role => getRoleLabel(role)).join(', ')}</Typography></>}
      </Stack>
    </FormDialog>
    <Dialog open={suspendMember !== null} onClose={() => !busy && setSuspendMember(null)}>
      <DialogTitle>{suspendMember?.status === 'ACTIVE' ? 'Suspender asociado' : 'Reactivar asociado'}</DialogTitle>
      <DialogContent><Typography>{suspendMember?.status === 'ACTIVE' ? 'El usuario perderá acceso operativo a esta organización. Sus datos y el historial se conservarán.' : 'El usuario volverá a tener acceso según los roles activos de esta organización.'}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setSuspendMember(null)} disabled={busy}>Cancelar</Button><Button color={suspendMember?.status === 'ACTIVE' ? 'warning' : 'primary'} variant="contained" onClick={confirmStatus} disabled={busy}>{suspendMember?.status === 'ACTIVE' ? 'Suspender' : 'Reactivar'}</Button></DialogActions>
    </Dialog>
  </Stack>;
}
