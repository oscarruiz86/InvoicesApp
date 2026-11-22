# Tasks

## 1. Shared parsing and local review

- [x] 1.1 Move the QR parser to shared code and consume it from frontend and backend; verify both imports resolve to the same parser and `git diff --check` is clean.
- [x] 1.2 Build the read-only QR preview locally and remove the preview call from the frontend API and protected transport; verify no frontend source references the preview operation and update capture mocks to match.

## 2. Authoritative registration and documentation

- [x] 2.1 Preserve backend reparsing during QR creation and retain the preview route for existing clients; verify the create use case derives invoice fields from `qrContent` and the route contract remains present.
- [x] 2.2 Document the local review flow, compatibility endpoint, and server validation; verify `docs/invoice-qr-scanning.md` and the spec delta state the same behavior.
