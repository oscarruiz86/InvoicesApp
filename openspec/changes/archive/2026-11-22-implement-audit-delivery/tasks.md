# Tasks

## 1. Public Audit contract

- [x] 1.1 Define the normalized event type and strict sanitizer/validator; unit tests reject unsafe or unknown fields and accept valid security and organization facts.
- [x] 1.2 Document the producer contract, stable event IDs, categories, safe context/resource fields, and the rule that audit history remains unreadable without an approved query policy.

## 2. Durable journal and retention

- [x] 2.1 Implement the MongoDB Audit writer with unique event IDs, immutable insert semantics, and conflict detection; integration tests verify repeated delivery creates one record and conflicting reuse preserves the original.
- [x] 2.2 Add the two-calendar-year expiry timestamp and TTL index idempotently; isolated MongoDB tests verify leap-year boundary calculation, index options, and that unexpired records are preserved.
- [x] 2.3 Document MongoDB TTL's asynchronous deletion behavior, operational index setup, backup scope, and the two-year retention rule.

## 3. Synchronous producer integrations

- [x] 3.1 Route organization association/context audit facts through the public Audit contract using the producer transaction; MongoDB integration tests verify the audit fact commits or rolls back with its organization mutation and contains no unvalidated IDs or payloads.
- [x] 3.2 Route authorization denials to the sanitized Audit writer while preserving best-effort denial semantics; tests verify a failed audit write never turns a denial into an allow response.

## 4. Recoverable policy-event delivery

- [x] 4.1 Implement a bounded policy outbox worker that writes captured events to Audit before acknowledging the matching event ID; unit tests cover backoff, bounded batches, and graceful stop.
- [x] 4.2 Verify real MongoDB recovery after interruption between Audit insert and outbox acknowledgement, including duplicate suppression, unchanged event identity, retained retry on sink failure, and event-count logging without event contents.
- [x] 4.3 Add the worker command and operational guidance for startup, monitoring counts, restart/recovery, and the existing outbox capacity behavior.

## 5. Integrated acceptance

- [x] 5.1 Run backend checks, isolated MongoDB integration, and strict OpenSpec validation; reconcile the shared Audit contract with the separate Keycloak event-ingestion change without adding a history endpoint or enabling `audit:read`.
