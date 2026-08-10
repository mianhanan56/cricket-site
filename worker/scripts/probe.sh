#!/usr/bin/env bash
# Verify an upstream CricLive path before adding it to src/routes.ts.
#
# Calls cricketliveapi.com directly (bypassing the Worker) so you can confirm a
# path and see its real response shape in one step.
#
#   ./scripts/probe.sh /cricket/matches/live
#   ./scripts/probe.sh /cricket/match/151004/scorecard
#
# Public endpoints need no token. For protected ones the token is read from
# .dev.vars, or $CRICKET_API_TOKEN if set.
set -euo pipefail

BASE="${UPSTREAM_BASE:-https://cricketliveapi.com/api/v1}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

KEY="${CRICKET_API_TOKEN:-}"
if [[ -z "$KEY" && -f "$DIR/.dev.vars" ]]; then
  KEY="$(grep -E '^CRICKET_API_TOKEN=' "$DIR/.dev.vars" | head -1 | cut -d= -f2-)"
fi

DEFAULT_PATH='/cricket/matches/live'

if [[ $# -lt 1 ]]; then
  echo "No path given — probing $DEFAULT_PATH" >&2
  echo "(pass one with: npm run probe -- /cricket/match/<id>/scorecard)" >&2
  echo >&2
  set -- "$DEFAULT_PATH"
fi

PATH_ARG="$1"
URL="${BASE%/}/${PATH_ARG#/}"

echo "GET $URL"
echo "---"

# Status first, then the body — pretty-printed when it's JSON and jq is around.
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

AUTH=()
if [[ -n "$KEY" ]]; then
  AUTH=(-H "Authorization: Bearer $KEY")
  echo "(sending Bearer token)"
else
  echo "(no token — fine for public endpoints)"
fi

CODE="$(curl -s -m 20 -o "$BODY" -w '%{http_code}' \
  "${AUTH[@]}" \
  -H 'Accept: application/json' \
  -A 'PulseCrease-Probe/1.0' \
  "$URL")"

echo "HTTP $CODE"
echo "---"

if command -v jq >/dev/null 2>&1 && jq -e . "$BODY" >/dev/null 2>&1; then
  jq . "$BODY" | head -60
else
  head -c 2000 "$BODY"
  echo
fi

case "$CODE" in
  404) echo; echo "404 — path not found. Check it against the API Reference." ;;
  401) echo; echo "401 — token missing/expired, or subscription inactive." ;;
esac
