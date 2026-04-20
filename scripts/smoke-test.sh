#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BRIDGE_BASE_URL:-${1:-}}"
if [[ -z "$BASE_URL" ]]; then
  echo "BRIDGE_BASE_URL is required"
  exit 1
fi

BASE_URL="${BASE_URL%/}"
HEADERS=(-H "Accept: application/json")
JSON_HEADERS=(-H "Content-Type: application/json" -H "Accept: application/json")

if [[ -n "${BRIDGE_API_KEY:-}" ]]; then
  JSON_HEADERS+=(-H "x-bridge-api-key: ${BRIDGE_API_KEY}")
fi

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  if [[ "$method" == "GET" ]]; then
    curl -sS -X GET "$url" "${HEADERS[@]}"
  else
    curl -sS -X "$method" "$url" "${JSON_HEADERS[@]}" -d "$body"
  fi
}

wait_for_contains() {
  local method="$1"
  local url="$2"
  local expected="$3"
  local body="${4:-}"
  local tries="${5:-60}"
  local response=""

  for ((i=1; i<=tries; i++)); do
    response="$(request "$method" "$url" "$body" || true)"
    if grep -q "$expected" <<<"$response"; then
      printf '%s\n' "$response"
      return 0
    fi
    sleep 2
  done

  echo "FAILED: $method $url"
  echo "$response"
  exit 1
}

wait_for_contains GET "$BASE_URL/" '"ok":true'
wait_for_contains GET "$BASE_URL/health" '"status":"healthy"'
wait_for_contains POST "$BASE_URL/command" '"action":"ping"' '{"action":"ping"}'

if [[ "${CHECK_SHOPIFY:-1}" == "1" ]]; then
  wait_for_contains POST "$BASE_URL/command" '"status":200' '{"action":"health-shopify"}'
fi

echo "READY FOR EXECUTION"
