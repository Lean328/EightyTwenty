#!/usr/bin/env bash
# Expo app runner (mobile/). Prefer the Makefile targets (`make help`); this script is what
# they call: bash scripts/mobile.sh <target> [args].

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

TARGET="${1:-start}"
shift || true
arg() { local v="${1:-}"; [[ -n "$v" ]] && echo "$v" || echo "${2:-}"; }

PROD_APP_API="$PROD_API/api/v1/app"
# Web gets its own port so it can run beside Expo Go's Metro on 8081.
WEB_PORT=8082

[[ -d "$MB" ]] || die "No mobile app at $MB"

ensure_env() {
  if [[ ! -f "$MB/.env" ]]; then
    cp "$MB/.env.example" "$MB/.env"
    log_info "Created mobile/.env from mobile/.env.example"
  fi
}

env_value() {
  { grep -E "^$1=" "$MB/.env" 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | tr -d '\r"'
}

# Is the dev backend reachable from the phone? The app turns 127.0.0.1 into this
# computer's Wi-Fi address itself (src/constants/config.ts resolveDevApiUrl).
check_backend() {
  local ip="$1" port="$2" code
  code="$(http_code "http://$ip:$port/health")"
  if [[ "$code" == 200 ]]; then
    log_ok "Backend reachable from the phone at http://$ip:$port"
  elif [[ "$(http_code "http://127.0.0.1:$port/health")" == 200 ]]; then
    log_warn "A backend runs on 127.0.0.1:$port only, so the phone cannot reach it."
    log_warn "Stop it and start it with: make run   (binds 0.0.0.0)"
  else
    log_warn "No backend on port $port. Start it in another terminal: make run"
  fi
}

# Expo Go on the phone. $1 = "clear" to drop Metro's cache, $2 = backend port.
start_go() {
  local clear="$1" port ip api flags=()
  port="$(arg "${2:-}" "$API_PORT")"
  require_node_modules
  ensure_env
  ip="$(lan_ip || true)"
  [[ -n "$ip" ]] || log_warn "No Wi-Fi address found: the phone must be on the same Wi-Fi as this computer."

  api="$(env_value EXPO_PUBLIC_API_BASE_URL)"
  if [[ "$port" != 8000 ]]; then
    # Another port than mobile/.env: override for this run (needs a clean cache).
    api="http://127.0.0.1:$port/api/v1/app"
    export EXPO_PUBLIC_API_BASE_URL="$api"
    clear=clear
  fi
  log_step "Expo Go"
  log_info "Data: $(env_value EXPO_PUBLIC_DATA_SOURCE)   API: $api"
  if [[ "$(env_value EXPO_PUBLIC_DATA_SOURCE)" == api && "$api" == *127.0.0.1* && -n "$ip" ]]; then
    check_backend "$ip" "$port"
  fi
  [[ "$clear" == clear ]] && flags+=(--clear) && log_info "Clearing Metro's cache (first bundle takes longer)."
  [[ -n "$ip" ]] && export REACT_NATIVE_PACKAGER_HOSTNAME="$ip" && log_info "In Expo Go: exp://$ip:8081  (or scan the QR with the iPhone Camera)"
  cd "$MB"
  npx expo start "${flags[@]}"
}

case "$TARGET" in
  start) start_go "" "${1:-}" ;;
  clear) start_go clear "${1:-}" ;;

  prod)
    # Only the JavaScript comes from this computer; every API call goes to Render.
    require_node_modules
    ensure_env
    ip="$(lan_ip || true)"
    log_step "Expo Go against the production API"
    log_warn "Real production data. Orders that cost money are refused (no payment gateway yet)."
    log_info "Checking $PROD_API/health ..."
    [[ "$(http_code "$PROD_API/health" 60)" == 200 ]] && log_ok "Production API is up" || log_warn "Production API did not answer."
    log_warn "Back to the dev server afterwards with: make mobile-clear"
    [[ -n "$ip" ]] && export REACT_NATIVE_PACKAGER_HOSTNAME="$ip"
    cd "$MB"
    EXPO_PUBLIC_DATA_SOURCE=api EXPO_PUBLIC_API_BASE_URL="$PROD_APP_API" npx expo start --clear
    ;;

  mock)
    # The client's prototype mode: everything from fixtures, no backend at all.
    require_node_modules
    ensure_env
    log_step "Expo Go with mock data (no backend)"
    log_warn "Back to the dev server afterwards with: make mobile-clear"
    ip="$(lan_ip || true)"
    [[ -n "$ip" ]] && export REACT_NATIVE_PACKAGER_HOSTNAME="$ip"
    cd "$MB"
    EXPO_PUBLIC_DATA_SOURCE=mock npx expo start --clear
    ;;

  tunnel)
    # For a Wi-Fi that blocks phone-to-computer traffic. The phone then cannot reach a local
    # backend either, so this uses the production API.
    require_node_modules
    ensure_env
    log_step "Expo Go over a tunnel (production API)"
    log_info "Expo may ask to install @expo/ngrok the first time: answer yes."
    cd "$MB"
    EXPO_PUBLIC_DATA_SOURCE=api EXPO_PUBLIC_API_BASE_URL="$PROD_APP_API" npx expo start --tunnel --clear
    ;;

  web)
    require_node_modules
    ensure_env
    log_step "App in the browser: http://localhost:$WEB_PORT"
    log_info "API: $(env_value EXPO_PUBLIC_API_BASE_URL)  (start the backend with: make run)"
    cd "$MB"
    npx expo start --web --port "$WEB_PORT"
    ;;

  install)
    log_step "npm install (mobile)"
    cd "$MB"
    npm install
    ;;

  check)
    # Everything that runs without a phone: types, lint, Jest (incl. the phone-only crash
    # guards and the screen smoke test) and expo-doctor.
    require_node_modules
    cd "$MB"
    run_step "typecheck" npm run --silent typecheck
    run_step "lint" npm run --silent lint
    run_step "jest" npx jest --silent
    run_step "expo-doctor" npx expo-doctor
    ;;

  test)
    # make mobile-test t=smoke  -> only test files matching "smoke"
    require_node_modules
    cd "$MB"
    pattern="$(arg "${1:-}")"
    npx jest ${pattern:+"$pattern"}
    ;;

  typecheck) require_node_modules; cd "$MB"; npm run --silent typecheck && log_ok "No type errors" ;;
  lint)      require_node_modules; cd "$MB"; npm run --silent lint && log_ok "Lint clean" ;;
  doctor)    require_node_modules; cd "$MB"; npx expo-doctor ;;

  smoke)
    # Every API call the app makes, against the local dev server (scripts/api-smoke.mjs).
    require_node_modules
    ensure_env
    as="$(arg "${1:-}")"
    port="$(arg "${2:-}" "$API_PORT")"
    base="http://127.0.0.1:$port/api/v1/app"
    [[ "$(http_code "http://127.0.0.1:$port/health")" == 200 ]] || die "No backend on 127.0.0.1:$port. Start it first: make run"
    log_warn "Sign-in is rate limited (10 per minute per IP): wait a minute between runs."
    cd "$MB"
    node scripts/api-smoke.mjs "$base" ${as:+--as "$as"}
    ;;

  bundle)
    # Builds the iOS and Android JavaScript bundles like a release would, to a temp folder:
    # catches import/syntax errors that only show when the phone loads the app.
    require_node_modules
    out="$(mktemp -d)"
    cd "$MB"
    run_step "iOS bundle" npx expo export --platform ios --output-dir "$out/ios"
    run_step "Android bundle" npx expo export --platform android --output-dir "$out/android"
    rm -rf "$out"
    ;;

  ios-build)
    # Release build on EAS with the production API (mobile/eas.json). Certificate, profile and
    # push key already live on EAS; mobile/.env.asc (App Store Connect API key, gitignored) lets
    # EAS check them with Apple without an Apple ID login.
    require_node_modules
    load_asc_key
    log_step "iOS release build on EAS (production API, about 15-20 minutes)"
    log_info "Checklist before submitting: mobile/docs/APP_STORE.md"
    cd "$MB"
    EAS_BUILD_NO_EXPO_GO_WARNING=true EXPO_NO_CAPABILITY_SYNC=1 \
      npx eas-cli build --platform ios --profile production --non-interactive --no-wait
    log_info "Follow it on https://expo.dev/accounts/my-an-lien/projects/eightytwenty/builds, then: make ios-submit"
    ;;

  ios-submit)
    # Uploads the latest EAS iOS build to App Store Connect (TestFlight). `eas submit` only takes
    # the API key from eas.json, so it is written into a copy for this run and the file restored.
    require_node_modules
    load_asc_key
    cd "$MB"
    cp eas.json eas.json.bak
    trap 'mv -f eas.json.bak eas.json' EXIT
    node -e '
      const fs = require("fs"); const e = process.env;
      const cfg = JSON.parse(fs.readFileSync("eas.json", "utf8"));
      Object.assign(cfg.submit.production.ios, {
        ascApiKeyPath: e.EXPO_ASC_API_KEY_PATH, ascApiKeyId: e.EXPO_ASC_KEY_ID,
        ascApiKeyIssuerId: e.EXPO_ASC_ISSUER_ID });
      fs.writeFileSync("eas.json", JSON.stringify(cfg, null, 2));'
    npx eas-cli submit --platform ios --profile production --latest --non-interactive --wait
    ;;

  lan-ip)
    lan_ip || true; echo
    ;;

  *)
    die "Unknown target: $TARGET (make help lists them)"
    ;;
esac
