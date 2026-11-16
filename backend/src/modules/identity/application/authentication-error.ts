export class AuthenticationError extends Error {
  constructor() { super('UNAUTHENTICATED'); this.name = 'AuthenticationError'; }
}

export class AuthorizationError extends Error {
  constructor() { super('FORBIDDEN'); this.name = 'AuthorizationError'; }
}
