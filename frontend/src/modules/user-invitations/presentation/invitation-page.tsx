import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useStore } from 'zustand';
import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, SvgIcon, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import type { AuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { CompanyApi } from '@/modules/company-management/application/company-api';
import { ThirdPartyPicker, type ThirdPartyOption } from '@/modules/third-party-management/presentation/third-party-picker';
import { ApplicationError } from '@/shared/application/application-error';
import { RequestError } from '@/shared/application/request-error';
import { errorMessage } from '@/shared/components/error-messages';
import { DataPagination } from '@/shared/components/data-pagination';
import { DataTable, DataTableAction, DataTableSortHeader, DataTableSurface } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
import { SuccessNotice } from '@/shared/components/success-notice';
import { TableLoadingState } from '@/shared/components/table-loading-state';
import { AppliedFilters } from '@/shared/components/applied-filters';
import { ListFilterDialog } from '@/shared/components/list-filter-dialog';
import { MobileSortControl } from '@/shared/components/mobile-sort-control';
import { StatusChip } from '@/shared/components/status-chip';
import { FormDialog } from '@/shared/components/form-dialog';
import { ListFeedback } from '@/shared/components/list-feedback';
import { CompanySelectionField } from '@/shared/components/company-selection-field';
import { CompanyPickerDialog } from '@/shared/components/company-picker-dialog';
import type { CompanyRecord } from '@/modules/company-management/domain/company';
import { getRoleLabel } from '@shared/role-labels';
import type { IdentityCandidate, InvitationApi, InvitationListTarget, InvitationRecord, InvitationRole, InvitationStatus, OrganizationTarget } from '../application/invitation-api';

type InvitationSortKey = 'email' | 'role' | 'status' | 'delivery' | 'created' | 'expires';
type InvitationAction = { kind: 'cancel' | 'resend'; invitation: InvitationRecord } | null;
const deliveryStatusLabel: Record<InvitationRecord['deliveryStatus'], string> = { UNKNOWN: 'Pendiente', LOGGED: 'Completada', FAILED: 'Fallida' };
const invitationStatusLabel: Record<InvitationStatus, string> = { PENDING: 'Pendiente', ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada', EXPIRED: 'Vencida' };
const invitationStatusTone: Record<InvitationStatus, 'warning' | 'success' | 'danger' | 'neutral'> = { PENDING: 'warning', ACCEPTED: 'success', REJECTED: 'danger', CANCELLED: 'neutral', EXPIRED: 'warning' };
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
    <StatusChip label={invitationStatusLabel[invitation.status]} tone={invitationStatusTone[invitation.status]} />
    {date && <Typography component="time" dateTime={date} variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', lineHeight: 1.2, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{formatStatusDate(date)}</Typography>}
  </Stack>;
}

export function InvitationPage({ api, context, authorization, companies }: { api: InvitationApi; context: ContextStore; authorization: AuthorizationStore; companies?: CompanyApi }) {
  const contextState = useStore(context); const auth = useStore(authorization); const active = contextState.activeContext;
  const location = useLocation(); const navigate = useNavigate();
  const snapshotRoles = auth.snapshot?.roles;
  const roles = useMemo(() => snapshotRoles ?? [], [snapshotRoles]);
  const canChangeOrganizationType = roles.includes('APP_ADMIN') || roles.includes('COMPANY_ADMIN') || active?.kind === 'ORGANIZATION' && active.roles.includes('COMPANY_ADMIN');
  const initialType: 'COMPANY' | 'THIRD_PARTY' | 'ALL' = canChangeOrganizationType ? 'ALL' : active?.kind === 'ORGANIZATION' ? active.organizationType : 'ALL';
  const [organizationType, setOrganizationType] = useState<'COMPANY' | 'THIRD_PARTY' | 'ALL'>(initialType);
  const [organizationId, setOrganizationId] = useState(active?.kind === 'ORGANIZATION' && !active.roles.includes('COMPANY_ADMIN') ? active.organizationId : '');
  const [companyId, setCompanyId] = useState(active?.kind === 'ORGANIZATION' ? active.organizationType === 'COMPANY' ? active.organizationId : auth.scope.companyId ?? '' : auth.scope.companyId ?? '');
  const [companyName, setCompanyName] = useState(active?.kind === 'ORGANIZATION' && active.organizationType === 'COMPANY' ? active.organizationName : '');
  const [draftCompanyId, setDraftCompanyId] = useState(companyId); const [draftCompanyName, setDraftCompanyName] = useState(active?.kind === 'ORGANIZATION' && active.organizationType === 'COMPANY' ? active.organizationName : '');
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
  const [createCompanyId, setCreateCompanyId] = useState(''); const [createCompanyName, setCreateCompanyName] = useState(''); const [companyPickerForCreate, setCompanyPickerForCreate] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(''); const [selectedRole, setSelectedRole] = useState<InvitationRole>('COMPANY_ADMIN');
  const [identityCandidates, setIdentityCandidates] = useState<readonly IdentityCandidate[]>([]); const [identitySearchBusy, setIdentitySearchBusy] = useState(false); const [identitySearchError, setIdentitySearchError] = useState<string | null>(null);
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [companyPickerForFilters, setCompanyPickerForFilters] = useState(false);
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
    ? canChooseCompany || companyId.trim() ? { organizationId: companyId.trim() || 'all', organizationType: 'ALL', companyId: companyId.trim() || null } : null
    : target, [canChooseCompany, companyId, organizationType, target]);
  const canFilterInvitations = Boolean(listTarget || canChooseCompany);
  const createTarget = useMemo<OrganizationTarget | null>(() => {
    if (createTargetType === 'COMPANY') { const selectedCompanyId = createCompanyId || companyId; return selectedCompanyId.trim() ? { organizationId: selectedCompanyId.trim(), organizationType: 'COMPANY', companyId: null } : null; }
    const selectedThirdPartyId = createTargetOrganizationId.trim();
    const selectedCompanyId = companyId.trim();
    const activeThirdParty = active?.kind === 'ORGANIZATION' && active.organizationType === 'THIRD_PARTY' && active.organizationId === selectedThirdPartyId;
    return selectedThirdPartyId && (selectedCompanyId || activeThirdParty)
      ? { organizationId: selectedThirdPartyId, organizationType: 'THIRD_PARTY', companyId: selectedCompanyId || null }
      : null;
  }, [active, companyId, createCompanyId, createTargetOrganizationId, createTargetType]);
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
  const openCompanyPicker = useCallback(() => setCompanyPickerOpen(true), []);
  const chooseCompany = (record: CompanyRecord) => {
    const name = record.company.businessName ?? record.company.tradeName ?? record.company.id;
    if (companyPickerForFilters) { setDraftCompanyId(record.company.id); setDraftCompanyName(name); setDraftOrganizationId(''); setDraftThirdPartyName(''); setCompanyPickerForFilters(false); setCompanyPickerOpen(false); return; }
    if (companyPickerForCreate) { setCreateCompanyId(record.company.id); setCreateCompanyName(name); setCreateTargetType('COMPANY'); setCompanyPickerForCreate(false); setCompanyPickerOpen(false); setCreateOpen(true); return; }
    setCompanyId(record.company.id); setCompanyName(name); setOrganizationType('ALL'); setOrganizationId(record.company.id); setThirdPartyName('');
    setCreateTargetType('COMPANY'); setCreateTargetOrganizationId(''); setCreateTargetThirdPartyName(''); setRecipientEmail(''); setIdentityCandidates([]);
    setStatus(''); setPage(1); setError(null); setCompanyPickerOpen(false);
  };
  const chooseOrganizationType = (next: 'COMPANY' | 'THIRD_PARTY' | 'ALL') => {
    setDraftOrganizationType(next); setDraftThirdPartyName('');
    setDraftOrganizationId(next === 'COMPANY' || next === 'ALL' ? draftCompanyId : '');
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
  const clearCompanyFilter = () => { if (!canChooseCompany) return; setCompanyId(''); setCompanyName(''); setOrganizationType('ALL'); setOrganizationId('all'); setPage(1); };
  const openFilters = () => {
    setDraftStatus(status); setDraftEmailFilter(emailFilter); setDraftRoleFilter(roleFilter); setDraftDeliveryFilter(deliveryFilter);
    setDraftOrganizationType(organizationType); setDraftOrganizationId(organizationId); setDraftThirdPartyName(thirdPartyName); setDraftCompanyId(companyId); setDraftCompanyName(companyName); setFiltersOpen(true);
  };
  const applyFilters = () => {
    const nextOrganizationId = draftOrganizationType === 'COMPANY' || draftOrganizationType === 'ALL' ? draftCompanyId || (canChooseCompany ? 'all' : '') : draftOrganizationId;
    const nextEmail = draftEmailFilter.trim();
    const changed = draftCompanyId !== companyId || draftOrganizationType !== organizationType || nextOrganizationId !== organizationId || draftStatus !== status || nextEmail !== emailFilter || draftRoleFilter !== roleFilter || draftDeliveryFilter !== deliveryFilter;
    if (!changed) { setFiltersOpen(false); return; }
    if (draftCompanyId !== companyId) { setCompanyId(draftCompanyId); setCompanyName(draftCompanyName); }
    setOrganizationType(draftOrganizationType); setOrganizationId(nextOrganizationId); setThirdPartyName(draftOrganizationType === 'THIRD_PARTY' ? draftThirdPartyName : '');
    setStatus(draftStatus); setEmailFilter(nextEmail); setRoleFilter(draftRoleFilter); setDeliveryFilter(draftDeliveryFilter); setPage(1); setFiltersOpen(false);
  };
  const resetDraftFilters = () => {
    const defaultType: 'COMPANY' | 'THIRD_PARTY' | 'ALL' = canChangeOrganizationType ? 'ALL' : initialType;
    setDraftStatus(''); setDraftEmailFilter(''); setDraftRoleFilter(''); setDraftDeliveryFilter(''); setDraftOrganizationType(defaultType);
    setDraftOrganizationId(defaultType === 'THIRD_PARTY' ? active?.kind === 'ORGANIZATION' ? active.organizationId : '' : draftCompanyId);
    setDraftThirdPartyName(defaultType === 'THIRD_PARTY' && active?.kind === 'ORGANIZATION' ? active.organizationName : '');
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
  const openCreateInvitation = useCallback(() => {
    const activeThirdParty = active?.kind === 'ORGANIZATION' && active.organizationType === 'THIRD_PARTY';
    if (roles.includes('APP_ADMIN') && !companyId && !activeThirdParty) { setCompanyPickerForCreate(true); openCompanyPicker(); return; }
    if (!companyId && !activeThirdParty) return;
    const companyAdmin = roles.includes('COMPANY_ADMIN') || active?.kind === 'ORGANIZATION' && active.roles.includes('COMPANY_ADMIN');
    const nextType = target?.organizationType ?? (companyAdmin ? 'THIRD_PARTY' : 'COMPANY');
    setCreateTargetType(nextType);
    setCreateTargetOrganizationId(nextType === 'THIRD_PARTY' && target?.organizationType === 'THIRD_PARTY' ? target.organizationId : '');
    setCreateTargetThirdPartyName(nextType === 'THIRD_PARTY' && target?.organizationType === 'THIRD_PARTY' ? thirdPartyName : '');
    setRecipientEmail(''); setIdentityCandidates([]); setIdentitySearchError(null);
    setSelectedRole(nextType === 'COMPANY' ? 'COMPANY_ADMIN' : roles.includes('COMPANY_ADMIN') ? 'THIRD_PARTY_ADMIN' : 'DRIVER');
    setError(null); setCreateOpen(true);
  }, [active, companyId, roles, target, thirdPartyName, openCompanyPicker]);
  useEffect(() => {
    const state = location.state as { readonly openCreateInvitation?: boolean } | null;
    if (!state?.openCreateInvitation) return;
    openCreateInvitation();
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate, openCreateInvitation]);
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
  const canCreateAction = roles.includes('APP_ADMIN') || (target ? Boolean(target.organizationType === 'THIRD_PARTY' && (roles.includes('COMPANY_ADMIN') || roles.includes('THIRD_PARTY_ADMIN')) && !busy) : Boolean(companyId && canCreateForThirdParty && !busy));
  const showTable = Boolean((listTarget && (loading || items)) || (canFilterInvitations && !listTarget));

  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <PageHeader title="Invitaciones" />
    <AppliedFilters filters={[
      ...(canChooseCompany && companyId ? [{ key: 'company', label: `Empresa: ${companyName || companyId}` }] : []),
      ...(emailFilter ? [{ key: 'email', label: `Correo: ${emailFilter}` }] : []),
      ...(roleFilter ? [{ key: 'role', label: `Rol: ${getRoleLabel(roleFilter)}` }] : []),
      ...(deliveryFilter ? [{ key: 'delivery', label: `Entrega: ${deliveryStatusLabel[deliveryFilter]}` }] : []),
      ...(status ? [{ key: 'status', label: `Estado: ${invitationStatusLabel[status]}` }] : []),
    ]} onRemove={key => { if (key === 'company') clearCompanyFilter(); else if (key === 'email') clearEmailFilter(); else if (key === 'role') clearRoleFilter(); else if (key === 'delivery') clearDeliveryFilter(); else if (key === 'status') clearStatusFilter(); }} onClear={clearFilters} />
    {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
    {notice && <SuccessNotice onClose={() => setNotice(null)}>{notice}</SuccessNotice>}
    {!listTarget && <Alert severity="info">Selecciona una empresa desde los filtros para consultar sus invitaciones.</Alert>}
    {canFilterInvitations && <DataTable loading={loading} mobileSortAction={<MobileSortControl fields={[
      { key: 'email', label: 'Correo' }, { key: 'role', label: 'Rol' }, { key: 'status', label: 'Estado' }, { key: 'delivery', label: 'Entrega' }, { key: 'created', label: 'Fecha de creación' }, { key: 'expires', label: 'Vencimiento' },
    ]} sortBy={sortBy} direction={sortDirection} onChange={(key, direction) => { setSortBy(key as InvitationSortKey); setSortDirection(direction); setPage(1); }} />} toolbar={<>
        {canCreateAction && <DataTableAction label="Crear invitación" primary onClick={openCreateInvitation} disabled={busy || loading}><SvgIcon fontSize="small" aria-hidden="true"><path d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4ZM7 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v2h12v-2c0-2.66-5.33-4-8-4ZM7 14c-.34 0-.73.02-1.15.06C3.63 14.36 0 15.54 0 18v2h5v-2c0-1.72.91-3.02 2.4-3.94L7 14Zm14-6V5h-2v3h-3v2h3v3h2v-3h3V8h-3Z" /></SvgIcon></DataTableAction>}
        <DataTableAction label="Filtrar invitaciones" onClick={openFilters} disabled={busy}><SvgIcon fontSize="small" aria-hidden="true"><path d="M3 5h18l-7.5 8.2V19l-3 1.7v-7.5L3 5z" /></SvgIcon></DataTableAction>
      </>}
      pagination={items && items.total > 0 ? <DataPagination page={page} pageSize={items.pageSize} total={items.total} disabled={loading} label="Páginas de invitaciones"
        onPageChange={setPage} onPageSizeChange={value => { setPageSize(value); setPage(1); }} onRefresh={() => void load()} refreshLabel="Actualizar invitaciones" refreshDisabled={busy} /> : undefined}>
      {listTarget && loading && <Alert severity="info" role="status" sx={{ display: { xs: 'block', md: 'none' } }}>Cargando invitaciones…</Alert>}
      {listTarget && items && !loading && sortedItems.length === 0 && <ListFeedback kind="empty" title="No hay usuarios que coincidan con la consulta.">Ajusta la búsqueda o limpia los filtros.</ListFeedback>}
      {showTable && <DataTableSurface loading={loading} sx={{ display: { xs: 'none', md: 'block' } }}>
        <Table size="small" aria-label="Invitaciones enviadas" sx={{ width: '100%', tableLayout: 'fixed', minWidth: 0 }}>
          <TableHead><TableRow>
            <TableCell sx={{ width: organizationType === 'ALL' ? { md: '34%', lg: '26%', xl: '15%' } : { md: '34%', lg: '26%', xl: '17%' } }} sortDirection={sortBy === 'email' ? sortDirection : false}>{sortHeader('email', 'Correo')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, width: organizationType === 'ALL' ? { lg: '16%', xl: '10%' } : { lg: '16%', xl: '11%' } }}>Empresa</TableCell>
            {organizationType === 'ALL' && <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' }, width: '11%' }}>Organización</TableCell>}
            <TableCell sx={{ width: organizationType === 'ALL' ? { md: '28%', lg: '22%', xl: '13%' } : { md: '28%', lg: '22%', xl: '14%' } }} sortDirection={sortBy === 'role' ? sortDirection : false}>{sortHeader('role', 'Rol')}</TableCell>
            <TableCell sx={{ width: organizationType === 'ALL' ? { md: '18%', lg: '16%', xl: '11%' } : { md: '18%', lg: '16%', xl: '12%' } }} sortDirection={sortBy === 'status' ? sortDirection : false}>{sortHeader('status', 'Estado')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' }, width: organizationType === 'ALL' ? '10%' : '11%' }} sortDirection={sortBy === 'delivery' ? sortDirection : false}>{sortHeader('delivery', 'Entrega')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' }, width: organizationType === 'ALL' ? '10%' : '11%' }} sortDirection={sortBy === 'created' ? sortDirection : false}>{sortHeader('created', 'Creada')}</TableCell>
            <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' }, width: organizationType === 'ALL' ? '10%' : '11%' }} sortDirection={sortBy === 'expires' ? sortDirection : false}>{sortHeader('expires', 'Vence')}</TableCell>
            <TableCell sx={{ width: organizationType === 'ALL' ? { md: '20%', lg: '20%', xl: '10%' } : { md: '20%', lg: '20%', xl: '13%' } }}>Acciones</TableCell>
          </TableRow></TableHead>
          <TableBody>{loading ? <TableLoadingState columns={organizationType === 'ALL' ? 9 : 8} rows={5} label="Cargando invitaciones" responsiveLayouts={organizationType === 'ALL'
            ? [
              { columns: 4, rowSx: { display: { xs: 'none', md: 'table-row', lg: 'none' } } },
              { columns: 5, rowSx: { display: { xs: 'none', lg: 'table-row', xl: 'none' } } },
              { columns: 9, rowSx: { display: { xs: 'none', xl: 'table-row' } } },
            ]
            : [
              { columns: 4, rowSx: { display: { xs: 'none', md: 'table-row', lg: 'none' } } },
              { columns: 5, rowSx: { display: { xs: 'none', lg: 'table-row', xl: 'none' } } },
              { columns: 8, rowSx: { display: { xs: 'none', xl: 'table-row' } } },
            ]} /> : sortedItems.length === 0 ? null : sortedItems.map(invitation => {
            const current = invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) > Date.now();
            return <TableRow key={invitation.id} hover>
              <TableCell sx={{ overflowWrap: 'anywhere' }}>{invitation.recipientEmail}</TableCell>
              <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, overflowWrap: 'anywhere' }}>{invitation.companyName ?? (invitation.organizationType === 'COMPANY' ? invitation.organizationName ?? companyName ?? 'Empresa' : '—')}</TableCell>{organizationType === 'ALL' && <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' }, overflowWrap: 'anywhere' }}>{invitation.organizationName ?? (invitation.organizationType === 'COMPANY' ? companyName || 'Empresa' : 'Tercero')}</TableCell>}
              <TableCell>{invitation.roles.map(getRoleLabel).join(', ')}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', overflow: 'visible' }}><InvitationStatusView invitation={invitation} /></TableCell>
              <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{deliveryStatusLabel[invitation.deliveryStatus]}</TableCell>
              <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{formatDate(invitation.createdAt)}</TableCell>
              <TableCell sx={{ display: { xs: 'none', xl: 'table-cell' } }}>{formatDate(invitation.expiresAt)}</TableCell>
              <TableCell>{current && <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' }}>
                <DataTableAction label="Reenviar invitación" disabled={busy} onClick={() => setPendingAction({ kind: 'resend', invitation })}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7a5 5 0 0 1 4.9 6h2.02A7 7 0 0 0 12 5Zm-7 6v2a7 7 0 0 0 12 4.9V21l5-5-5-5v4a5 5 0 0 1-10-4Z" /></SvgIcon></DataTableAction>
                <DataTableAction label="Cancelar invitación" disabled={busy} onClick={() => setPendingAction({ kind: 'cancel', invitation })}><SvgIcon fontSize="small" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z" /></SvgIcon></DataTableAction>
              </Stack>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </DataTableSurface>}
      {listTarget && !loading && sortedItems.length > 0 && <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>{sortedItems.map(invitation => {
        const current = invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) > Date.now();
        return <Paper variant="outlined" key={invitation.id} sx={{ p: 2, minWidth: 0 }}><Stack spacing={1}>
          <Typography variant="h6" sx={{ overflowWrap: 'anywhere' }}>{invitation.recipientEmail}</Typography>
          <Typography>Empresa: {invitation.companyName ?? (invitation.organizationType === 'COMPANY' ? invitation.organizationName ?? companyName ?? 'Empresa' : '—')}</Typography>
          {organizationType === 'ALL' && <Typography>Organización: {invitation.organizationName ?? (invitation.organizationType === 'COMPANY' ? companyName || 'Empresa' : 'Tercero')}</Typography>}
          <Typography>Rol: {invitation.roles.map(getRoleLabel).join(', ')}</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}><Typography>Estado:</Typography><InvitationStatusView invitation={invitation} /></Stack>
          <Typography>Entrega: {deliveryStatusLabel[invitation.deliveryStatus]}</Typography>
          <Typography>Creada: {formatDate(invitation.createdAt)}</Typography><Typography>Vence: {formatDate(invitation.expiresAt)}</Typography>
          {current && <Stack direction="row" spacing={1}><Button size="small" disabled={busy} onClick={() => setPendingAction({ kind: 'resend', invitation })}>Reenviar</Button><Button size="small" color="warning" disabled={busy} onClick={() => setPendingAction({ kind: 'cancel', invitation })}>Cancelar</Button></Stack>}
        </Stack></Paper>;
      })}</Stack>}
    </DataTable>}

    <ListFilterDialog open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={applyFilters} title="Filtros de invitaciones" maxWidth="sm" leadingAction={<Button onClick={resetDraftFilters}>Limpiar filtros</Button>}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Elige la empresa, organización y estados de invitación que quieres consultar.</Typography>
        {canChooseCompany && <CompanySelectionField value={draftCompanyName} onClick={() => { setCompanyPickerForFilters(true); setCompanyPickerForCreate(false); openCompanyPicker(); }} />}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Correo" value={draftEmailFilter} onChange={event => setDraftEmailFilter(event.target.value)} placeholder="Buscar por correo" />
          <TextField select label="Rol" value={draftRoleFilter} onChange={event => setDraftRoleFilter(event.target.value as InvitationRole | '')}>
            <MenuItem value="">Todos los roles</MenuItem>{(['COMPANY_ADMIN', 'THIRD_PARTY_ADMIN', 'DRIVER'] as const).map(role => <MenuItem key={role} value={role}>{getRoleLabel(role)}</MenuItem>)}
          </TextField>
          <TextField select label="Estado" value={draftStatus} onChange={event => setDraftStatus(event.target.value as InvitationStatus | '')}>
            <MenuItem value="">Todos los estados</MenuItem><MenuItem value="PENDING">Pendientes</MenuItem><MenuItem value="ACCEPTED">Aceptadas</MenuItem><MenuItem value="REJECTED">Rechazadas</MenuItem><MenuItem value="CANCELLED">Canceladas</MenuItem><MenuItem value="EXPIRED">Vencidas</MenuItem>
          </TextField>
          <TextField select label="Entrega" value={draftDeliveryFilter} onChange={event => setDraftDeliveryFilter(event.target.value as InvitationRecord['deliveryStatus'] | '')}>
            <MenuItem value="">Todos los estados de entrega</MenuItem><MenuItem value="UNKNOWN">Pendiente</MenuItem><MenuItem value="LOGGED">Completada</MenuItem><MenuItem value="FAILED">Fallida</MenuItem>
          </TextField>
          <TextField select label="Tipo de organización" value={draftOrganizationType} onChange={event => chooseOrganizationType(event.target.value as 'COMPANY' | 'THIRD_PARTY' | 'ALL')} disabled={!canChangeOrganizationType} sx={{ gridColumn: { sm: '1 / -1' } }}>
            <MenuItem value="ALL" disabled={!draftCompanyId && !canChooseCompany}>Todas</MenuItem><MenuItem value="COMPANY" disabled={!draftCompanyId && !canChooseCompany}>Empresa</MenuItem><MenuItem value="THIRD_PARTY">Tercero</MenuItem>
          </TextField>
          {draftOrganizationType === 'THIRD_PARTY' && <Stack spacing={1} sx={{ gridColumn: { sm: '1 / -1' } }}>
            <Button variant="outlined" onClick={openThirdPartyPicker} disabled={!draftCompanyId}>{draftThirdPartyName || 'Seleccionar tercero'}</Button>
            {!draftCompanyId && <Alert severity="info">Selecciona una empresa para buscar sus terceros.</Alert>}
          </Stack>}
        </Box>
      </Stack>
    </ListFilterDialog>

    <FormDialog open={createOpen} onClose={() => setCreateOpen(false)} busy={busy} maxWidth="sm" title="Crear invitación" actions={<>
      <Button onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</Button><Button variant="contained" onClick={() => void createInvitation()} disabled={!canCreate || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())}>{busy ? 'Enviando…' : 'Enviar invitación'}</Button>
    </>}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <Typography>Ingresa el correo de la persona y selecciona el destino de su asociación.</Typography>
        {(roles.includes('APP_ADMIN') || companyId) && createTargetType === 'COMPANY' && <CompanySelectionField label="Empresa destino" value={createCompanyName || companyName} placeholder="Seleccionar empresa" onClick={() => { setCompanyPickerForCreate(true); setCompanyPickerForFilters(false); openCompanyPicker(); }} />}
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
      </Stack>
    </FormDialog>

    {companies && <CompanyPickerDialog open={companyPickerOpen} api={companies} scope={auth.scope} onChoose={chooseCompany} onClose={() => { setCompanyPickerForFilters(false); setCompanyPickerForCreate(false); setCompanyPickerOpen(false); }} />}

    <ThirdPartyPicker open={thirdPartyPickerOpen} companyId={draftCompanyId} search={searchThirdParties} onChoose={chooseThirdParty} onClose={() => setThirdPartyPickerOpen(false)} />
    <ThirdPartyPicker open={createThirdPartyPickerOpen} companyId={createCompanyId || companyId} search={searchThirdParties} onChoose={chooseCreateThirdParty} onClose={() => setCreateThirdPartyPickerOpen(false)} />

    <Dialog open={pendingAction !== null} onClose={() => !busy && setPendingAction(null)}>
      <DialogTitle>{pendingAction?.kind === 'cancel' ? 'Cancelar invitación' : 'Reenviar invitación'}</DialogTitle>
      <DialogContent><Typography>{pendingAction?.kind === 'cancel' ? `La invitación a ${pendingAction.invitation.recipientEmail} dejará de estar disponible.` : `Se enviará de nuevo la invitación a ${pendingAction?.invitation.recipientEmail}.`}</Typography>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent>
      <DialogActions><Button onClick={() => setPendingAction(null)} disabled={busy}>Volver</Button><Button variant="contained" color={pendingAction?.kind === 'cancel' ? 'warning' : 'primary'} onClick={() => void runAction()} disabled={busy}>{busy ? 'Procesando…' : pendingAction?.kind === 'cancel' ? 'Cancelar invitación' : 'Reenviar'}</Button></DialogActions>
    </Dialog>
  </Stack>;
}
