# Design

## Context

See [proposal.md](proposal.md). Keycloak 26.8.2 exposes administrative events with a provider event ID and millisecond timestamp. The Admin REST API supports ordered, bounded pages over inclusive time ranges. The local realm is imported from `keycloak/invoices-realm.json`; production does not use that local Compose profile.

## Goals / Non-Goals

**Goals:** least-privilege read access; minimal normalized Audit facts; bounded/restart-safe polling; local-only event capture and collector runtime.

**Non-Goals:** consume login/user events, retain Keycloak's raw representations, expose Audit queries, change production realm settings, or change the Audit retention policy.

## Decisions

- Create a dedicated service account for the local collector and assign only `realm-management:view-events`. Provision its credential from an externally supplied local secret file; do not store the credential in the realm JSON or repository.
- Set `adminEventsEnabled=true` and `adminEventsDetailsEnabled=false` in the imported local realm. Do not use the Admin REST API to reconfigure a deployed realm.
- Map provider `id` to a namespaced stable Audit event ID and provider `time` to `occurredAt`. Whitelist operation/resource type and a validated terminal resource identifier. Use the verified admin user ID, or the service-account client ID where Keycloak reports a client actor. Never persist `representation`, free-form `details`, IP address, access tokens, or other provider payload.
- Query a fixed `dateTo` for each cycle, page in ascending order with a bounded page size, and update a Mongo cursor only after all pages are written. Start the next cycle at the last completed upper bound minus a small overlap; idempotent provider IDs absorb overlap retries and protect the inclusive date filter.
- Keep the poller independent from request handlers and expose its Compose service only in an opt-in local profile. Inject the Audit writer port so this proposal can be developed separately from the Audit MongoDB adapter.

## Risks / Trade-offs

- [Keycloak retention can expire events before a long outage is recovered] → Keep polling continuously, report failures, and document that the upstream feed is the recoverable source only while Keycloak retains the event.
- [A provider response can exceed the page limit or change during polling] → Freeze each query's upper timestamp, page in order, and use a bounded overlap on the next poll.
- [Event payloads can contain sensitive state] → Disable detail capture in the local realm and explicitly drop provider representation, details, and network identifiers at the mapper.

## Migration Plan

Create the development service-account client and `view-events` mapping through an idempotent local setup command using secret files. Start the collector only with the `keycloak-admin-audit` Compose profile after the Audit writer is available. Rollback by stopping that profile and removing the local client; pending time windows will be replayed when it starts again. No production realm mutation or historical event backfill is included.
