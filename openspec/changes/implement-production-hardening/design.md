# Design

## Context

See `proposal.md` for motivation. The target is TrueNAS SCALE 25.10.2.1, using Apps → Custom App/YAML. Its existing `cloudflared` app routes `invoice.oarg.casa` through Traefik at `https://traefik.oarg.casa/`; the route must end at the frontend only. Keycloak 26.4.1 is available as `https://auth.oarg.casa/`, realm `invoices`. MongoDB and the Invoices App containers share `traefik_net`; MongoDB has authentication and a single-member `invoices-rs` primary, with a least-privilege `invoicesApp` user. MongoDB TLS is not yet confirmed.

Existing Compose is otherwise local-development oriented. `compose.notifications.production.yaml` is a hardened production slice for the notification worker; the API production image runs as `node` but does not declare the full container restrictions in the Compose profile. The frontend production image uses Nginx but its current configuration has no production security headers. The repository also has audit-outbox, invoice-sync-retention, and optional Keycloak admin audit workers, currently wired through development profiles. `GET /api/health` is deliberately liveness-only. File-based secret handling and secret rotation are already documented in `docs/runtime-secrets.md`.

## Goals / Non-Goals

**Goals:**
- Turn baseline production controls into a testable TrueNAS Custom App reference configuration.
- Build and publish public, immutable Docker Hub image versions from trusted GitHub Actions workflows; let an operator update the TrueNAS Custom App manually for the initial rollout.
- Prepare MongoDB securely for this application without publishing its port or changing other application databases.
- Keep service readiness distinct from process liveness.
- Give operators repeatable release, backup, restore, and rollback checks.
- Reuse the notification worker's runtime restrictions and existing secret interfaces.

**Non-Goals:**
- Automatically deploying through the TrueNAS management API or hosting a self-hosted GitHub runner on the NAS.
- Updating TrueNAS or Keycloak versions, or changing their existing installations as part of this proposal.
- Selecting backup retention, RPO/RTO, or a monitoring vendor where the owner has not supplied values.
- Replacing the local development Compose, `GET /api/health`, or the existing notification worker profile.
- Adding broad observability dependencies before selecting an integration target.

## Decisions

### Use TrueNAS Custom App/YAML as the deployment boundary

Keep the production Compose configuration in the repository and adapt it to the Custom App/YAML interface supported by TrueNAS 25.10.2.1. The manifest contains only Invoices App frontend, API, and workers; MongoDB and Keycloak stay as existing dependencies. All Invoices services join the external `traefik_net` for service-name connectivity, while retaining the app's private network. Do not publish MongoDB or backend ports on the host and do not add Traefik routes for them. Since `traefik_net` is shared with other projects, enforce MongoDB authentication and the database-scoped `invoicesApp` role. Validate the exact YAML and storage/network semantics on the target TrueNAS version before a production update. Do not invoke raw Docker commands behind TrueNAS Apps management.

### Publish public Docker Hub images, update TrueNAS manually first

GitHub Actions runs CI on pull requests using GitHub-hosted runners. A trusted workflow on protected `main` publishes public frontend/backend images tagged with the commit SHA (and release version where applicable), never relying on `latest`. Store only a Docker Hub publishing token in GitHub Actions secrets and pin third-party Actions to immutable commit SHAs. TrueNAS pulls public images without registry credentials; the operator changes the image tag in Custom App/YAML after reviewing the build. This avoids a remote TrueNAS API key and avoids a self-hosted runner in a public repository.

If automated deployment is desired later, evaluate a separate isolated deploy runner and TrueNAS API service account as another change. TrueNAS API keys are password-equivalent, so this proposal does not create or transmit one.

### Route only the frontend through Tunnel and Traefik

Use the existing public hostname `invoice.oarg.casa`; Cloudflare Tunnel sends it to Traefik at the supplied internal URL `https://traefik.oarg.casa/` (HTTPS default port 443, subject to confirming the origin TLS certificate). Traefik routes the host to the frontend service. The frontend reverse proxy forwards `/api` privately to the backend. MongoDB and the Keycloak administration interfaces are not public routes.

The frontend uses the public Keycloak issuer `https://auth.oarg.casa/realms/invoices`. The backend may fetch JWKS and call directory APIs through private service addresses, but token issuer validation remains the public issuer. Verify the private hostname, TLS trust, and Docker-network reachability from the app containers.

### Prepare MongoDB on the shared Docker network

Before the application writes production data, back up the current MongoDB dataset, create an Invoices-only database and least-privilege user, enable authentication, and configure a replica set compatible with the installed MongoDB version so the application's multi-document transactions work. Resolve MongoDB by its `mongodb` network alias on `traefik_net`, keep its port unpublished on the host, and provide credentials by file. Because other projects also share `traefik_net`, database authentication and least privilege remain mandatory. The chosen replica topology and TLS policy must be documented; a single TrueNAS host remains a single point of failure even if replica-set mode is enabled.

### Apply one container baseline to application workloads

Use the notification worker profile as the concrete reference for `init`, non-root execution, read-only root filesystem, minimal writable temporary mounts, dropped capabilities, `no-new-privileges`, and bounded resources. Verify the frontend image separately because Nginx may need explicit writable paths and non-root port configuration. The API already uses the `node` user; add only the missing runtime restrictions and documented writable paths. Confirm these Compose options are honored by the target TrueNAS Apps version.

### Add readiness without changing liveness

Keep `/api/health` unchanged. Add a separate readiness endpoint that checks MongoDB and any identity dependency enabled and required by the production runtime profile, with finite timeouts and no sensitive response data. Keep the worker's `/health/live` and `/health/ready` semantics independent. Readiness failures must not cause the process-liveness endpoint to report a dead process.

### Treat operational procedures as release artifacts

Add a production runbook with release checks, signal/log review, coordinated data backup and restore validation, and version rollback steps. Preserve existing secret file and rotation guidance rather than restating it; link to `docs/runtime-secrets.md`. Do not define retention durations or backup service vendor settings without an infrastructure decision.

### Keep security headers at the public web boundary

Add safe response headers to the frontend's production Nginx configuration, including a restrictive content policy compatible with Vite output and the configured API/Keycloak origins. Transport security is provided by the selected HTTPS ingress; do not set HSTS in local development or claim HTTPS solely because an internal container link is encrypted.

## Risks / Trade-offs

- [Read-only filesystems can break Nginx or framework runtime writes] → Enumerate required writable paths and mount bounded temporary storage; validate the production image under the restricted profile.
- [A dependency probe can cause restart loops during an outage] → Keep readiness separate from liveness, use bounded timeouts, and do not make readiness itself terminate a process.
- [Content Security Policy can break identity redirects or Swagger] → Derive allowed origins from the configured public endpoints and verify login shell, API, and documentation behavior in browser checks.
- [TrueNAS Custom App behavior can differ from local Docker Compose] → Validate the manifest on TrueNAS 25.10.2.1 using a non-production app and retain the current app definition for rollback.
- [Public images reveal all image layers] → Keep runtime secrets out of build args, environment baked into layers, and build context; scan the final images and publish only intended runtime files.
- [Mongo authentication or replica-set changes can disrupt a shared server] → Back up first, confirm Invoices is the only consumer, test the conversion with a copy, and validate transaction flows before accepting writes.
- [Tunnel-to-Traefik TLS may not trust the internal origin certificate] → Verify origin server name and CA trust from the cloudflared app; keep the public route on the frontend only.
- [Backup/restore outcomes depend on data-store deployment] → Document the consistency boundary and require a restore drill, while leaving backup destination, schedule, and retention to the infrastructure decision.

## Migration Plan

No deployment to the user's TrueNAS is included in this proposal. Validate the Custom App/YAML and the MongoDB change on an isolated copy first. For each application release, CI publishes a commit-pinned image; an operator manually updates the TrueNAS Custom App after review. Rollback restores the previous image tags and, if the data format changed, follows the documented compatibility/backup procedure. No automated connection from GitHub Actions to TrueNAS is included.

## Open Questions

- What host path/dataset will store invoice images and MongoDB data, and what backup destination, retention, RPO and RTO should the runbook state?
- Does `cloudflared` trust the certificate served at `https://traefik.oarg.casa/`, and is that hostname resolvable from the cloudflared app network?
- Which monitoring destination and alert recipient should be configured?

These values are required before the final production rollout. They do not change the approved initial registry flow or the TrueNAS Custom App deployment boundary.
