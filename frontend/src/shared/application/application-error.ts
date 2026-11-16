export type ErrorCode = 'CONFIGURATION' | 'NETWORK' | 'TIMEOUT' | 'CANCELLED' | 'HTTP' | 'INVALID_RESPONSE' | 'UNEXPECTED' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'UNAVAILABLE';
export class ApplicationError extends Error {
  constructor(public readonly code: ErrorCode) { super(code); this.name = 'ApplicationError'; }
}
