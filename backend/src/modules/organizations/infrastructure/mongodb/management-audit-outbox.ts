import type { Connection } from 'mongoose';
import type { ManagementAuditOutbox, ManagementCapture, ManagementCaptureSource } from '../../application/management-audit-outbox-worker';

const sources: readonly ManagementCaptureSource[] = ['company_management_events', 'third_party_management_events', 'organization_invitation_events'];
const projection = { eventId: 1, correlationId: 1, at: 1, subject: 1, actorSubject: 1, invitationId: 1, organizationId: 1, action: 1,
  companyId: 1, thirdPartyId: 1, scope: 1, beforeVersion: 1, afterVersion: 1, version: 1 };

export function createMongoManagementAuditOutbox(connect: () => Promise<Connection>): ManagementAuditOutbox {
  return {
    async pending(limit) {
      const connection = await connect();
      const batches = await Promise.all(sources.map(async source => {
        const rows = await connection.collection(source).find({ delivered: false }, { projection }).sort({ at: 1, eventId: 1 }).limit(limit).toArray();
        return Promise.all(rows.map(async row => {
          if (source !== 'organization_invitation_events') return { source, capture: row as unknown as ManagementCapture };
          const organizationId = String(row.organizationId ?? '');
          const organization = await connection.collection('organizations').findOne({ id: organizationId }, { projection: { type: 1 } });
          const company = organization?.type === 'COMPANY'; const thirdParty = organization?.type === 'THIRD_PARTY';
          const scope = company ? { kind: 'organization', companyId: organizationId, thirdPartyId: null }
            : thirdParty ? { kind: 'organization', companyId: null, thirdPartyId: organizationId } : undefined;
          return { source, capture: { ...row, correlationId: String(row.eventId), scope } as unknown as ManagementCapture };
        }));
      }));
      return batches.flat().sort((a, b) => String(a.capture.at).localeCompare(String(b.capture.at)) || a.capture.eventId.localeCompare(b.capture.eventId)).slice(0, limit);
    },
    async acknowledge(source, eventId) {
      if (!sources.includes(source)) throw new Error('ORGANIZATION_AUDIT_SOURCE_INVALID');
      const connection = await connect();
      const result = await connection.collection(source).updateOne({ eventId, delivered: false }, { $set: { delivered: true, deliveredAt: new Date() } },
        { writeConcern: { w: 'majority', j: true } });
      if (result.matchedCount !== 1) {
        const alreadyDelivered = await connection.collection(source).countDocuments({ eventId, delivered: true }, { limit: 1 });
        if (alreadyDelivered !== 1) throw new Error('ORGANIZATION_AUDIT_ACK_FAILED');
      }
    },
  };
}
