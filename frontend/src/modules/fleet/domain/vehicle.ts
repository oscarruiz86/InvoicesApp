export type VehicleFieldKey = 'plate' | 'internalNumber' | 'propertyCardNumber';
export type VehicleFieldErrors = Partial<Record<VehicleFieldKey, string>>;
const colombianPlate = /^[A-Z]{3}\d{2,3}$/;
const internalNumber = /^[A-Z0-9-]{1,40}$/;
const propertyCardNumber = /^[A-Z0-9-]{1,64}$/;
const ascii = (value: string) => [...value].every(character => character.charCodeAt(0) <= 127);

export function vehicleFieldErrors(fields: { plate: string; internalNumber: string; propertyCardNumber: string }): VehicleFieldErrors {
  const errors: VehicleFieldErrors = {};
  const plate = fields.plate.trim().toUpperCase();
  const internal = fields.internalNumber.trim().toUpperCase();
  const card = fields.propertyCardNumber.trim().toUpperCase();
  if (!plate || !colombianPlate.test(plate)) errors.plate = 'Usa 3 letras seguidas de 2 o 3 números (ejemplo: ABC123).';
  if (!internal || !internalNumber.test(internal)) errors.internalNumber = 'Usa entre 1 y 40 letras, números o guiones.';
  if (!card || !propertyCardNumber.test(card)) errors.propertyCardNumber = 'Usa entre 1 y 64 letras, números o guiones.';
  if (!ascii(fields.plate)) errors.plate = 'Usa únicamente letras sin tildes y números.';
  if (!ascii(fields.internalNumber)) errors.internalNumber = 'Usa únicamente letras sin tildes, números o guiones.';
  if (!ascii(fields.propertyCardNumber)) errors.propertyCardNumber = 'Usa únicamente letras sin tildes, números o guiones.';
  return errors;
}

export function validVehicleFields(fields: { plate: string; internalNumber: string; propertyCardNumber: string }): boolean {
  return Object.keys(vehicleFieldErrors(fields)).length === 0;
}
