# Assignment data preparation

## Baseline inventory

The read-only inventory was run on 2026-11-20 against both the MongoDB URI in
`backend/.env.local` and the documented development Compose database. Each
returned 0 documents in `vehicle_assignments`, 0 malformed documents and 0
duplicate ACTIVE vehicle-driver pairs. With no assignment documents, there
are no participant references to validate and no remediation or quarantine is
required. The expected baseline is an empty collection because assignment
writers have not been implemented.

The repository documents that the application has not been deployed to
production or another environment yet. No deployed assignment database exists
to inventory.

## Transaction topology

The supported local Compose topology starts a single-node MongoDB replica set
named `invoices-rs`. A read-only `hello` command to `127.0.0.1:27019` returned
`setName: invoices-rs` and `isWritablePrimary: true`, confirming the development
database supports transactions. `backend/.env.local` currently points to a
standalone MongoDB at `127.0.0.1:27017`; use the Compose URI with
`replicaSet=invoices-rs` for transaction-backed development work. The repository
states that the application is not deployed, so there is no deployment topology
to verify yet. Any future deployment must use a replica set or sharded cluster;
assignment writes must fail closed if transaction support is unavailable.

## Commands and runtime gate

From the repository root, run `npm --prefix backend run assignments:inventory` for a read-only report. Review it before running `npm --prefix backend run assignments:migrate`; the migration backs up source rows, backfills valid records, quarantines invalid rows and supports rollback by migration ID. Assignment repository initialization also runs the inspection before creating indexes and rejects pending migration work. Do not point these commands at an operational database until the report and remediation are reviewed for that environment.
