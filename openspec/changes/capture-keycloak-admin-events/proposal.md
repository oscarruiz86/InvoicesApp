# Proposal

## Why

Administrative changes made in Keycloak currently have no durable, normalized Audit record. Capturing them in local development lets the team validate the producer path and operational recovery before relying on it for authorization work.

## What Changes

- Enable Keycloak administrative event capture only in the imported local/development realm, with event details disabled.
- Add a development-only collector that reads the Keycloak Admin REST API with a least-privilege service account.
- Map only approved administrative facts into the normalized Audit contract and deliver them idempotently with restart-safe polling.
- Keep production realm configuration and runtime services unchanged.

## Capabilities

### New Capabilities
- `keycloak-admin-audit`: Development capture, privacy-safe normalization, and recoverable delivery of Keycloak administrative events to Audit.

### Modified Capabilities

## Impact

Changes the local Keycloak realm import, development Compose profile, backend event collector, test fixtures, and local operations documentation. The collector accepts an injected Audit writer; the separate Audit change supplies the MongoDB implementation and retention policy.
