import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { createStore } from 'zustand/vanilla';
import { createAuthorizationStore } from '@/modules/authentication/presentation/authorization-store';
import type { PermissionScope } from '@/modules/authentication/domain/permissions';
import type { SessionPort } from '@/modules/authentication/application/session-ports';
import type { ContextStore } from '@/modules/organization-context/presentation/context-store';
import type { InvitationApi, MembershipRecord } from '@/modules/user-invitations/application/invitation-api';
import { MembershipPage } from '@/modules/user-invitations/presentation/membership-page';

const scope: PermissionScope = { kind: 'organization', companyId: '0123456789abcdef01234567', thirdPartyId: null };
const session: SessionPort = { snapshot: () => ({ status: 'authenticated', credentialRevision: 1 }), subscribe: () => () => {}, initialize: async () => {}, login: async () => {}, logout: async () => {}, invalidate: () => {} };
const authorization = createAuthorizationStore(async target => ({ subject: 'browser-test', scope: target, roles: ['APP_ADMIN'], permissions: ['users:read', 'users:associate'], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 }), session, { automatic: false });
void authorization.getState().setContext(scope);
const member: MembershipRecord = { id: 'membership-1', status: 'ACTIVE', roles: ['COMPANY_ADMIN'], revision: 1, profile: { fullName: 'Ana Ejemplo', documentType: 'CC', documentNumber: '12345', email: 'ana@example.invalid' } };
let currentMember = member;
const api: InvitationApi = {
  list: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }), create: async () => { throw new Error('not used'); }, cancel: async () => { throw new Error('not used'); }, resend: async () => { throw new Error('not used'); },
  preview: async () => { throw new Error('not used'); }, accept: async () => { throw new Error('not used'); }, reject: async () => { throw new Error('not used'); },
  received: async () => ({ items: [], page: 1, pageSize: 20, total: 0 }), acceptReceived: async () => { throw new Error('not used'); }, rejectReceived: async () => { throw new Error('not used'); },
  memberships: async () => ({ items: [currentMember], page: 1, pageSize: 20, total: 1 }), profile: async () => currentMember, changeRoles: async () => currentMember,
  changeStatus: async (_scope, _target, _id, _revision, status) => { currentMember = { ...currentMember, status, revision: currentMember.revision + 1 }; return currentMember; },
};
const activeContext = { kind: 'ORGANIZATION', organizationId: scope.companyId!, organizationType: 'COMPANY', organizationName: 'Empresa de prueba', roles: ['APP_ADMIN'], authorization: { subject: 'browser-test', scope, roles: ['APP_ADMIN'], permissions: ['users:read'], policyVersion: '1', contextRevision: '1', evaluatedAt: new Date().toISOString(), refreshAfterSeconds: 30 } };
const context = createStore(() => ({ status: 'ready', activeContext, generation: 1 })) as unknown as ContextStore;
(context as unknown as { capture: () => unknown }).capture = () => ({ scope, signal: new AbortController().signal, isCurrent: () => true, release: () => {} });

createRoot(document.getElementById('root')!).render(<MemoryRouter><MembershipPage api={api} context={context} authorization={authorization} /></MemoryRouter>);
