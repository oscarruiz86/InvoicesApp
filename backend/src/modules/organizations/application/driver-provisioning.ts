import type { Membership } from '../domain/invitations';
import type { LocalRole } from '../domain/organization';

/** Opaque transaction token keeps Organizations independent of MongoDB and Fleet infrastructure. */
export interface DriverProvisioningPort {
  provision(input: {
    readonly membership: Membership;
    readonly roles: readonly LocalRole[];
    readonly actorSubject: string;
    readonly now: Date;
    readonly source: 'INVITATION' | 'MEMBERSHIP';
  }, transaction: unknown): Promise<void>;
  synchronizeRoles(input: {
    readonly membership: Membership;
    readonly beforeRoles: readonly LocalRole[];
    readonly afterRoles: readonly LocalRole[];
    readonly actorSubject: string;
    readonly now: Date;
  }, transaction: unknown): Promise<void>;
}
