export type VehicleStatus = 'ACTIVE' | 'INACTIVE';
declare const identifier: unique symbol;
export type Plate = string & { readonly [identifier]: 'Plate' };
export type InternalNumber = string & { readonly [identifier]: 'InternalNumber' };
export type PropertyCardNumber = string & { readonly [identifier]: 'PropertyCardNumber' };
export class VehicleError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'VEHICLE_VERSION_CONFLICT') { super(code); }
}
function normalize(value: string, expression: RegExp): string {
  if (typeof value !== 'string' || [...value].some(character => character.charCodeAt(0) > 127)) throw new VehicleError('INVALID_REQUEST');
  const normalized = value.trim().toUpperCase();
  if (!expression.test(normalized)) throw new VehicleError('INVALID_REQUEST');
  return normalized;
}
/** Colombian private/public plates: three letters followed by two or three digits. */
export const plate = (value: string): Plate => normalize(value, /^[A-Z]{3}\d{2,3}$/) as Plate;
export const internalNumber = (value: string): InternalNumber => normalize(value, /^[A-Z0-9-]{1,40}$/) as InternalNumber;
export const propertyCardNumber = (value: string): PropertyCardNumber => normalize(value, /^[A-Z0-9-]{1,64}$/) as PropertyCardNumber;
export interface VehicleFields { readonly plate: string; readonly internalNumber: string; readonly propertyCardNumber: string }
export interface Vehicle extends VehicleFields {
  readonly id: string; readonly thirdPartyId: string; readonly status: VehicleStatus; readonly version: number;
  readonly createdAt: Date; readonly updatedAt: Date; readonly createdBy: string; readonly updatedBy: string;
}
function closed(value: object, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new VehicleError('INVALID_REQUEST');
}
function metadata(actor: string, now: Date) {
  if (!actor || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw new VehicleError('INVALID_REQUEST');
}
export function normalizeVehicleFields(fields: VehicleFields): VehicleFields {
  closed(fields, ['plate', 'internalNumber', 'propertyCardNumber']);
  return { plate: plate(fields.plate), internalNumber: internalNumber(fields.internalNumber), propertyCardNumber: propertyCardNumber(fields.propertyCardNumber) };
}
export function createVehicle(input: { id: string; thirdPartyId: string; fields: VehicleFields; actor: string; now: Date }): Vehicle {
  closed(input, ['id', 'thirdPartyId', 'fields', 'actor', 'now']);
  metadata(input.actor, input.now);
  if (!/^[a-f0-9]{24}$/.test(input.id) || !/^[a-f0-9]{24}$/.test(input.thirdPartyId)) throw new VehicleError('INVALID_REQUEST');
  return { id: input.id, thirdPartyId: input.thirdPartyId, ...normalizeVehicleFields(input.fields), status: 'ACTIVE', version: 1,
    createdAt: new Date(input.now), updatedAt: new Date(input.now), createdBy: input.actor, updatedBy: input.actor };
}
export function changeVehicle(input: { vehicle: Vehicle; expectedVersion: number; changes: Partial<VehicleFields> | { status: VehicleStatus }; actor: string; now: Date }): { vehicle: Vehicle; changed: boolean } {
  metadata(input.actor, input.now);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new VehicleError('INVALID_REQUEST');
  if (input.vehicle.version !== input.expectedVersion) throw new VehicleError('VEHICLE_VERSION_CONFLICT');
  const keys = Object.keys(input.changes);
  if (!keys.length) throw new VehicleError('INVALID_REQUEST');
  let changes: Partial<VehicleFields> | { status: VehicleStatus };
  if ('status' in input.changes) {
    closed(input.changes, ['status']);
    if (!['ACTIVE', 'INACTIVE'].includes(input.changes.status)) throw new VehicleError('INVALID_REQUEST');
    changes = { status: input.changes.status };
  } else {
    closed(input.changes, ['plate', 'internalNumber', 'propertyCardNumber']);
    changes = normalizeVehicleFields({ plate: input.vehicle.plate, internalNumber: input.vehicle.internalNumber,
      propertyCardNumber: input.vehicle.propertyCardNumber, ...input.changes });
  }
  if (Object.entries(changes).every(([key, value]) => input.vehicle[key as keyof Vehicle] === value)) return { vehicle: input.vehicle, changed: false };
  return { vehicle: { ...input.vehicle, ...changes, version: input.vehicle.version + 1, updatedAt: new Date(input.now), updatedBy: input.actor }, changed: true };
}
export const isVehicleEligible = (vehicle: Vehicle | null): boolean => vehicle?.status === 'ACTIVE';
