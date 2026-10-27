# shellcheck shell=bash
# Shared helpers for scripts/dev.sh and scripts/mobile.sh: logging, paths, Python, LAN address.

if [[ -t 1 ]]; then
  C_RESET=$'\033[0m' C_BOLD=$'\033[1m' C_RED=$'\033[31m' C_GREEN=$'\033[32m'
  C_YELLOW=$'\033[33m' C_BLUE=$'\033[34m' C_CYAN=$'\033[36m'
else
  C_RESET='' C_BOLD='' C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_CYAN=''
fi

log_info()  { printf '%s>%s %s\n' "$C_CYAN" "$C_RESET" "$*"; }
log_ok()    { printf '%sOK%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
log_warn()  { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
log_error() { printf '%sx%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
log_step()  { printf '\n%s%s-- %s --%s\n' "$C_BOLD" "$C_BLUE" "$*" "$C_RESET"; }
die()       { log_error "$*"; exit 1; }

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BE="$ROOT/backend"
MB="$ROOT/mobile"
WEB="$ROOT/website"

API_PORT="${API_PORT:-8000}"
WEBSITE_PORT=8123
PROD_API="https://eightytwenty-api.onrender.com"

# The venv lives at the repo root (.venv), not in backend/.
be_python() {
  if [[ -x "$ROOT/.venv/Scripts/python.exe" ]]; then echo "$ROOT/.venv/Scripts/python.exe"
  elif [[ -x "$ROOT/.venv/bin/python" ]]; then echo "$ROOT/.venv/bin/python"
  else command -v python3 || command -v python || die "No Python found (expected .venv at the repo root)."; fi
}

# Run a labelled step and report its time; set -e in the caller stops on failure.
run_step() {
  local label="$1"; shift
  log_info "$label"
  local start=$SECONDS
  "$@"
  log_ok "$label ($(( SECONDS - start ))s)"
}

# HTTP status of a URL, or 000 when nothing answers.
http_code() {
  curl -s -o /dev/null -m "${2:-3}" -w '%{http_code}' "$1" 2>/dev/null || true
}

# The Wi-Fi/Ethernet address a phone on the same network can reach. Virtual adapters
# (WSL, Hyper-V, Docker, VPNs) are skipped: Metro advertising one of those is the usual
# reason a phone "cannot connect".
lan_ip() {
  command -v node >/dev/null 2>&1 || return 1
  node -e '
    const nets = require("os").networkInterfaces();
    const virtual = /^(vEthernet|VMware|VirtualBox|Hyper-V|Loopback|docker|br-|veth|utun|tun|tap|Npcap|Tailscale|ZeroTier|Bluetooth)/i;
    const physical = /wi-?fi|wlan|wireless|^en[0-9]|^eth|ethernet/i;
    const found = [];
    for (const [name, list] of Object.entries(nets)) {
      if (virtual.test(name)) continue;
      for (const a of list || []) if (a.family === "IPv4" && !a.internal) found.push({ name, ip: a.address });
    }
    const pick = found.find((i) => physical.test(i.name)) || found[0];
    if (pick) process.stdout.write(pick.ip);
  ' 2>/dev/null
}

require_node_modules() {
  [[ -d "$MB/node_modules" ]] || die "mobile/node_modules is missing. Run: make mobile-install"
}

# App Store Connect API key for EAS (mobile/.env.asc, gitignored; see mobile/docs/APP_STORE.md).
load_asc_key() {
  [[ -f "$MB/.env.asc" ]] || die "mobile/.env.asc is missing (App Store Connect API key). See mobile/docs/APP_STORE.md"
  set -a
  # shellcheck disable=SC1091
  source <(tr -d '\r' < "$MB/.env.asc")
  set +a
  [[ -f "$EXPO_ASC_API_KEY_PATH" ]] || die "API key file not found: $EXPO_ASC_API_KEY_PATH"
}
