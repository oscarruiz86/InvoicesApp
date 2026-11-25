import type { AuthenticatedActor } from '@/modules/identity/domain/actor';
import type { Authorization } from '@/modules/identity/application/authorization';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import { AuthorizationUnavailable } from '@/modules/identity/application/authorization-errors';
import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import type { IdentityProfile, IdentityProfileReader } from '@/modules/identity/application/identity-profile-reader';
import type { Driver, DriverStatus } from '../domain/driver';
import type { DriverFactsReader, DriverIdentity, DriverRepositoryPort, DriverView } from './driver-ports';
import { AssignmentConfirmationError, type AssignmentConfirmationPort } from './assignment-ports';

export class DriverUseCaseError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'UNAVAILABLE') { super(code); }
}

const selfScope: OrganizationScope = { kind: 'self', companyId: null, thirdPartyId: null };
const organizationScope = (thirdPartyId: string): OrganizationScope => ({ kind: 'organization', companyId: null, thirdPartyId });

function mapRepositoryError(error: unknown): DriverUseCaseError {
  if (error instanceof DriverUseCaseError) return error;
  if (error instanceof AssignmentConfirmationError)
    return new DriverUseCaseError(error.code === 'ACTIVE_ASSIGNMENT_EXISTS' ? 'CONFLICT' : 'UNAVAILABLE');
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (error instanceof AuthorizationUnavailable || code === 'STORAGE_UNAVAILABLE') return new DriverUseCaseError('UNAVAILABLE');
  if (error instanceof AuthorizationError || code === 'FORBIDDEN') return new DriverUseCaseError('FORBIDDEN');
  if (code === 'NOT_FOUND') return new DriverUseCaseError('NOT_FOUND');
  if (code === 'INVALID_REQUEST') return new DriverUseCaseError('INVALID_REQUEST');
  if (code === 'VERSION_CONFLICT' || code === 'MEMBERSHIP_NOT_ELIGIBLE') return new DriverUseCaseError('CONFLICT');
  if (code === 'ACTIVE_ASSIGNMENT_CONFLICT' || code === 'OPEN_ASSIGNMENT') return new DriverUseCaseError('CONFLICT');
  if (code === 'ASSIGNMENT_PROVIDER_UNAVAILABLE' || code === 'ASSIGNMENT_EVIDENCE_UNAVAILABLE') return new DriverUseCaseError('UNAVAILABLE');
  return new DriverUseCaseError('UNAVAILABLE');
}

function validateQuery(input: { thirdPartyId: string; page: number; pageSize: number; sort: 'createdAt' | 'status'; direction: 'asc' | 'desc'; status?: DriverStatus; q?: string }) {
  if (!/^[a-f0-9]{24}$/.test(input.thirdPartyId) || !Number.isSafeInteger(input.page) || input.page < 1
    || !Number.isSafeInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 100
    || !['createdAt', 'status'].includes(input.sort) || !['asc', 'desc'].includes(input.direction)
    || (input.status !== undefined && input.status !== 'ACTIVE' && input.status !== 'INACTIVE')
    || (input.q !== undefined && (input.q.trim() !== input.q || input.q.length < 2 || input.q.length > 100))) {
    throw new DriverUseCaseError('INVALID_REQUEST');
  }
}

export function createDrivers(deps: {
  repository: DriverRepositoryPort;
  facts: DriverFactsReader;
  assignments: Pick<AssignmentConfirmationPort, 'readForDriver'>;
  authorization: Authorization;
  identity: IdentityProfileReader;
}) {
  async function authorizeRead(actor: AuthenticatedActor, thirdPartyId: string): Promise<string | undefined> {
    if (!/^[a-f0-9]{24}$/.test(thirdPartyId)) throw new DriverUseCaseError('INVALID_REQUEST');
    try {
      if (actor.roles.includes('THIRD_PARTY_ADMIN')) {
        await deps.authorization.requirePermission(actor, 'drivers:read', organizationScope(thirdPartyId));
        return undefined;
      }
      if (actor.roles.includes('DRIVER')) {
        await deps.authorization.requirePermission(actor, 'drivers:read', selfScope);
        const evidence = await deps.facts.eligibility({ subject: actor.subject, thirdPartyId });
        if (!evidence.eligible) throw new DriverUseCaseError('NOT_FOUND');
        return actor.subject;
      }
      // Organization membership is the source of local roles. Let the scoped
      // permission check resolve THIRD_PARTY_ADMIN even when its token claim is absent.
      await deps.authorization.requirePermission(actor, 'drivers:read', organizationScope(thirdPartyId));
      return undefined;
    } catch (error) {
      if (error instanceof DriverUseCaseError) throw error;
      throw mapRepositoryError(error);
    }
  }

  async function identity(subject: string): Promise<DriverIdentity | null> {
    try {
      const profile = await deps.identity.read(subject);
      if (!profile?.enabled || !profile.fullName) return null;
      return { name: profile.fullName, documentType: profile.documentType, documentNumber: profile.documentNumber, email: profile.email };
    } catch { return null; }
  }

  async function view(driver: Driver, knownProfile?: IdentityProfile): Promise<DriverView> {
    const profile = knownProfile && knownProfile.enabled && knownProfile.fullName
      ? { name: knownProfile.fullName, documentType: knownProfile.documentType, documentNumber: knownProfile.documentNumber, email: knownProfile.email }
      : await identity(driver.subject);
    return { driver: { id: driver.id, thirdPartyId: driver.thirdPartyId, status: driver.status, version: driver.version, createdAt: driver.createdAt, updatedAt: driver.updatedAt }, identity: profile };
  }

  return {
    async list(actor: AuthenticatedActor, input: { thirdPartyId: string; page: number; pageSize: number; sort: 'createdAt' | 'status'; direction: 'asc' | 'desc'; status?: DriverStatus; q?: string }) {
      validateQuery(input);
      const subject = await authorizeRead(actor, input.thirdPartyId);
      try {
        let matchingProfiles: readonly IdentityProfile[] | undefined;
        if (input.q) {
          if (!deps.identity.search) throw new DriverUseCaseError('UNAVAILABLE');
          try { matchingProfiles = (await deps.identity.search({ text: input.q })).filter(profile => profile.enabled && profile.fullName); }
          catch { throw new DriverUseCaseError('UNAVAILABLE'); }
          if (!matchingProfiles.length) return { items: [], page: input.page, pageSize: input.pageSize, total: 0 };
        }
        const result = await deps.repository.list({ ...input, ...(subject ? { subject } : {}),
          ...(matchingProfiles ? { subjects: matchingProfiles.map(profile => profile.subject) } : {}) });
        const profileBySubject = new Map(matchingProfiles?.map(profile => [profile.subject, profile]));
        return { items: await Promise.all(result.items.map(driver => view(driver, profileBySubject.get(driver.subject)))), page: input.page, pageSize: input.pageSize, total: result.total };
      } catch (error) { throw mapRepositoryError(error); }
    },

    async detail(actor: AuthenticatedActor, input: { id: string; thirdPartyId: string }): Promise<DriverView> {
      if (!/^[a-f0-9]{24}$/.test(input.id)) throw new DriverUseCaseError('INVALID_REQUEST');
      const subject = await authorizeRead(actor, input.thirdPartyId);
      try {
        const driver = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId, ...(subject ? { subject } : {}) });
        if (!driver) throw new DriverUseCaseError('NOT_FOUND');
        return view(driver);
      } catch (error) {
        if (error instanceof DriverUseCaseError) throw error;
        throw mapRepositoryError(error);
      }
    },

    async transition(actor: AuthenticatedActor, input: { id: string; thirdPartyId: string; expectedVersion: number; status: DriverStatus }) {
      if (!/^[a-f0-9]{24}$/.test(input.id) || !/^[a-f0-9]{24}$/.test(input.thirdPartyId)
        || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1
        || (input.status !== 'ACTIVE' && input.status !== 'INACTIVE')) throw new DriverUseCaseError('INVALID_REQUEST');
      const scope = organizationScope(input.thirdPartyId);
      let receipt;
      try { receipt = await deps.authorization.requirePermission(actor, 'drivers:deactivate', scope); }
      catch (error) { throw mapRepositoryError(error); }
      try {
        const current = await deps.repository.find({ id: input.id, thirdPartyId: input.thirdPartyId });
        if (!current) throw new DriverUseCaseError('NOT_FOUND');
        let assignmentRevision: string | undefined;
        if (input.status === 'INACTIVE' && current.status !== 'INACTIVE') {
          const evidence = await deps.assignments.readForDriver({ driverId: current.id, thirdPartyId: current.thirdPartyId });
          if (evidence.state === 'UNAVAILABLE') throw new DriverUseCaseError('UNAVAILABLE');
          if (evidence.hasActive) throw new DriverUseCaseError('CONFLICT');
          assignmentRevision = evidence.revision;
        }
        const updated = await deps.repository.transition({ id: input.id, thirdPartyId: input.thirdPartyId, actorSubject: actor.subject,
          expectedVersion: input.expectedVersion, status: input.status, actor: actor.subject,
          policyVersion: receipt.policyVersion, contextRevision: receipt.contextRevision, scope, assignmentRevision });
        return view(updated);
      } catch (error) { throw mapRepositoryError(error); }
    },
  };
}
