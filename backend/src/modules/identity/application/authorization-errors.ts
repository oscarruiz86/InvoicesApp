export class AuthorizationUnavailable extends Error { constructor() { super('AUTHORIZATION_UNAVAILABLE'); } }
export class InvalidAuthorizationRequest extends Error { constructor() { super('INVALID_REQUEST'); } }
export class ResourceNotFound extends Error { constructor() { super('RESOURCE_NOT_FOUND'); } }
export class PolicyConflict extends Error { constructor() { super('POLICY_CONFLICT'); } }
export class PolicyAuditCapacity extends Error { constructor() { super('POLICY_AUDIT_CAPACITY'); } }
