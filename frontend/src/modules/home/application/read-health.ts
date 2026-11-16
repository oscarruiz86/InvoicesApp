export interface Health { readonly status: 'ok' }
export interface HealthPort { read(signal?: AbortSignal): Promise<Health> }
export type ReadHealth = (signal?: AbortSignal) => Promise<Health>;
export function createReadHealth(port: HealthPort): ReadHealth {
  return signal => port.read(signal);
}
