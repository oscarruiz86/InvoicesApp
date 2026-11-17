#!/usr/bin/env bash
set -euo pipefail

secret_file="${KC_BOOTSTRAP_ADMIN_PASSWORD_FILE:?bootstrap password file path is required}"
[[ -r "$secret_file" ]] || { echo "Bootstrap secret file is unavailable" >&2; exit 1; }
size=$(wc -c < "$secret_file")
(( size > 0 && size <= 65536 )) || { echo "Bootstrap secret file is invalid" >&2; exit 1; }
export KC_BOOTSTRAP_ADMIN_PASSWORD="$(cat "$secret_file")"
[[ -n "$KC_BOOTSTRAP_ADMIN_PASSWORD" ]] || { echo "Bootstrap secret file is invalid" >&2; exit 1; }
export KC_BOOTSTRAP_ADMIN_USERNAME="${KC_BOOTSTRAP_ADMIN_USERNAME:-temp-admin}"

exec /opt/keycloak/bin/kc.sh bootstrap-admin user --username:env KC_BOOTSTRAP_ADMIN_USERNAME --password:env KC_BOOTSTRAP_ADMIN_PASSWORD --no-prompt
