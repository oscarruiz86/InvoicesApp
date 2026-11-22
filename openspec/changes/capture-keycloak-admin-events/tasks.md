# Tasks

## 1. Local Keycloak capture and credentials

- [x] 1.1 Enable local realm administrative events with event details disabled; verify the imported realm representation and a disposable Keycloak initialization.
- [x] 1.2 Provision a separate local collector service account from a secret file with only `realm-management:view-events`; verify its role mappings and that it cannot perform a realm write.
- [x] 1.3 Add the opt-in local Compose profile and secret wiring for the collector; verify `docker compose config --quiet` and confirm the default service set does not include the collector.

## 2. Safe Keycloak event mapping

- [x] 2.1 Implement the provider-to-Audit mapper using stable provider IDs, timestamps, verified actor identity, and validated action/resource fields; unit tests verify allowed values and malformed events are rejected.
- [x] 2.2 Exclude representations, free-form details, network identifiers, credentials, and tokens; unit tests assert sensitive provider fields never appear in mapped events.
- [x] 2.3 Document the local capture boundary, event privacy, service-account setup, and upstream event-retention limitation; verify each documented local command matches Compose/setup configuration.

## 3. Recoverable event collector

- [x] 3.1 Implement a bounded ascending page reader over a fixed time window and an overlapping durable Mongo cursor; unit tests verify paging, retries, overlap, and no cursor advance on sink failure.
- [x] 3.2 Add the local worker command with graceful shutdown and safe event-count logs; verify the worker starts only from the opt-in profile and does not log event contents or credentials.
- [x] 3.3 Exercise event capture and `view-events` access against a disposable Keycloak realm, including delivery retry/restart with stable event identity; verify the isolated integration suite passes.

## 4. Integrated acceptance

- [x] 4.1 Run backend checks, the prepared Keycloak/Mongo integration, Compose validation, and strict OpenSpec validation; verify production configuration has no event-capture or collector activation.
