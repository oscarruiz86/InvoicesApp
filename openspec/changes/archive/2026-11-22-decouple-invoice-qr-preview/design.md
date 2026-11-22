# Design

## Context

See proposal.md for motivation and specs/invoice-qr-scanning/spec.md for the updated review behavior. The current capture flow decodes QR text in the browser, then uses `POST /api/invoices/qr/preview` to parse it before rendering the read-only fields. QR creation already submits the original text and reparses it on the server.

## Goals / Non-Goals

**Goals:** Use one pure parser implementation in the browser and server, remove the preview network round trip from the capture flow, and preserve authoritative validation when saving.

**Non-Goals:** Change QR parsing rules, creation payloads, persistence, authorization, or the preview endpoint contract. The endpoint remains for existing clients.

## Decisions

- Move the pure parser and its typed parse errors to `shared/invoice-qr.ts`. The backend domain module re-exports it, preserving its import boundary, and the browser uses the same implementation to build the read-only preview.
- Keep the capture API limited to operations that require server state. QR review is synchronous and local; only create sends the original QR text, assignment, vehicle, and optional separate attachment.
- Keep `POST /api/invoices/qr/preview` available for compatibility. Removing it would be a separate API deprecation decision and is unnecessary to remove the frontend round trip.
- Keep creation authoritative: `createQr` reparses the submitted text, recomputes metadata and hash, and derives invoice fields on the server. Client preview fields are never sent as trusted invoice data.
- Keep local parser errors mapped to the same user messages previously used for preview API errors.

Alternatives considered: retain duplicate frontend and backend parsers, which risks rule drift; remove all QR parsing from the browser, which preserves the extra round trip; delete the preview endpoint, which could break existing clients.

## Risks / Trade-offs

- [Browser and server parser behavior diverges] → Both import the same pure shared parser.
- [Local preview is mistaken for authorization or fiscal verification] → Registration still requires an authorized server request, which reparses the QR and confirms assignment eligibility; the UI continues to state that QR data does not establish fiscal authenticity.
- [Old clients still call the preview endpoint] → Preserve its existing behavior and contract.

## Migration Plan

No data migration is needed. Deploy the shared parser and frontend change together. Keep the existing preview route during rollout; the create route remains the sole write path and continues authoritative parsing. Rollback can restore the frontend preview call without changing stored invoices or endpoint contracts.
