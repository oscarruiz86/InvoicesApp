#!/usr/bin/env bash
set -euo pipefail
umask 077

kcadm=/opt/keycloak/bin/kcadm.sh
config=/run/kcadm/profile.config
secret_file="${KEYCLOAK_PROFILE_CLIENT_SECRET_FILE:?profile client secret file path is required}"
[[ -r "$secret_file" ]] || { echo "Profile client secret file is unavailable" >&2; exit 1; }
size=$(wc -c < "$secret_file")
(( size > 0 && size <= 65536 )) || { echo "Profile client secret file is invalid" >&2; exit 1; }
export KC_CLI_CLIENT_SECRET="$(cat "$secret_file")"
[[ -n "$KC_CLI_CLIENT_SECRET" ]] || { echo "Profile client secret file is invalid" >&2; exit 1; }
trap 'rm -f "$config"' EXIT

attempt=0
until "$kcadm" config credentials --config "$config" --server http://keycloak:8080 --realm invoices --client invoices-profile-init >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if (( attempt >= 60 )); then echo "Keycloak profile client authentication failed" >&2; exit 1; fi
  sleep 2
done
unset KC_CLI_CLIENT_SECRET

client_uuid=$("$kcadm" get clients -r invoices -q clientId=invoices-web --fields id --format csv --noquotes --config "$config")
[[ -n "$client_uuid" ]] || { echo "Could not resolve the invoices-web client" >&2; exit 1; }
"$kcadm" update realms/invoices -s registrationAllowed=true -s registrationEmailAsUsername=true -s loginWithEmailAllowed=true -s verifyEmail=true -s editUsernameAllowed=false -s 'attributes."actionTokenGeneratedByUserLifespan.verify-email"=3600' --config "$config"
"$kcadm" update "clients/$client_uuid" -r invoices -s "baseUrl=${INVOICES_WEB_ORIGIN:-http://localhost:5173}/login" --config "$config"
"$kcadm" update users/profile -r invoices -f /opt/keycloak/data/import/invoices-user-profile.json --config "$config"
"$kcadm" get realms/invoices --fields registrationAllowed,registrationEmailAsUsername,verifyEmail,attributes --config "$config" >/dev/null
echo "Keycloak profile initialized"
