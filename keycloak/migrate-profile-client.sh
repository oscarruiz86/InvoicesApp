#!/usr/bin/env bash
set -euo pipefail
umask 077

kcadm=/opt/keycloak/bin/kcadm.sh
config=/run/kcadm/admin.config
client_config=/run/kcadm/profile.config
admin_secret_file="${KC_BOOTSTRAP_ADMIN_PASSWORD_FILE:?admin password file path is required}"
profile_secret_file="${KEYCLOAK_PROFILE_CLIENT_SECRET_FILE:?profile client secret file path is required}"
for secret_file in "$admin_secret_file" "$profile_secret_file"; do
  [[ -r "$secret_file" ]] || { echo "A Keycloak migration secret file is unavailable" >&2; exit 1; }
  size=$(wc -c < "$secret_file")
  (( size > 0 && size <= 65536 )) || { echo "A Keycloak migration secret file is invalid" >&2; exit 1; }
done

export KC_CLI_PASSWORD="$(cat "$admin_secret_file")"
export KC_CLI_CLIENT_SECRET="$(cat "$profile_secret_file")"
[[ -n "$KC_CLI_PASSWORD" && -n "$KC_CLI_CLIENT_SECRET" ]] || { echo "A Keycloak migration secret file is invalid" >&2; exit 1; }
trap 'rm -f "$config" "$client_config" /run/kcadm/profile-client.json' EXIT

"$kcadm" config credentials --config "$config" --server http://keycloak:8080 --realm master --user "${KC_BOOTSTRAP_ADMIN_USERNAME:-temp-admin}"

client_id=invoices-profile-init
client_uuid=$("$kcadm" get clients -r invoices -q "clientId=$client_id" --fields id --format csv --noquotes --config "$config" 2>/dev/null || true)
if [[ -z "$client_uuid" ]]; then
  case "$KC_CLI_CLIENT_SECRET" in
    *[!A-Za-z0-9_-]*) echo "Profile client secret must use URL-safe characters" >&2; exit 1 ;;
  esac
  printf '{"clientId":"%s","enabled":true,"protocol":"openid-connect","publicClient":false,"serviceAccountsEnabled":true,"standardFlowEnabled":false,"directAccessGrantsEnabled":false,"clientAuthenticatorType":"client-secret","secret":"%s"}\n' "$client_id" "$KC_CLI_CLIENT_SECRET" > /run/kcadm/profile-client.json
  chmod 600 /run/kcadm/profile-client.json
  "$kcadm" create clients -r invoices -f /run/kcadm/profile-client.json --config "$config"
  client_uuid=$("$kcadm" get clients -r invoices -q "clientId=$client_id" --fields id --format csv --noquotes --config "$config")
fi
[[ -n "$client_uuid" ]] || { echo "Could not resolve the Keycloak profile client" >&2; exit 1; }
"$kcadm" update "clients/$client_uuid" -r invoices -s enabled=true -s publicClient=false -s serviceAccountsEnabled=true -s clientAuthenticatorType=client-secret --config "$config"

service_user="service-account-$client_id"
scope_list=$("$kcadm" get client-scopes -r invoices --fields id,name --format csv --noquotes --config "$config")
admin_api_scope=
while IFS=, read -r scope_uuid scope_name; do
  if [[ "$scope_name" == "kc-admin-api" ]]; then admin_api_scope="$scope_uuid"; break; fi
done <<< "$scope_list"
[[ -n "$admin_api_scope" ]] || { echo "Could not resolve the Keycloak Admin REST client scope" >&2; exit 1; }
"$kcadm" update "clients/$client_uuid/default-client-scopes/$admin_api_scope" -r invoices --config "$config"
for role in manage-realm manage-clients view-clients query-clients; do
  "$kcadm" add-roles -r invoices --uusername "$service_user" --cclientid realm-management --rolename "$role" --config "$config"
done

"$kcadm" update realms/invoices -s registrationAllowed=true -s registrationEmailAsUsername=true -s loginWithEmailAllowed=true -s verifyEmail=true -s rememberMe=true -s loginTheme=invoices -s ssoSessionIdleTimeoutRememberMe=604800 -s ssoSessionMaxLifespanRememberMe=2592000 -s editUsernameAllowed=false -s 'attributes."actionTokenGeneratedByUserLifespan.verify-email"=3600' --config "$config"
web_uuid=$("$kcadm" get clients -r invoices -q clientId=invoices-web --fields id --format csv --noquotes --config "$config")
[[ -n "$web_uuid" ]] || { echo "Could not resolve the invoices-web client" >&2; exit 1; }
origin="${INVOICES_WEB_ORIGIN:-http://localhost:5173}"
"$kcadm" update "clients/$web_uuid" -r invoices -s "baseUrl=$origin/login" -s "redirectUris=[\"$origin/auth/callback\",\"$origin/silent-check-sso.html\"]" --config "$config"
"$kcadm" update users/profile -r invoices -f /opt/keycloak/data/import/invoices-user-profile.json --config "$config"

"$kcadm" config credentials --config "$client_config" --server http://keycloak:8080 --realm invoices --client "$client_id"
"$kcadm" get realms/invoices --fields realm --config "$client_config" >/dev/null

unset KC_CLI_PASSWORD KC_CLI_CLIENT_SECRET
echo "Keycloak profile client migration completed"
