/** Compatibility barrel: shared infrastructure owns the Mongo implementation so feature adapters do not depend on another module's infrastructure. */
export { auditModel, createMongoAuditWriter, prepareMongoAudit } from '@/shared/infrastructure/mongodb/audit-writer';
