import { Types, type ClientSession, type Connection } from 'mongoose';
import type { InvoiceTransactionAuthorityPort } from '@/modules/invoices/application/invoice-ports';
import { AuthorizationError } from '@/modules/identity/application/authentication-error';

/** Organizations-owned authority check used inside an Invoices transaction. */
export function invoiceAuthorityConfirmation(connection: Connection, session: ClientSession): InvoiceTransactionAuthorityPort {
  return {
    async confirm(input) {
      if (!/^[a-f0-9]{24}$/.test(input.thirdPartyId) || !input.actorSubject || !input.policyVersion
        || !input.contextRevision || !input.roles.includes(input.requiredRole)) throw new AuthorizationError();
      const organizations = connection.collection('organizations');
      const thirdParties = connection.collection('third_parties');
      const memberships = connection.collection('organization_memberships');
      const associations = connection.collection('organization_associations');
      const drivers = connection.collection('drivers');
      const organization = await organizations.findOne({ id: input.thirdPartyId, type: 'THIRD_PARTY', active: true }, { session });
      const thirdParty = await thirdParties.findOne({ _id: new Types.ObjectId(input.thirdPartyId), status: 'ACTIVE' }, { session });
      const association = await associations.findOne({ subject: input.actorSubject, organizationId: input.thirdPartyId,
        capability: input.requiredRole, assigned: { $ne: false }, active: true }, { session });
      const membershipId = association && typeof association.membershipId === 'string' ? association.membershipId : '';
      const membership = membershipId ? await memberships.findOne({ id: membershipId, subject: input.actorSubject,
        organizationId: input.thirdPartyId, status: 'ACTIVE' }, { session }) : null;
      if (!organization || !thirdParty || !association || !membership) throw new AuthorizationError();
      const driver = input.requiredRole === 'DRIVER' ? await drivers.findOne({ membershipId, subject: input.actorSubject,
        thirdPartyId: input.thirdPartyId, status: 'ACTIVE' }, { session }) : null;
      if (input.requiredRole === 'DRIVER' && !driver) throw new AuthorizationError();
      const fences = await Promise.all([
        organizations.updateOne({ _id: organization._id, revision: organization.revision, active: true }, { $inc: { mutationFence: 1 } }, { session }),
        thirdParties.updateOne({ _id: thirdParty._id, revision: thirdParty.revision, status: 'ACTIVE' }, { $inc: { mutationFence: 1 } }, { session }),
        memberships.updateOne({ _id: membership._id, revision: membership.revision, status: 'ACTIVE' }, { $inc: { mutationFence: 1 } }, { session }),
        associations.updateOne({ _id: association._id, revision: association.revision, active: true, assigned: { $ne: false } }, { $inc: { mutationFence: 1 } }, { session }),
        ...(driver ? [drivers.updateOne({ _id: driver._id, membershipId, subject: input.actorSubject, status: 'ACTIVE', version: driver.version }, { $inc: { mutationFence: 1 } }, { session })] : []),
      ]);
      if (fences.some(result => result.modifiedCount !== 1)) throw new AuthorizationError();
    },
  };
}
