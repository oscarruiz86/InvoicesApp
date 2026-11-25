# Design

## Context

See `proposal.md` for the motivation. The current catalog handler receives a Mongo repository whose type is inferred from its concrete factory. Company and third-party domain rules and existing OpenSpec requirements already define how NIT and CC verification digits are handled.

## Goals / Non-Goals

**Goals:**

- Keep the presentation layer dependent on an application-owned repository contract.
- Keep MongoDB as the production adapter without changing catalog operations or persistence semantics.
- Make unit and UI fixtures conform to the existing NIT/CC validation rules.

**Non-Goals:**

- Change catalog HTTP routes, request/response schemas, authorization, or audit behavior.
- Change company or third-party validation rules, stored data, or migration behavior.
- Add new document types or catalog entries.

## Decisions

### Define the catalog repository port in the application layer

The application layer owns the `CatalogRepositoryPort` interface for listing, updating labels, creating entries, and deactivating entries. The presentation handler accepts that interface; the Mongo implementation remains supplied by the existing bootstrap.

This removes a compile-time dependency on the Mongo factory from presentation code while preserving the current runtime adapter. The alternative, leaving the factory-derived return type in the handler, couples the HTTP boundary to infrastructure and makes alternate test doubles harder to type.

### Treat identity tests as regression coverage, not new policy

Update existing domain and page tests to use NIT fixtures with a one-digit verification digit and to cover CC with no verification digit. The rules are already specified in `company-management` and `third-party-management`, so this change skips spec deltas and does not alter those requirements.

The alternative, adding duplicate requirements or changing production validation to fit stale fixtures, would create competing policy descriptions or weaken existing behavior.

## Risks / Trade-offs

- **The Mongo adapter may not satisfy the new port after future signature changes** → Keep its public methods checked by TypeScript and include the catalog tests in verification.
- **Fixture updates may conceal a real UI validation regression** → Keep assertions that invalid NIT/CC combinations are rejected and run both domain and page tests.

## Migration Plan

No data migration or deployment sequencing is required. The Mongo adapter remains the runtime implementation. Rollback consists of restoring the handler's concrete factory-derived type; no persisted data needs to be reverted.
