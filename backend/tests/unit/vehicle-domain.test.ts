import { describe, expect, it } from 'vitest';
import { changeVehicle, createVehicle, internalNumber, isVehicleEligible, plate, propertyCardNumber } from '@/modules/fleet/domain/vehicle';
const now = new Date('2026-11-19T12:00:00Z');
const fields = { plate: ' abc123 ', internalNumber: ' 0001-a ', propertyCardNumber: ' 000123 ' };
const create = () => createVehicle({ id: 'a'.repeat(24), thirdPartyId: 'b'.repeat(24), fields, actor: 'admin', now });
describe('vehicle domain', () => {
  it('normalizes ASCII and preserves leading zeros', () => {
    expect(create()).toMatchObject({ plate: 'ABC123', internalNumber: '0001-A', propertyCardNumber: '000123', status: 'ACTIVE', version: 1 });
  });
  it('enforces identifier limits, syntax and required strings', () => {
    for (const value of ['', 'AB', 'A'.repeat(11), 'ABC-12', 'ABC 12', 'ABC1', 'ABCD12', 'ábc123', 'abſ123']) expect(() => plate(value)).toThrow('INVALID_REQUEST');
    expect(plate('abc123')).toBe('ABC123');
    expect(plate('ABC12')).toHaveLength(5);
    expect(internalNumber('A'.repeat(40))).toHaveLength(40);
    expect(propertyCardNumber('0'.repeat(64))).toHaveLength(64);
    for (const value of ['', 'A'.repeat(41), 'A/B']) expect(() => internalNumber(value)).toThrow('INVALID_REQUEST');
    for (const value of ['', 'A'.repeat(65), '1.2']) expect(() => propertyCardNumber(value)).toThrow('INVALID_REQUEST');
  });
  it('versions effective edits and rejects stale and injected ownership changes', () => {
    const vehicle = create();
    const mutate = (changes: Parameters<typeof changeVehicle>[0]['changes'], expectedVersion = 1) => changeVehicle({ vehicle, changes, expectedVersion, actor: 'editor', now });
    expect(mutate(fields)).toEqual({ vehicle, changed: false });
    expect(mutate({ internalNumber: '0002' })).toMatchObject({ changed: true, vehicle: { version: 2, internalNumber: '0002', thirdPartyId: vehicle.thirdPartyId } });
    expect(() => mutate(fields, 2)).toThrow('VEHICLE_VERSION_CONFLICT');
    expect(() => mutate({})).toThrow('INVALID_REQUEST');
    expect(() => mutate({ thirdPartyId: 'c'.repeat(24) } as never)).toThrow('INVALID_REQUEST');
    expect(() => mutate({ plate: undefined } as never)).toThrow('INVALID_REQUEST');
    expect(() => createVehicle({ ...({ id: 'a'.repeat(24), thirdPartyId: 'b'.repeat(24), fields, actor: 'admin', now }), status: 'INACTIVE' } as never)).toThrow('INVALID_REQUEST');
  });
  it('makes inactive vehicles ineligible and versions state changes', () => {
    const vehicle = create();
    const inactive = changeVehicle({ vehicle, changes: { status: 'INACTIVE' }, expectedVersion: 1, actor: 'admin', now });
    expect(isVehicleEligible(vehicle)).toBe(true);
    expect(isVehicleEligible(inactive.vehicle)).toBe(false);
    expect(isVehicleEligible(null)).toBe(false);
    expect(changeVehicle({ vehicle: inactive.vehicle, changes: { status: 'ACTIVE' }, expectedVersion: 2, actor: 'admin', now }).vehicle.version).toBe(3);
  });
});
