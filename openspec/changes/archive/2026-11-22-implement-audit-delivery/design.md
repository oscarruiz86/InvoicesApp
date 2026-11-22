# Design

## Context

See [proposal.md](proposal.md). Authorization stores accepted policy-change facts in `authorization_policies.pendingEvents`; Organizations and business modules currently write module-specific event collections. The new contract must preserve existing transaction guarantees and avoid introducing a broker or an audit-history API. Retention is fixed at two years by the user.

## Goals / Non-Goals

**Goals:** provide one sanitized append-only audit sink; make event IDs idempotent; deliver captured policy events after process restarts; retain records for two years; route association changes through the same sink.

**Non-Goals:** expose audit reads, grant `audit:read`, change authorization decisions, centralize every historical business collection in this increment, or add a message broker.

## Decisions

### Event contract and validation

Define a small application port and a normalized event envelope: stable `eventId`, `occurredAt`, source, verified actor kind/subject, action, result, categorical reason, correlation ID, optional validated organization scope, safe resource type/ID, and optional before/after revisions. Reject unknown fields and unsafe identifiers. Do not store credentials, tokens, raw claims, client request bodies, or provider event representations. Keycloak ingestion maps only whitelisted administrative fields to this envelope in its separate change.

### Append-only MongoDB journal

Use a dedicated `audit_events` collection with a unique index on `eventId` and an expiry timestamp equal to `occurredAt + 730 days`. Insert with `$setOnInsert`; a retry with the same event ID and same canonical facts succeeds idempotently, while different facts for that ID are an integrity conflict. MongoDB TTL expiry can run after the exact boundary, but must never remove an event before it. Existing per-module transaction participants can write through the contract using the same Mongo session so the business write and audit capture remain atomic.

### Policy outbox delivery

Keep `pendingEvents` in the policy document because policy version and capture already commit atomically there. A worker reads a bounded batch, writes each event to Audit, then pulls only that event ID from the policy document. A crash between the journal insert and `$pull` causes a retry, which the unique event ID absorbs. A failed journal write leaves the outbox untouched. There is no separate delivery cursor that could get ahead of the durable event.

### Worker lifecycle

Provide a dedicated bounded worker command with graceful shutdown, backoff on unavailable MongoDB, and structured counts for delivered/retried events that never include event contents. It runs independently from request handlers; no policy update waits for the Audit service to be available after its durable outbox capture.

### Two-year retention and privacy

TTL is based on the server-validated event occurrence timestamp and uses the user-approved 730-day period. No delete endpoint or manual purge script is added. Audit history remains unreadable to application users while `audit:read` is ungranted. Storage/index tests use only isolated `_test` databases.

## Risks / Trade-offs

- [TTL deletion is asynchronous] → Records are guaranteed not to expire early; operations documentation states MongoDB may remove them after, rather than exactly at, the two-year boundary.
- [A policy outbox can grow while Audit is unavailable] → Bound each delivery batch, expose counts, retain events, and fail closed at the existing capture capacity instead of discarding them.
- [Different producer event shapes can leak sensitive data] → Use a strict normalized schema and source-specific mappers; do not persist generic payload objects.
- [No history API is available] → This deliberately preserves the currently denied `audit:read` permission until a separately approved query policy exists.

## Migration Plan

Create the collection and indexes idempotently when the Audit worker/adapters initialize. Do not rewrite or delete existing module event collections. Deploy the Audit worker before connecting deferred producers; on rollback, stop the worker and leave pending policy events intact for later redelivery. No live realm or existing audit records are migrated.
