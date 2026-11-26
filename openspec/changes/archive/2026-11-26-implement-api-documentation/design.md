# Design

## Context

See `proposal.md` for motivation and `specs/api-documentation/spec.md` for observable requirements. The backend is a Next.js App Router service under `backend/src/app/api`, with 57 `route.ts` files. It already includes `backend/openapi/openapi.json` (`openapi: 3.1.0`), Redocly configuration and an `openapi:lint` script, `swagger-ui-dist`, `/api/openapi`, `/api/docs`, and local Swagger assets copied by `scripts/prepare-swagger.mjs` during `predev` and `prebuild`. Swagger UI points to the published contract, disables its validator URL and does not persist authorization. The current OpenAPI file contains 73 operations.

OpenAPI is a checked-in JSON document imported by the route handler; it is not generated from source. Zod 4 is used in presentation validators, but no Zod-to-OpenAPI generator or common DTO schema registry was found. HTTP error envelopes are centralized in `shared/presentation/http/errors.ts`; feature modules also map their own errors in presentation adapters. `technicalEndpoint` makes the technical routes public while validating server configuration. Protected handlers use bearer JWT verification and selected operations use permission-based authorization; permissions are declared in code, but endpoint-to-permission mappings are not universally captured in one inventory. Keycloak is an identity/JWKS provider, not a public API login surface.

Related existing requirements are in `backend-runtime`, `identity-access`, and the domain specs for invoices, organizations, third parties, roles, drivers, vehicles, assignments, configuration, and invoice sync. Archived proposals, including `initial-invoices-app`, are historical design evidence; only current handlers and approved specs establish availability and contracts.

## Goals / Non-Goals

**Goals:**

- Keep the checked-in OpenAPI document aligned with actual route methods and transport behavior.
- Make omissions detectable with the current Redocly linting foundation and an explicit implemented-route inventory check.
- Identify contract gaps before writing exact OpenAPI schemas or operation-level permission descriptions.
- Preserve the current local Swagger asset flow and ensure examples remain synthetic and safe.

**Non-Goals:**

- Add or change REST endpoints, status codes, authentication, authorization, business rules, or DTOs.
- Document proposed but unimplemented operations as available.
- Replace OpenAPI as the public contract or add a runtime dependency solely to generate the specification.
- Expose worker, migration, administration-provider, database, or internal infrastructure interfaces as HTTP operations.

## Decisions

1. **Treat the checked-in JSON as the versioned published contract.** The current `/api/openapi` imports this file and `/api/docs` loads that endpoint. Keep one published source rather than introducing a second runtime-generated document. Continue structural validation with Redocly. Add a route coverage check based on the App Router handlers so a valid but incomplete JSON file cannot pass by itself. Alternatives considered: runtime reflection (not supported by the current route architecture) and replacing the current contract with generated output (would create a large, unreviewed contract rewrite).

2. **Use the installed Zod 4 native JSON Schema converter for representable schemas, with explicit boundary mappings for the rest.** The installed `zod@4.6.7` exposes `z.toJSONSchema`; OpenAPI 3.1 Schema Objects use the JSON Schema Draft 2020-12 dialect. A build-time generator can reuse exported request/response schemas and feed the result into the existing checked-in OpenAPI document. Use input/output mode according to the HTTP boundary, preserve named schemas through registry metadata, and fail closed for unrepresentable schema types. The local converter check preserved strict object requirements and numeric bounds, but its input form for a coerced number is `number`, not the raw query string; custom `.refine()` conditions such as whitespace rules are not fully emitted. Therefore keep query parameter serialization, coercion semantics, custom refinements, and response DTOs without Zod schemas as explicit OpenAPI mappings with parity checks. Do not set `unrepresentable: "any"`, which could silently erase constraints. Redocly remains the independent OpenAPI validator. Alternatives considered: adding a Zod/OpenAPI library despite native conversion, generating the entire contract from runtime route reflection (not supported by the architecture), and hand-maintaining every schema without an automated consistency check.

3. **Document access from the actual handler composition and approved policy.** Use `security: []` for public technical operations and Bearer JWT for protected operations. Record an operation's permission and context only when confirmed by `authorizedAction` wiring and the policy/spec; do not infer permissions from role names or UI navigation. Keep Keycloak issuer/audience as configuration context only, never secrets or a public login endpoint. For 401/403/404 and common errors, use actual handler mappings and the common error responder; preserve unresolved module-specific status mappings as explicit gaps.

4. **Keep `/api/docs` and `/api/openapi` public in every environment.** The user confirmed this policy. Both routes currently pass through `technicalEndpoint`, not authentication, and there is no separate docs service or environment-specific docs gate in the inspected backend. `predev` and `prebuild` prepare local Swagger assets from the installed `swagger-ui-dist`. Preserve this public behavior, with the existing safeguards against credentials, personal examples, third-party validators and internal-only routes.

5. **Treat route inventory as implementation evidence, not a license to document every file.** Compare each exported HTTP method/path in current handlers with OpenAPI. Exclude route files that are not HTTP handlers and internal bootstrap/workers. Only handlers present in the target branch are available; archived or proposed operations are not. Route coverage validation should report both missing contract entries and stale entries for review.

## Risks / Trade-offs

- [Existing JSON can drift even when Redocly lint passes] → Require route-to-OpenAPI coverage validation and contract review alongside lint.
- [Zod refinements or transforms may not map exactly to JSON Schema] → Keep exact request acceptance authoritative in the handler, identify unsupported constraints and add explicit schema annotations or a documented mapping; do not silently weaken schemas.
- [Large existing contract may contain stale or incomplete operations] → Reconcile against current method/path inventory and handler behavior before treating the file as baseline; preserve unresolved cases in a gap list.
- [Permission descriptions can become stale as policies evolve] → Tie each description to confirmed permission declarations and require review when guards or approved policy change.
- [Swagger and OpenAPI are public in all environments] → Preserve the confirmed public policy and verify that only the curated contract and local Swagger assets are served.

## Migration Plan

No API migration is expected. In a later implementation, first reconcile the current document to the route inventory and approved behavior, then introduce coverage validation and update the contract incrementally. Validate OpenAPI and route coverage in the backend workflow before publishing changes. Rollback consists of reverting the documentation/validation change; existing business endpoints remain unchanged.

