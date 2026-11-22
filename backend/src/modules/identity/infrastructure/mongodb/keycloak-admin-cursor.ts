import { Schema, type Connection } from 'mongoose';
import type { KeycloakAdminCursor } from '../keycloak/admin-event-collector';

const cursorSchema = new Schema({ _id: { type: String, required: true }, through: { type: Number, required: true, min: 0 } },
  { strict: 'throw', versionKey: false, collection: 'keycloak_admin_audit_cursors' });
const cursorModel = (connection: Connection) => connection.models.KeycloakAdminAuditCursor
  ?? connection.model('KeycloakAdminAuditCursor', cursorSchema);

export function createMongoKeycloakAdminCursor(connection: Connection, realm: string): KeycloakAdminCursor {
  const model = cursorModel(connection); const id = `realm:${realm}`;
  return {
    async load() {
      await model.init();
      const row = await model.findById(id).lean().exec();
      return row ? Number(row.through) : null;
    },
    async save(value) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('KEYCLOAK_ADMIN_CURSOR_INVALID');
      await model.updateOne({ _id: id }, { $max: { through: value } }, { upsert: true, writeConcern: { w: 'majority', j: true } }).exec();
    },
  };
}
