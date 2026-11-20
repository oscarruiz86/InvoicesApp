import { describe, expect, it } from 'vitest';
import { validVehicleFields, vehicleFieldErrors } from '@/modules/fleet/domain/vehicle';

const valid = { plate: 'ABC123', internalNumber: '0001-A', propertyCardNumber: '000123' };

describe('vehicle form validation', () => {
  it('accepts Colombian private and motorcycle plate formats', () => {
    expect(validVehicleFields(valid)).toBe(true);
    expect(validVehicleFields({ ...valid, plate: 'ABC12' })).toBe(true);
  });
  it('rejects plates without three letters and two or three digits', () => {
    expect(vehicleFieldErrors({ ...valid, plate: 'AB1234' }).plate).toContain('3 letras');
    expect(vehicleFieldErrors({ ...valid, plate: 'ABC-123' }).plate).toContain('3 letras');
  });
  it('reports each invalid field for inline form feedback', () => {
    expect(vehicleFieldErrors({ plate: '', internalNumber: '***', propertyCardNumber: '' })).toEqual({
      plate: 'Usa 3 letras seguidas de 2 o 3 números (ejemplo: ABC123).',
      internalNumber: 'Usa entre 1 y 40 letras, números o guiones.',
      propertyCardNumber: 'Usa entre 1 y 64 letras, números o guiones.',
    });
  });
});
