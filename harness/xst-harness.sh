#!/usr/bin/env bash
# Test harness for the xst suite: isolated eXist-db instances via Docker.
#
#   xst-harness.sh up     [ID] [-v VERSION] [--norest]   start instance(s)
#   xst-harness.sh env    [ID] [-v VERSION]              print eval-able exports
#   xst-harness.sh test   [ID] [-v VERSION]              npm test against the instance
#   xst-harness.sh norest [ID] [-v VERSION]              npm run test:norest
#   xst-harness.sh down   [ID] [-v VERSION] | --all      stop instance(s)
#   xst-harness.sh matrix [-v "6.4.1 5.4.1 4.10.0"] [-n "20 22 24"]
#
# ID defaults to the current worktree (digits of .worktrees/<n>) or "main".
# Numeric IDs get deterministic ports: http 10000+ID, https 11000+ID.
# "main" uses the default ports 8080/8443 so the full suite (incl.
# spec/tests/configuration.js) runs there. Everything else is ephemeral.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE="docker compose -f $HARNESS_DIR/compose.yaml"

detect_id () {
  case "$PWD" in
    */.worktrees/*) basename "$(echo "$PWD" | sed -E 's|(.*/\.worktrees/[^/]+).*|\1|')" ;;
    *) echo main ;;
  esac
}

sanitize () { echo "$1" | tr '.' '-' | tr '[:upper:]' '[:lower:]'; }

project () { # $1=id $2=version
  echo "xst-$(sanitize "$1")-$(sanitize "$2")"
}

ports_for () { # $1=id → sets HTTP_PORT HTTPS_PORT (0 = ephemeral)
  if [ "$1" = main ]; then HTTP_PORT=8080; HTTPS_PORT=8443
  elif echo "$1" | grep -qE '^[0-9]+$'; then HTTP_PORT=$((10000 + $1)); HTTPS_PORT=$((11000 + $1))
  else HTTP_PORT=0; HTTPS_PORT=0
  fi
}

resolve_port () { # $1=project $2=service $3=container-port
  $COMPOSE -p "$1" port "$2" "$3" | sed 's/.*://'
}

cmd_up () { # id version norest?
  ports_for "$1"
  local p; p="$(project "$1" "$2")"
  local profiles=""
  [ "${3:-}" = "--norest" ] && profiles="--profile norest"
  EXIST_VERSION="$2" HTTP_PORT=$HTTP_PORT HTTPS_PORT=$HTTPS_PORT \
    $COMPOSE -p "$p" $profiles up -d --wait
  echo "# $p ready:" >&2
  cmd_env "$1" "$2"
}

cmd_env () { # id version → print exports
  local p; p="$(project "$1" "$2")"
  local https http
  https="$(resolve_port "$p" exist 8443)"
  http="$(resolve_port "$p" exist 8080)"
  if [ "$1" = main ] && [ "$https" = "8443" ]; then
    echo "# main uses default ports; no overrides needed"
  else
    echo "export XST_TEST_SERVER=https://localhost:$https"
    echo "export XST_TEST_HTTP_SERVER=http://localhost:$http"
  fi
  local norest_https
  if norest_https="$(resolve_port "$p" exist-norest 8443 2>/dev/null)" && [ -n "$norest_https" ]; then
    echo "export XST_TEST_NOREST_SERVER=https://localhost:$norest_https"
  fi
}

ensure_deps () { [ -d node_modules ] || npm ci --omit=optional; }

cmd_test () { # id version
  ensure_deps
  eval "$(cmd_env "$1" "$2" | grep '^export' || true)"
  npm test
}

cmd_norest () { # id version — norest suite targets the REST-disabled instance
  ensure_deps
  local p; p="$(project "$1" "$2")"
  local https; https="$(resolve_port "$p" exist-norest 8443)"
  XST_TEST_SERVER="https://localhost:$https" npm run test:norest
}

cmd_down () { # id version | --all
  if [ "$1" = "--all" ]; then
    docker compose ls -q | grep '^xst-' | while read -r p; do
      $COMPOSE -p "$p" down -v
    done
  else
    $COMPOSE -p "$(project "$1" "$2")" down -v
  fi
}

with_node () { # $1=version, rest=command — best-effort node version switching
  local v="$1"; shift
  if command -v fnm >/dev/null 2>&1; then fnm exec --using="$v" "$@"
  elif command -v mise >/dev/null 2>&1; then mise exec "node@$v" -- "$@"
  elif [ -s "$HOME/.nvm/nvm.sh" ]; then bash -c ". '$HOME/.nvm/nvm.sh' && nvm exec $v $*"
  else
    echo "! no node version manager found (fnm/mise/nvm) — using $(node --version)" >&2
    "$@"
  fi
}

cmd_matrix () { # $1=exist versions $2=node versions
  ensure_deps
  local results=""
  for ev in $1; do
    local p; p="$(project matrix "$ev")"
    EXIST_VERSION="$ev" HTTP_PORT=0 HTTPS_PORT=0 $COMPOSE -p "$p" up -d --wait
    local https http
    https="$(resolve_port "$p" exist 8443)"
    http="$(resolve_port "$p" exist 8080)"
    for nv in $2; do
      echo "=== eXist $ev × Node $nv (https:$https) ===" >&2
      if XST_TEST_SERVER="https://localhost:$https" \
         XST_TEST_HTTP_SERVER="http://localhost:$http" \
         with_node "$nv" npm test >/tmp/xst-matrix-$ev-$nv.log 2>&1
      then results="$results\nexist $ev × node $nv: PASS"
      else results="$results\nexist $ev × node $nv: FAIL (/tmp/xst-matrix-$ev-$nv.log)"
      fi
    done
    $COMPOSE -p "$p" down -v
  done
  printf '%b\n' "$results"
}

# --- argument parsing --------------------------------------------------------
CMD="${1:-}"; shift || true
ID="" VERSION="release" NOREST="" EXIST_VERSIONS="6.4.1 5.4.1 4.10.0" NODE_VERSIONS="20 22 24"
while [ $# -gt 0 ]; do
  case "$1" in
    -v) VERSION="$2"; EXIST_VERSIONS="$2"; shift 2 ;;
    -n) NODE_VERSIONS="$2"; shift 2 ;;
    --norest) NOREST="--norest"; shift ;;
    --all) ID="--all"; shift ;;
    *) ID="$1"; shift ;;
  esac
done
[ -z "$ID" ] && ID="$(detect_id)"

case "$CMD" in
  up)     cmd_up "$ID" "$VERSION" $NOREST ;;
  env)    cmd_env "$ID" "$VERSION" ;;
  test)   cmd_test "$ID" "$VERSION" ;;
  norest) cmd_norest "$ID" "$VERSION" ;;
  down)   if [ "$ID" = "--all" ]; then cmd_down --all; else cmd_down "$ID" "$VERSION"; fi ;;
  matrix) cmd_matrix "$EXIST_VERSIONS" "$NODE_VERSIONS" ;;
  *) sed -n '2,15p' "$0"; exit 1 ;;
esac
