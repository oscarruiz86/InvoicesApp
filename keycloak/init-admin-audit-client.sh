#!/usr/bin/env bash
set -euo pipefail
umask 077

kcadm=/opt/keycloak/bin/kcadm.sh
config=/run/kcadm/admin-audit.config
admin_secret_file="${KC_BOOTSTRAP_ADMIN_PASSWORD_FILE:?bootstrap password file path is required}"
client_secret_file="${KEYCLOAK_ADMIN_AUDIT_CLIENT_SECRET_FILE:?audit client secret file path is required}"
for secret_file in "$admin_secret_file" "$client_secret_file"; do
  [[ -r "$secret_file" ]] || { echo "Keycloak audit setup secret is unavailable" >&2; exit 1; }
  size=$(wc -c < "$secret_file")
  (( size > 0 && size <= 65536 )) || { echo "Keycloak audit setup secret is invalid" >&2; exit 1; }
done

export KC_CLI_PASSWORD="$(cat "$admin_secret_file")"
audit_secret="$(cat "$client_secret_file")"
[[ -n "$KC_CLI_PASSWORD" && "$audit_secret" =~ ^[A-Za-z0-9_-]{32,128}$ ]] || { echo "Keycloak audit setup secret is invalid" >&2; exit 1; }
trap 'rm -f "$config" /run/kcadm/audit-client.json' EXIT
"$kcadm" config credentials --config "$config" --server http://keycloak:8080 --realm master --user "${KC_BOOTSTRAP_ADMIN_USERNAME:-temp-admin}" >/dev/null

client_id=invoices-admin-audit-reader
client_uuid=$("$kcadm" get clients -r invoices -q "clientId=$client_id" --fields id --format csv --noquotes --config "$config" 2>/dev/null | tr -d '\r' || true)
if [[ -z "$client_uuid" ]]; then
  printf '{"clientId":"%s","enabled":true,"protocol":"openid-connect","publicClient":false,"serviceAccountsEnabled":true,"standardFlowEnabled":false,"directAccessGrantsEnabled":false,"clientAuthenticatorType":"client-secret","secret":"%s"}\n' "$client_id" "$audit_secret" > /run/kcadm/audit-client.json
  chmod 600 /run/kcadm/audit-client.json
  "$kcadm" create clients -r invoices -f /run/kcadm/audit-client.json --config "$config" >/dev/null
  client_uuid=$("$kcadm" get clients -r invoices -q "clientId=$client_id" --fields id --format csv --noquotes --config "$config" | tr -d '\r')
fi
[[ -n "$client_uuid" ]] || { echo "Could not resolve the Keycloak audit reader client" >&2; exit 1; }
"$kcadm" update "clients/$client_uuid" -r invoices -s enabled=true -s publicClient=false -s serviceAccountsEnabled=true -s clientAuthenticatorType=client-secret -s "secret=$audit_secret" --config "$config" >/dev/null
api_scope_uuid=$("$kcadm" get client-scopes -r invoices -q search=kc-admin-api --fields id,name --format csv --noquotes --config "$config" | tr -d '\r' | grep ',kc-admin-api$' | cut -d, -f1)
[[ "$api_scope_uuid" =~ ^[a-fA-F0-9-]{36}$ ]] || { echo "Could not resolve the Keycloak Admin API client scope" >&2; exit 1; }
"$kcadm" update "clients/$client_uuid/default-client-scopes/$api_scope_uuid" -r invoices --config "$config" >/dev/null
management_uuid=$("$kcadm" get clients -r invoices -q clientId=realm-management --fields id --format csv --noquotes --config "$config" | tr -d '\r')
service_user="service-account-$client_id"
"$kcadm" add-roles -r invoices --uusername "$service_user" --cclientid realm-management --rolename view-events --config "$config" >/dev/null
roles=$("$kcadm" get "users/$service_user/role-mappings/clients/$management_uuid" -r invoices --fields name --format csv --noquotes --config "$config" | tr -d '\r')
[[ "$roles" == "view-events" ]] || { echo "Keycloak audit reader has unexpected realm-management permissions" >&2; exit 1; }
"$kcadm" update realms/invoices -s adminEventsEnabled=true -s adminEventsDetailsEnabled=false --config "$config" >/dev/null
unset KC_CLI_PASSWORD audit_secret
echo "Keycloak admin audit reader initialized"
