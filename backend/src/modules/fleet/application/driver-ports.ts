import type { OrganizationScope } from '@/modules/identity/domain/authorization-facts';
import type { Driver, DriverStatus } from '../domain/driver';

export interface DriverIdentity {
  readonly name: string;
  readonly documentType: string | null;
  readonly documentNumber: string | null;
  readonly email: string | null;
}
export interface DriverRecord {
  readonly id: string;
  readonly thirdPartyId: string;
  readonly status: DriverStatus;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
export interface DriverView {
  readonly driver: DriverRecord;
  readonly identity: DriverIdentity | null;
}

export interface DriverListQuery {
  readonly thirdPartyId: string;
  readonly subject?: string;
  readonly subjects?: readonly string[];
  readonly page: number;
  readonly pageSize: number;
  readonly sort: 'createdAt' | 'status';
  readonly direction: 'asc' | 'desc';
  readonly status?: DriverStatus;
  readonly q?: string;
}

export interface DriverPage {
  readonly items: readonly Driver[];
  readonly total: number;
}

export interface DriverRepositoryPort {
  list(input: DriverListQuery): Promise<DriverPage>;
  find(input: { readonly id: string; readonly thirdPartyId: string; readonly subject?: string }): Promise<Driver | null>;
  transition(input: {
    readonly id: string;
    readonly thirdPartyId: string;
    readonly actorSubject: string;
    readonly expectedVersion: number;
    readonly status: DriverStatus;
    readonly actor: string;
    readonly policyVersion: string;
    readonly contextRevision: string | null;
    readonly scope: OrganizationScope;
    readonly assignmentRevision?: string;
  }): Promise<Driver>;
}

export interface DriverFactsReader {
  eligibility(input: { readonly subject: string; readonly thirdPartyId: string }): Promise<{
    readonly driverId: string | null;
    readonly eligible: boolean;
    readonly driverStatus: DriverStatus | null;
    readonly membershipRevision: number | null;
    readonly thirdPartyRevision: number | null;
  }>;
}

