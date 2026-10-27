#!/usr/bin/env bash
# Backend, website and QA runner. Prefer the Makefile targets (`make help`); this script is
# what they call, so it also works on its own: bash scripts/dev.sh <target> [args].

set -euo pipefail
# shellcheck source=_lib.sh
source "$(dirname -- "${BASH_SOURCE[0]}")/_lib.sh"

TARGET="${1:-help}"
shift || true
# Make passes empty strings for unset variables (port=, k=, ...): treat them as absent.
arg() { local v="${1:-}"; [[ -n "$v" ]] && echo "$v" || echo "${2:-}"; }

PG_URL="postgresql://bos:local-development-only@127.0.0.1:54329/eightytwenty"

# `migrate` runs against DATABASE_URL_MIGRATIONS when backend/.env sets it. The dev DB is
# SQLite; an uncommented Supabase line would change the production schema on the spot.
guard_local_db() {
  local line
  line="$(grep -E '^(DATABASE_URL|DATABASE_URL_MIGRATIONS)=' "$BE/.env" 2>/dev/null \
    | grep -vE '=(sqlite|postgres(ql)?://[^@]*@(127\.0\.0\.1|localhost))' || true)"
  [[ -z "$line" ]] && return 0
  log_error "backend/.env points the database somewhere that is not this machine:"
  log_error "  $(cut -d= -f1 <<<"$line" | paste -sd, -)"
  die "Refusing to $1 against it from make. Comment those lines out for the local SQLite DB."
}

pending_migrations() {
  ( cd "$BE" && "$(be_python)" manage.py migrate --check >/dev/null 2>&1 ) \
    || log_warn "There are unapplied migrations. Run: make migrate"
}

# Shared by run / run-local: say so when the port is already answered (another runserver).
check_port_free() {
  local code
  code="$(http_code "http://127.0.0.1:$1/health")"
  [[ "$code" == 000 ]] && return 0
  log_warn "Something already answers on http://127.0.0.1:$1 (HTTP $code), probably another runserver."
  log_warn "Stop it first, or pick another port: make run port=8001"
}

case "$TARGET" in
  run)
    # The everyday dev server: reachable from a phone on the Wi-Fi, demo payments (no money
    # moves) and real Expo push, like the launch config backend-phone. Env set here wins
    # over backend/.env (read without overwrite), for this run only.
    port="$(arg "${1:-}" "$API_PORT")"
    py="$(be_python)"
    ip="$(lan_ip || true)"
    log_step "Backend (phone-reachable)"
    check_port_free "$port"
    pending_migrations
    log_info "Browser: http://127.0.0.1:$port   BOS: http://127.0.0.1:$port/   API docs: http://127.0.0.1:$port/api/docs/app/"
    [[ -n "$ip" ]] && log_info "Phone:   http://$ip:$port  (same Wi-Fi; the app maps 127.0.0.1 to this itself)"
    log_info "Payments: demo (no card charged).  Push: on.  Ctrl+C to stop."
    cd "$BE"
    PAYMENT_PROVIDER=demo PUSH_ENABLED=True "$py" manage.py runserver "0.0.0.0:$port"
    ;;

  run-local)
    # Plain runserver on 127.0.0.1 with backend/.env exactly as it is (no phone, no demo pay).
    port="$(arg "${1:-}" "$API_PORT")"
    log_step "Backend (this computer only)"
    check_port_free "$port"
    pending_migrations
    cd "$BE"
    "$(be_python)" manage.py runserver "127.0.0.1:$port"
    ;;

  website)
    log_step "Website on http://localhost:$WEBSITE_PORT (calls the API on 127.0.0.1:8000)"
    "$(be_python)" -m http.server "$WEBSITE_PORT" --bind 127.0.0.1 --directory "$WEB"
    ;;

  migrate)
    guard_local_db migrate
    cd "$BE"
    "$(be_python)" manage.py migrate --noinput ${1:+"$1"} ${2:+"$2"}
    ;;

  makemigrations)
    cd "$BE"
    "$(be_python)" manage.py makemigrations ${1:+"$1"}
    ;;

  showmigrations)
    cd "$BE"
    "$(be_python)" manage.py showmigrations ${1:+"$1"}
    ;;

  shell)
    cd "$BE"
    "$(be_python)" manage.py shell
    ;;

  superuser)
    guard_local_db "create a superuser"
    cd "$BE"
    "$(be_python)" manage.py createsuperuser
    ;;

  openapi)
    log_step "Regenerating docs/openapi.yaml"
    cd "$BE"
    "$(be_python)" manage.py spectacular --file ../docs/openapi.yaml --validate --fail-on-warn
    git -C "$ROOT" diff --stat -- docs/openapi.yaml
    ;;

  messages)
    "$(be_python)" "$ROOT/scripts/compile_messages.py"
    ;;

  test)
    # make test f=tests/test_auth.py k=refresh
    file="$(arg "${1:-}")" ; expr="$(arg "${2:-}")"
    args=(-q)
    [[ -n "$file" ]] && args+=("$file")
    [[ -n "$expr" ]] && args+=(-k "$expr")
    cd "$BE"
    "$(be_python)" -m pytest "${args[@]}"
    ;;

  test-pg)
    # The row-lock / capacity tests only run on Postgres (tests/test_postgres.py).
    log_step "Backend tests on Postgres 17 (docker, port 54329)"
    command -v docker >/dev/null 2>&1 || die "Docker is not installed or not on PATH."
    ( cd "$BE" && docker compose up -d --wait ) || die "Postgres did not start. Is Docker Desktop running?"
    cd "$BE"
    DATABASE_URL="$PG_URL" "$(be_python)" -m pytest -q
    ;;

  pg-up)   ( cd "$BE" && docker compose up -d --wait ) && log_ok "Postgres on 127.0.0.1:54329" ;;
  pg-down) ( cd "$BE" && docker compose down ) ;;

  test-web)
    log_step "Website + BOS front-end tests (Node)"
    node "$ROOT/scripts/test-frontend.mjs"
    node "$ROOT/scripts/test-bos-workspaces.mjs"
    ;;

  lint)
    cd "$BE"
    py="$(be_python)"
    run_step "ruff check" "$py" -m ruff check .
    run_step "ruff format --check" "$py" -m ruff format --check .
    ;;

  format)
    cd "$BE"
    py="$(be_python)"
    "$py" -m ruff check --fix .
    "$py" -m ruff format .
    ;;

  ci)
    # The same steps as .github/workflows/ci.yml (on SQLite; Postgres: make test-pg).
    log_step "Backend CI"
    cd "$BE"
    py="$(be_python)"
    run_step "ruff check" "$py" -m ruff check .
    run_step "ruff format --check" "$py" -m ruff format --check .
    run_step "manage.py check" "$py" manage.py check
    run_step "migrations in sync" "$py" manage.py makemigrations --check --dry-run
    run_step "pytest" "$py" -m pytest -q
    # Generated to a temp file and compared, so the check never edits the repo.
    tmp="$(mktemp -d)/openapi.yaml"
    run_step "OpenAPI schema valid" "$py" manage.py spectacular --file "$tmp" --validate --fail-on-warn
    if diff -q --strip-trailing-cr "$tmp" "$ROOT/docs/openapi.yaml" >/dev/null; then
      log_ok "docs/openapi.yaml matches the code"
    else
      die "docs/openapi.yaml is out of date (CI fails on this). Run: make openapi"
    fi
    ;;

  status)
    # What is running right now, and whether production answers.
    ip="$(lan_ip || true)"
    show() { # label url [timeout]
      local code; code="$(http_code "$2" "${3:-3}")"
      if [[ "$code" == 000 ]]; then printf '  %-26s %s-%s  %s\n' "$1" "$C_YELLOW" "$C_RESET" "$2"
      else printf '  %-26s %s%s%s  %s\n' "$1" "$C_GREEN" "$code" "$C_RESET" "$2"; fi
    }
    log_step "Dev servers"
    show "Backend (this computer)" "http://127.0.0.1:$API_PORT/health"
    [[ -n "$ip" ]] && show "Backend (from the phone)" "http://$ip:$API_PORT/health"
    show "Website" "http://127.0.0.1:$WEBSITE_PORT/"
    show "Metro / Expo" "http://127.0.0.1:8081/status"
    log_step "Production"
    show "API on Render" "$PROD_API/health" 20
    show "Website (Cloudflare)" "https://eightytwenty.pages.dev/" 10
    printf '\n  This computer on the Wi-Fi: %s\n' "${ip:-(none found)}"
    ;;

  install)
    log_step "Installing backend + mobile dependencies"
    "$(be_python)" -m pip install -r "$BE/requirements-dev.txt"
    ( cd "$MB" && npm install )
    log_ok "Dependencies installed"
    ;;

  clean)
    find "$BE" -type d \( -name __pycache__ -o -name .pytest_cache -o -name .ruff_cache \) -prune -exec rm -rf {} +
    log_ok "Removed __pycache__, .pytest_cache and .ruff_cache under backend/"
    ;;

  lan-ip)
    lan_ip || true; echo
    ;;

  help)
    # Read from the Makefile so the list cannot drift from the real targets.
    awk 'BEGIN {FS = ":.*## "}
         /^##@/ {printf "\n\033[1m%s\033[0m\n", substr($0, 5); next}
         /^[a-z0-9-]+:.*## / {printf "  \033[32m%-18s\033[0m %s\n", $1, $2}' "$ROOT/Makefile"
    echo
    ;;

  *)
    die "Unknown target: $TARGET (make help lists them)"
    ;;
esac
