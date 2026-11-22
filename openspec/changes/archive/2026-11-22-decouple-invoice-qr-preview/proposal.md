# Proposal

## Why

The QR reader already returns the decoded text to the browser, so requesting a server preview adds a network round trip before the user can review the invoice. The browser and server should use the same parser while the server remains authoritative when the invoice is saved.

## What Changes

- Move the pure QR parser into shared code used by both frontend and backend.
- Build the read-only invoice preview locally after camera or image decoding; do not call the preview endpoint from the capture flow.
- Keep server-side parsing and validation during QR invoice creation. Retain the preview endpoint for existing clients.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `invoice-qr-scanning`: local preview uses the shared parser, and server creation continues to reparse the submitted QR content.

## Impact

Affected areas: shared QR parsing, frontend invoice capture/API client, backend parser import, invoice QR scanning documentation, and frontend capture tests. No change to QR creation payloads or the existing preview endpoint contract.
