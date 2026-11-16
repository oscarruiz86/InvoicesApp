export class ConfigurationError extends Error {
  constructor(public readonly fields: readonly string[]) {
    super('Configuración de servicio inválida');
    this.name = 'ConfigurationError';
  }
}
