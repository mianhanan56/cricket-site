#!/usr/bin/env bash
# Verify a crex endpoint before adding it to src/routes.ts.
#
# Calls the upstream host directly (bypassing the Worker) so you can confirm the
# base, the method, the payload shape and the response in one step.
#
#   ./scripts/probe.sh oc /ranking/rankingFront '{"category":0,"gender":0,"play":0}'
#   ./scripts/probe.sh php /getLiveMatches
#
# Base is one of the keys in src/upstreams.ts. Passing a JSON body switches the
# request to POST — which is what most crex endpoints want.
#
# Reading the errors:
#   "Invalid Host header"     -> wrong base; try another one
#   "Not a valid Request"     -> right base, missing/incorrect payload
#   "<field> missing"         -> add that field to the JSON body
#   "Request Payload Error!"  -> field present but the wrong type (they use
#                                numeric enums, not strings)
set -euo pipefail

declare -A BASES=(
  [oc]="https://oc.crickapi.com"
  [stats]="https://stats.crickapi.com"
  [content]="https://content.crickapi.com"
  [news]="https://crexweb.crickapi.com"
  [php]="https://api.goscorer.com/api/v3"
)

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <base> <path> [json-body]" >&2
  echo "       base is one of: ${!BASES[*]}" >&2
  exit 64
fi

BASE_NAME="$1"
ENDPOINT="$2"
BODY="${3:-}"

if [[ -z "${BASES[$BASE_NAME]:-}" ]]; then
  echo "Unknown base '$BASE_NAME' — expected one of: ${!BASES[*]}" >&2
  exit 64
fi

URL="${BASES[$BASE_NAME]}${ENDPOINT}"

# crex's hosts reject requests that don't present as their own site.
COMMON=(
  -sS --max-time 30
  -H "Accept: application/json"
  -H "Origin: https://crex.com"
  -H "Referer: https://crex.com/"
  -A "Mozilla/5.0 (compatible; PulseCrease-Worker/1.0)"
  -w '\n--- HTTP %{http_code} | %{size_download} bytes | %{time_total}s\n'
)

echo "--> ${BODY:+POST }${BODY:-GET }$URL" >&2

if [[ -n "$BODY" ]]; then
  curl "${COMMON[@]}" -X POST -H "Content-Type: application/json" -d "$BODY" "$URL"
else
  curl "${COMMON[@]}" "$URL"
fi
