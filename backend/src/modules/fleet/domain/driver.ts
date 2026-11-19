export type DriverStatus = 'ACTIVE' | 'INACTIVE';

export interface Driver {
  readonly id: string;
  readonly subject: string;
  readonly membershipId: string;
  readonly thirdPartyId: string;
  readonly status: DriverStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly createdBy: string;
  readonly updatedBy: string | null;
}

export interface DriverMembershipFacts {
  readonly id: string;
  readonly subject: string;
  readonly organizationId: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly roles: readonly string[];
}

export class DriverError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'MEMBERSHIP_NOT_ELIGIBLE' | 'VERSION_CONFLICT') {
    super(code);
  }
}

export function createDriver(input: {
  readonly id: string;
  readonly subject: string;
  readonly membership: DriverMembershipFacts;
  readonly thirdPartyId: string;
  readonly thirdPartyActive: boolean;
  readonly actor: string;
  readonly now: Date;
}, existingMembershipIds: readonly string[] = []): Driver {
  const allowed = new Set(['id', 'subject', 'membership', 'thirdPartyId', 'thirdPartyActive', 'actor', 'now']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new DriverError('INVALID_REQUEST');
  if (!input.id || !input.subject || !input.actor || !input.thirdPartyId || !(input.now instanceof Date)
    || !Number.isFinite(input.now.getTime())) throw new DriverError('INVALID_REQUEST');
  if (input.membership.subject !== input.subject || input.membership.organizationId !== input.thirdPartyId
    || input.membership.status !== 'ACTIVE' || !input.membership.roles.includes('DRIVER') || !input.thirdPartyActive) {
    throw new DriverError('MEMBERSHIP_NOT_ELIGIBLE');
  }
  if (existingMembershipIds.includes(input.membership.id)) throw new DriverError('INVALID_REQUEST');
  return {
    id: input.id,
    subject: input.subject,
    membershipId: input.membership.id,
    thirdPartyId: input.thirdPartyId,
    status: 'ACTIVE',
    version: 1,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now),
    createdBy: input.actor,
    updatedBy: null,
  };
}

export function isDriverEligible(input: {
  readonly driver: Driver | null;
  readonly membership: DriverMembershipFacts | null;
  readonly thirdPartyActive: boolean;
}): boolean {
  const { driver, membership, thirdPartyActive } = input;
  return Boolean(driver && membership && driver.status === 'ACTIVE' && membership.status === 'ACTIVE'
    && membership.roles.includes('DRIVER') && membership.id === driver.membershipId
    && membership.subject === driver.subject && membership.organizationId === driver.thirdPartyId
    && thirdPartyActive);
}

export function transitionDriver(input: {
  readonly driver: Driver;
  readonly expectedVersion: number;
  readonly status: DriverStatus;
  readonly actor: string;
  readonly now: Date;
  readonly eligible: boolean;
}): { readonly driver: Driver; readonly changed: boolean } {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || !input.actor
    || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())
    || (input.status !== 'ACTIVE' && input.status !== 'INACTIVE')) throw new DriverError('INVALID_REQUEST');
  if (input.driver.version !== input.expectedVersion) throw new DriverError('VERSION_CONFLICT');
  if (input.driver.status === input.status) return { driver: input.driver, changed: false };
  if (input.status === 'ACTIVE' && !input.eligible) throw new DriverError('MEMBERSHIP_NOT_ELIGIBLE');
  return {
    changed: true,
    driver: {
      ...input.driver,
      status: input.status,
      version: input.driver.version + 1,
      updatedAt: new Date(input.now),
      updatedBy: input.actor,
    },
  };
}
