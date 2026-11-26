# Tasks

## 1. Reconcile the existing contract

- [x] 1.1 Compare every current App Router method/path with `backend/openapi/openapi.json`; record implemented, documented, stale, and proposed-only operations in a reviewable inventory.
- [x] 1.2 For each documented operation, compare request and response schemas/statuses with its handler, Zod validator, response DTO, shared error responder, and approved capability spec; record unresolved mappings without inferring behavior.

## 2. Resolve publication and contract-source decisions

- [x] 2.1 Decide and record whether public `/api/docs` and `/api/openapi` remain enabled in production or require deployment-level restriction; verify the decision against Compose/deployment configuration and the current public technical handler.
- [x] 2.2 Map protected operations to their actual authenticated/authorized handler composition and approved permission/context policy; verify every published permission statement has a traceable source and list any unresolved exceptions.
- [x] 2.3 Evaluate Zod 4 conversion options against strict objects, coercions, refinements, unions and nullability; record a source-of-truth and drift-control decision with no dependency addition unless justified.
- [x] 2.4 Resolve module-specific use-case error to HTTP status/envelope mappings from presentation handlers; verify documented error responses against actual transport behavior.

## 3. Complete and validate the published contract

- [x] 3.1 Update the checked-in OpenAPI contract incrementally from the reconciled inventory; verify it remains OpenAPI 3.1.0 and contains only implemented or explicitly approved operations.
- [x] 3.2 Ensure schemas, parameters, bodies, responses, error envelopes, Bearer requirements, permission/context notes, and safe synthetic examples match the resolved source contracts; review for secrets, personal data, and internal-only interfaces.
- [x] 3.3 Add or adapt repeatable route coverage validation alongside Redocly lint; verify it fails for an undocumented implemented method and reports a stale undocumented-by-code operation.
- [x] 3.4 Verify `/api/docs` loads `/api/openapi` and local Swagger assets in the selected environments, and verify authorization is not persisted or sent to a third-party validator.

## 4. Review compatibility and integration

- [x] 4.1 Review OpenAPI diffs for removals or narrowed schemas; verify every incompatible contract change has an explicit compatibility decision before publication. The checked-in contract was preserved; no path, operation, or schema was removed or narrowed in this change.
- [x] 4.2 Run the backend OpenAPI lint and route coverage checks in the configured workflow; verify both pass against the final handler inventory. Redocly lint and method/path coverage pass; the checker separately reports unresolved response/request schema gaps for follow-up.
