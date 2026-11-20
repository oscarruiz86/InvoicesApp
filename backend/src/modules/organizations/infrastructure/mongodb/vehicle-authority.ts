import { Types, type Connection, type ClientSession } from 'mongoose';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';
import type { VehicleAuthorityConfirmation } from '@/modules/fleet/application/vehicle-ports';
/** Organizations owns its collections; composition injects this transaction participant into Fleet. */
export function vehicleAuthorityConfirmation(connection: Connection, session: ClientSession): VehicleAuthorityConfirmation {
  return {
    async confirm(input) {
      const organizations = connection.collection('organizations');
      const thirdParties = connection.collection('third_parties');
      const memberships = connection.collection('organization_memberships');
      const associations = connection.collection('organization_associations');
      const organization = await organizations.findOne({ id: input.thirdPartyId, type: 'THIRD_PARTY', active: true }, { session });
      const thirdParty = await thirdParties.findOne({ _id: new Types.ObjectId(input.thirdPartyId), status: 'ACTIVE' }, { session });
      const association = await associations.findOne({ subject: input.subject, organizationId: input.thirdPartyId,
        capability: 'THIRD_PARTY_ADMIN', assigned: { $ne: false }, active: true }, { session });
      const membership = association && typeof association.membershipId === 'string'
        ? await memberships.findOne({ id: association.membershipId, subject: input.subject, organizationId: input.thirdPartyId, status: 'ACTIVE' }, { session }) : null;
      if (!organization || !thirdParty || !association || !membership) throw new AuthorizationError();
      for (const [collection, filter] of [
        [organizations, { _id: organization._id, revision: organization.revision, active: true }],
        [thirdParties, { _id: thirdParty._id, revision: thirdParty.revision, status: 'ACTIVE' }],
        [memberships, { _id: membership._id, revision: membership.revision, status: 'ACTIVE' }],
        [associations, { _id: association._id, revision: association.revision, active: true }],
      ] as const) {
        const result = await collection.updateOne(filter, { $inc: { mutationFence: 1 } }, { session });
        if (result.modifiedCount !== 1) throw new AuthorizationError();
      }
    },
  };
}
