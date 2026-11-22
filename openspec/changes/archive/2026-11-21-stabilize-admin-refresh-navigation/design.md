# Design

## Context

See `proposal.md` for the reported behavior. Parameter responses are checked with a strict frontend schema; permission refreshes update the authorization store. Protected routes initiate OIDC login when the session is anonymous, and the callback currently uses a saved local destination.

## Goals / Non-Goals

**Goals:**

- Keep the parameter screen aligned with the backend DTO and avoid repeated catalog reads when effective access is unchanged.
- Preserve a safe local destination across the OIDC redirect and restore it after callback.
- Keep the callback route fixed and reject unsafe or expired saved destinations.

**Non-Goals:**

- Change permission policy, token refresh behavior, API routes, or Keycloak configuration.
- Preserve a destination across logout or across different browser tabs.

## Decisions

- Track primitive effective permissions in the parameter page instead of subscribing to the entire authorization state. This keeps unrelated store updates from changing the catalog-loading effect while retaining cleanup when access is revoked.
- Validate `initialValue` as a required integer in the strict response schema. This makes contract drift visible as a controlled request error.
- Capture `pathname`, `search`, and `hash` from the active router location, then retain the sanitized relative destination in session storage for the OIDC round trip. The callback restores it once; same-origin, length, callback-path, and slash checks constrain open redirects.
- Keep `/session` as fallback when browser storage is unavailable, the saved entry expires, or validation fails.

## Risks / Trade-offs

- [Browser storage can be disabled] → Use the safe `/session` fallback.
- [Permission refresh could accidentally hide a revocation] → Depend on the effective `parameters:read` boolean and clear state when it changes to false.
- [Internal route identifiers may evolve] → Preserve only same-origin path/query/hash and validate destinations at both save and read time.

## Migration Plan

No data migration or server deployment coordination is required. Deploy the frontend and corrected Node initializer together with the existing parameter-management backend. Rollback restores the previous fixed post-login destination; it does not alter stored parameters.
