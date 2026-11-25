import { Types, type Connection } from 'mongoose';
import type { InvoiceSubmissionCause } from '../../domain/submission';
import type { InvoiceAssignmentFacts } from '@/modules/fleet/application/assignment-ports';
import type { InvoiceDuplicateCandidate } from '../../application/submission-ports';

const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
export function createMongoInvoiceSyncFactsReader(connect: () => Promise<Connection>) {
  return {
    async assignment(input: { readonly subject: string; readonly thirdPartyId: string; readonly assignmentId: string; readonly vehicleId: string }): Promise<{ status: 'ACTIVE' | 'CLOSED' | 'MISSING'; facts?: InvoiceAssignmentFacts }> {
      if (![input.thirdPartyId, input.assignmentId, input.vehicleId].every(id) || !input.subject) return { status: 'MISSING' };
      try {
        const connection = await connect();
        const row = await connection.collection('vehicle_assignments').findOne({ _id: new Types.ObjectId(input.assignmentId), thirdPartyId: input.thirdPartyId,
          vehicleId: input.vehicleId, subject: input.subject, status: { $in: ['ACTIVE', 'CLOSED'] } });
        if (!row || !id(row.driverId)) return { status: 'MISSING' };
        const [vehicle, driver] = await Promise.all([
          connection.collection('vehicles').findOne({ _id: new Types.ObjectId(input.vehicleId), thirdPartyId: input.thirdPartyId }),
          connection.collection('drivers').findOne({ _id: new Types.ObjectId(row.driverId), thirdPartyId: input.thirdPartyId, subject: input.subject }),
        ]);
        if (!vehicle || !driver || !Number.isSafeInteger(row.version) || !Number.isSafeInteger(vehicle.version) || !Number.isSafeInteger(driver.version)) return { status: 'MISSING' };
        if (!(row.startedAt instanceof Date) || !Number.isFinite(row.startedAt.getTime())
          || row.status === 'CLOSED' && (!(row.endedAt instanceof Date) || !Number.isFinite(row.endedAt.getTime()))) return { status: 'MISSING' };
        const facts: InvoiceAssignmentFacts = { assignmentId: input.assignmentId, thirdPartyId: input.thirdPartyId, vehicleId: input.vehicleId,
          driverId: row.driverId, subject: input.subject, assignmentVersion: Number(row.version), vehicleVersion: Number(vehicle.version),
          driverVersion: Number(driver.version), vehiclePlate: typeof vehicle.plate === 'string' ? vehicle.plate : null,
          assignmentStartedAt: new Date(row.startedAt), assignmentEndedAt: row.endedAt instanceof Date ? new Date(row.endedAt) : null };
        return { status: row.status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED', facts };
      } catch { throw new Error('INVOICE_SYNC_FACTS_UNAVAILABLE'); }
    },
    async historyAssignments(input: { readonly thirdPartyId: string; readonly assignments: readonly { readonly subject: string; readonly assignmentId: string; readonly vehicleId: string }[] }) {
      if (!id(input.thirdPartyId) || input.assignments.length > 100 || input.assignments.some(value => !id(value.assignmentId) || !id(value.vehicleId)
        || typeof value.subject !== 'string' || !value.subject || value.subject.length > 128)) throw new Error('INVALID_REQUEST');
      if (input.assignments.length === 0) return [];
      try {
        const connection = await connect();
        const assignmentRows = await connection.collection('vehicle_assignments').find({ thirdPartyId: input.thirdPartyId,
          $or: input.assignments.map(value => ({ _id: new Types.ObjectId(value.assignmentId), vehicleId: value.vehicleId, subject: value.subject })) },
        { projection: { _id: 1, vehicleId: 1, driverName: 1 } }).toArray();
        const vehicleIds = [...new Set(assignmentRows.flatMap(row => id(row.vehicleId) ? [row.vehicleId] : []))];
        const vehicleRows = vehicleIds.length ? await connection.collection('vehicles').find({ thirdPartyId: input.thirdPartyId,
          _id: { $in: vehicleIds.map(value => new Types.ObjectId(value)) } }, { projection: { _id: 1, plate: 1 } }).toArray() : [];
        const plates = new Map(vehicleRows.flatMap(row => row._id instanceof Types.ObjectId && typeof row.plate === 'string'
          ? [[row._id.toString(), row.plate] as const] : []));
        return assignmentRows.flatMap(row => row._id instanceof Types.ObjectId && id(row.vehicleId)
          ? [{ assignmentId: row._id.toString(), driverName: typeof row.driverName === 'string' ? row.driverName : null,
            vehiclePlate: plates.get(row.vehicleId) ?? null }] : []);
      } catch { throw new Error('INVOICE_SYNC_FACTS_UNAVAILABLE'); }
    },
    async duplicates(input: { readonly thirdPartyId: string; readonly issuerNit: string; readonly invoiceNumber: string; readonly cufe?: string }): Promise<{ readonly causes: readonly InvoiceSubmissionCause[]; readonly candidates: readonly InvoiceDuplicateCandidate[] }> {
      try {
        const invoices = (await connect()).collection('invoices');
        const invoiceNumber = input.invoiceNumber.normalize('NFC').trim().toLocaleUpperCase('es-CO');
        const [business, cufe] = await Promise.all([
          invoices.findOne({ thirdPartyId: input.thirdPartyId, issuerNit: input.issuerNit, invoiceNumber },
            { projection: { _id: 1, invoiceNumber: 1, issuerNit: 1, invoiceDate: 1 } }),
          input.cufe ? invoices.findOne({ thirdPartyId: input.thirdPartyId, 'qrMetadata.cufe': input.cufe },
            { projection: { _id: 1, invoiceNumber: 1, issuerNit: 1, invoiceDate: 1 } }) : Promise.resolve(null),
        ]);
        const causes: InvoiceSubmissionCause[] = [];
        const candidates: InvoiceDuplicateCandidate[] = [];
        if (business && business._id instanceof Types.ObjectId) {
          causes.push('BUSINESS_DUPLICATE');
          candidates.push({ id: business._id.toString(), invoiceNumber: String(business.invoiceNumber), issuerNit: String(business.issuerNit), invoiceDate: String(business.invoiceDate), cause: 'BUSINESS_DUPLICATE' });
        }
        if (cufe && cufe._id instanceof Types.ObjectId) {
          causes.push('CUFE_DUPLICATE');
          if (!candidates.some(value => value.id === cufe._id.toString())) candidates.push({ id: cufe._id.toString(), invoiceNumber: String(cufe.invoiceNumber),
            issuerNit: String(cufe.issuerNit), invoiceDate: String(cufe.invoiceDate), cause: 'CUFE_DUPLICATE' });
        }
        return { causes, candidates };
      } catch { throw new Error('INVOICE_SYNC_FACTS_UNAVAILABLE'); }
    },
    async candidates(input: { readonly thirdPartyId: string; readonly ids: readonly string[] }): Promise<readonly InvoiceDuplicateCandidate[]> {
      if (!id(input.thirdPartyId) || input.ids.length > 100 || input.ids.some(value => !id(value))) throw new Error('INVALID_REQUEST');
      try {
        const rows = await (await connect()).collection('invoices').find({ thirdPartyId: input.thirdPartyId,
          _id: { $in: input.ids.map(value => new Types.ObjectId(value)) } }, { projection: { _id: 1, invoiceNumber: 1, issuerNit: 1, invoiceDate: 1 } }).toArray();
        return rows.flatMap(row => row._id instanceof Types.ObjectId && typeof row.invoiceNumber === 'string' && typeof row.issuerNit === 'string'
          && typeof row.invoiceDate === 'string' ? [{ id: row._id.toString(), invoiceNumber: row.invoiceNumber, issuerNit: row.issuerNit,
            invoiceDate: row.invoiceDate, cause: 'BUSINESS_DUPLICATE' as const }] : []);
      } catch { throw new Error('INVOICE_SYNC_FACTS_UNAVAILABLE'); }
    },
  };
}
