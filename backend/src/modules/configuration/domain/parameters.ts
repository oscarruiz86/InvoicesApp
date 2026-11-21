export const parameterCatalog = {
  'invoice.manual-edit-window-seconds': {
    key: 'invoice.manual-edit-window-seconds',
    name: 'Ventana de edición de facturas manuales',
    description: 'Tiempo desde la creación durante el que se puede editar una factura manual.',
    type: 'integer',
    unit: 'seconds',
    initialValue: 43200,
    minimum: 1,
    maximum: 31536000,
    scope: 'global',
  },
} as const;

export type ParameterKey = keyof typeof parameterCatalog;
export type ParameterDefinition = (typeof parameterCatalog)[ParameterKey];
export interface EffectiveParameterPolicy {
  readonly state: 'AVAILABLE'; readonly revision: string; readonly scope: 'global';
  readonly validFrom: Date; readonly validUntil: Date | null; readonly durationSeconds: number;
}

export function isParameterKey(value: string): value is ParameterKey {
  return Object.hasOwn(parameterCatalog, value);
}

export function validateParameterValue(key: string, value: unknown): value is number {
  if (!isParameterKey(key) || typeof value !== 'number' || !Number.isSafeInteger(value)) return false;
  const definition = parameterCatalog[key];
  return value >= definition.minimum && value <= definition.maximum;
}

export function effectivePolicy(input: { key: string; value: unknown; version: unknown; effectiveFrom: unknown; now: Date }) : EffectiveParameterPolicy | null {
  if (input.key !== 'invoice.manual-edit-window-seconds' || !validateParameterValue(input.key, input.value)
    || typeof input.version !== 'number' || !Number.isSafeInteger(input.version) || input.version < 1
    || !(input.effectiveFrom instanceof Date) || !Number.isFinite(input.effectiveFrom.getTime())
    || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) || input.now < input.effectiveFrom) return null;
  return { state: 'AVAILABLE', revision: String(input.version), scope: 'global', validFrom: input.effectiveFrom,
    validUntil: null, durationSeconds: input.value };
}
