#!/usr/bin/env bash
# Test harness for the xst suite: isolated eXist-db instances via Docker.
#
#   xst-harness.sh up     [ID] [-v VERSION] [--norest]   start instance(s)
#   xst-harness.sh env    [ID] [-v VERSION] [-n NODE]    print eval-able exports
#   xst-harness.sh test   [ID] [-v VERSION] [-n NODE]    npm test against the instance
#   xst-harness.sh norest [ID] [-v VERSION] [-n NODE]    npm run test:norest
#   xst-harness.sh down   [ID] [-v VERSION] | --all      stop instance(s)
#   xst-harness.sh matrix [-v "6.4.1 5.4.1 4.10.0"] [-n "22 24 26"]
#   xst-harness.sh node   [-n "22 24 26"]                show how node versions resolve
#
# Run it from the checkout under test, e.g. harness/xst-harness.sh test, or
# ../harness/xst-harness.sh test from a worktree next to a shared copy.
#
# ID defaults to the name of the current git worktree (xst/291 → "291"), or
# "main" in the main working tree (xst/main). Numeric IDs get deterministic
# ports: http 10000+ID, https 11000+ID. "main" uses the default ports 8080/8443
# so the full suite (incl. spec/tests/configuration.js) runs there. Everything
# else is ephemeral.
#
# NODE is a version or a prefix (22, 22.19, 22.19.0), switched with asdf, fnm,
# mise or nvm, detected in that order; XST_HARNESS_NODE_MANAGER
# (asdf|fnm|mise|nvm|none) picks one. Without -n, test and norest run the node
# the checkout selects; matrix and node use the node-version list of the
# checkout's .github/workflows/test.yml.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"

compose () { docker compose -f "$HARNESS_DIR/compose.yaml" "$@"; }

# compose.yaml lives outside the checkout, so it cannot reach the fixture by a
# relative path. Interpolation happens for every service regardless of profile,
# so this must be set even when the norest profile is off.
export NOREST_WEB_XML="$REPO_ROOT/spec/fixtures/web-no-rest.xml"

# In a linked worktree, git-dir points into <main>/.git/worktrees/<name> while
# git-common-dir stays <main>/.git; they are identical in the main working tree.
# That distinction — rather than the path shape — is what identifies a worktree.
detect_id () {
  if [ "$(git rev-parse --git-dir)" != "$(git rev-parse --git-common-dir)" ]; then
    basename "$REPO_ROOT"
  else
    echo main
  fi
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
  compose -p "$1" port "$2" "$3" | sed 's/.*://'
}

# --- node versions -------------------------------------------------------------

node_manager () { # → asdf|fnm|mise|nvm|none
  if [ -n "${XST_HARNESS_NODE_MANAGER:-}" ]; then
    case "$XST_HARNESS_NODE_MANAGER" in
      asdf|fnm|mise|nvm|none) echo "$XST_HARNESS_NODE_MANAGER" ;;
      *) echo "! XST_HARNESS_NODE_MANAGER must be asdf, fnm, mise, nvm or none, got \"$XST_HARNESS_NODE_MANAGER\"" >&2
         return 2 ;;
    esac
  elif command -v asdf >/dev/null 2>&1 && asdf plugin list 2>/dev/null | grep -x nodejs >/dev/null; then echo asdf
  elif command -v fnm >/dev/null 2>&1; then echo fnm
  elif command -v mise >/dev/null 2>&1; then echo mise
  elif [ -s "$HOME/.nvm/nvm.sh" ]; then echo nvm
  else echo none
  fi
}

asdf_node_bin () { # $1=exact version → its node binary, nothing unless completely installed
  local dir
  dir="$(asdf where nodejs "$1" 2>/dev/null)" || return 0
  if [ -x "$dir/bin/node" ]; then echo "$dir/bin/node"; fi
}

resolve_node () { # $1=version or prefix → version to hand to with_node, nothing for no switch
  local spec="$1"
  [ -n "$spec" ] || return 0
  case "$NODE_MANAGER" in
    asdf)
      if ! echo "$spec" | grep -qE '^[0-9]+(\.[0-9]+){0,2}$'; then
        echo "! \"$spec\" is not a node version, use e.g. 22, 22.19 or 22.19.0" >&2
        return 2
      fi
      local best=""
      if echo "$spec" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        if [ -n "$(asdf_node_bin "$spec")" ]; then best="$spec"; fi
      else
        # The newest complete install: asdf also lists leftovers such as 22 or
        # 22. that have no bin/node. Keep comments, quotes in comments and case
        # patterns out of the command substitution below, bash 3.2 misparses them.
        best="$(asdf list nodejs "$spec" 2>/dev/null | tr -d ' *' \
          | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
          | while read -r v; do
              if [[ "$v" == "$spec".* ]] && [ -n "$(asdf_node_bin "$v")" ]; then echo "$v"; fi
            done \
          | sort -t. -k1,1n -k2,2n -k3,3n | tail -1 || true)"
      fi
      if [ -z "$best" ]; then
        if echo "$spec" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'
        then echo "! node $spec is not installed via asdf (asdf install nodejs $spec)" >&2
        else echo "! no node $spec.x is installed via asdf (asdf install nodejs latest:$spec)" >&2
        fi
        return 2
      fi
      echo "$best"
      ;;
    none)
      echo "! no node version manager found (asdf, fnm, mise, nvm), cannot switch to node $spec" >&2
      return 2
      ;;
    *) echo "$spec" ;; # fnm, mise and nvm resolve prefixes themselves
  esac
}

with_node () { # $1=resolved version (empty: no switch), rest=command
  local v="$1"; shift
  if [ -z "$v" ]; then "$@"; return; fi
  # shellcheck disable=SC2016 # the nvm branch is expanded by the inner bash
  case "$NODE_MANAGER" in
    asdf) ASDF_NODEJS_VERSION="$v" "$@" ;;
    fnm)  fnm exec --using="$v" "$@" ;;
    mise) mise exec "node@$v" -- "$@" ;;
    nvm)  bash -c '. "$HOME/.nvm/nvm.sh" && nvm exec "$0" "$@"' "$v" "$@" ;;
    *)    echo "! cannot switch to node $v without a version manager" >&2; return 2 ;;
  esac
}

node_version () { # $1=resolved version → the version that actually runs, without "v"
  local v
  v="$(with_node "$1" node --version 2>/dev/null)" || v="unknown"
  echo "${v#v}"
}

node_label () { # $1=requested spec $2=running version → "22.19.0 (asdf, requested 22)"
  if [ -n "$1" ]; then echo "$2 ($NODE_MANAGER, requested $1)"
  elif [ "$NODE_MANAGER" = none ]; then echo "$2 (no version manager)"
  else echo "$2 ($NODE_MANAGER, checkout default)"
  fi
}

single_node () { # the node given with -n, for commands that run one suite
  # shellcheck disable=SC2086 # split the -n value into words
  set -- $NODE_SPECS
  if [ $# -gt 1 ]; then
    echo "! $CMD runs one node version, got \"$NODE_SPECS\"; use matrix for several" >&2
    return 1
  fi
  echo "${1:-}"
}

ci_node_versions () { # node-version list of the checkout's CI test workflow, e.g. "20 22 24"
  local workflow="$REPO_ROOT/.github/workflows/test.yml" line=""
  if [ -f "$workflow" ]; then
    line="$(grep -m1 -E '^[[:space:]]*node-version:[[:space:]]*\[' "$workflow" || true)"
  fi
  if [ -n "$line" ]; then
    echo "$line" | sed -e 's/.*\[//' -e 's/\].*//' -e "s/[,'\"]/ /g" | xargs
  else
    echo "22 24 26"
  fi
}

# --- commands ------------------------------------------------------------------

cmd_up () { # id version norest?
  ports_for "$1"
  local p; p="$(project "$1" "$2")"
  if [ "${3:-}" = "--norest" ]; then
    EXIST_VERSION="$2" HTTP_PORT=$HTTP_PORT HTTPS_PORT=$HTTPS_PORT \
      compose -p "$p" --profile norest up -d --wait
  else
    EXIST_VERSION="$2" HTTP_PORT=$HTTP_PORT HTTPS_PORT=$HTTPS_PORT \
      compose -p "$p" up -d --wait
  fi
  echo "# $p ready:" >&2
  cmd_env "$1" "$2"
}

cmd_env () { # id version [node] → print exports
  if [ -n "${3:-}" ]; then
    local resolved; resolved="$(resolve_node "$3")"
    if [ "$NODE_MANAGER" = asdf ]; then
      echo "export ASDF_NODEJS_VERSION=$resolved"
    else
      echo "# node $3: switch your shell with $NODE_MANAGER, only asdf can be pinned by an export"
    fi
  fi
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

ensure_deps () { # [resolved node]
  [ -d node_modules ] || with_node "${1:-}" npm ci --omit=optional
}

suite_xst () { # $1=resolved node → nothing if the suite runs this checkout's cli.js, else the xst it spawns
  # Checkouts with the isolated suite (spec/test.js knows XST_TEST_BIN) run their
  # own cli.js. Older ones spawn whatever xst a PATH lookup finds under the
  # selected node; with asdf that is a shim resolved per node version.
  if grep -q XST_TEST_BIN "$REPO_ROOT/spec/test.js" 2>/dev/null; then return 0; fi
  local bin
  bin="$(with_node "$1" sh -c 'command -v xst' 2>/dev/null)" || bin=""
  case "$bin" in
    */shims/xst)
      if [ "$NODE_MANAGER" = asdf ]; then bin="$(with_node "$1" asdf which xst 2>/dev/null)" || bin=""; fi ;;
  esac
  if [ -z "$bin" ]; then echo "no xst"; return 0; fi
  with_node "$1" node -p 'require("fs").realpathSync(process.argv[1])' "$bin" 2>/dev/null || echo "$bin"
}

require_instance () { # $1=id $2=version $3=service → fails unless the harness instance runs
  # main may also be served by a non-harness eXist on the default ports
  [ "$1" = main ] && return 0
  local p; p="$(project "$1" "$2")"
  if [ -z "$(compose -p "$p" port "$3" 8443 2>/dev/null | sed 's/.*://')" ]; then
    local up="up -v $2"
    [ "$3" = exist-norest ] && up="$up --norest"
    echo "! $p has no running $3 service; start it with: $0 $up" >&2
    return 2
  fi
}

check_suite_xst () { # $1=resolved node → fails unless the suite exercises this checkout
  local xst; xst="$(suite_xst "$1")"
  if [ -z "$xst" ] || [ "$xst" = "$REPO_ROOT/cli.js" ]; then return 0; fi
  echo "! this checkout's suite spawns xst from PATH; under node $(node_version "$1") that is $xst, not $REPO_ROOT/cli.js" >&2
  echo "! fix: run npm link in $REPO_ROOT with that node, or put a symlink xst → $REPO_ROOT/cli.js first on PATH" >&2
  return 2
}

cmd_test () { # id version node
  local resolved; resolved="$(resolve_node "$3")"
  require_instance "$1" "$2" exist
  check_suite_xst "$resolved"
  ensure_deps "$resolved"
  eval "$(cmd_env "$1" "$2" | grep '^export' || true)"
  echo "# node $(node_label "$3" "$(node_version "$resolved")") · eXist $2 · ${XST_TEST_SERVER:-https://localhost:8443}" >&2
  with_node "$resolved" npm test
}

cmd_norest () { # id version node — norest suite targets the REST-disabled instance
  local resolved; resolved="$(resolve_node "$3")"
  require_instance "$1" "$2" exist-norest
  check_suite_xst "$resolved"
  ensure_deps "$resolved"
  local p; p="$(project "$1" "$2")"
  local https; https="$(resolve_port "$p" exist-norest 8443)"
  echo "# node $(node_label "$3" "$(node_version "$resolved")") · eXist $2 without REST · https://localhost:$https" >&2
  XST_TEST_SERVER="https://localhost:$https" with_node "$resolved" npm run test:norest
}

cmd_down () { # id version | --all
  if [ "$1" = "--all" ]; then
    { docker compose ls -q | grep '^xst-' || true; } | while read -r p; do
      compose -p "$p" down -v
    done
  else
    compose -p "$(project "$1" "$2")" down -v
  fi
}

cmd_matrix () { # $1=exist versions $2=node versions
  ensure_deps ""
  local results="" failed=0 ev nv p https http resolved version log
  for ev in $1; do
    p="$(project matrix "$ev")"
    EXIST_VERSION="$ev" HTTP_PORT=0 HTTPS_PORT=0 compose -p "$p" up -d --wait
    https="$(resolve_port "$p" exist 8443)"
    http="$(resolve_port "$p" exist 8080)"
    for nv in $2; do
      if ! resolved="$(resolve_node "$nv")"; then
        results="$results\nexist $ev × node $nv: SKIP (not available via $NODE_MANAGER)"
        failed=1
        continue
      fi
      if ! check_suite_xst "$resolved"; then
        results="$results\nexist $ev × node $nv: SKIP (xst on PATH is not this checkout)"
        failed=1
        continue
      fi
      version="$(node_version "$resolved")"
      log="/tmp/xst-matrix-$ev-$version.log"
      echo "=== eXist $ev × node $(node_label "$nv" "$version") (https:$https) ===" | tee "$log" >&2
      if XST_TEST_SERVER="https://localhost:$https" \
         XST_TEST_HTTP_SERVER="http://localhost:$http" \
         with_node "$resolved" npm test >>"$log" 2>&1
      then results="$results\nexist $ev × node $nv ($version): PASS"
      else results="$results\nexist $ev × node $nv ($version): FAIL ($log)"; failed=1
      fi
    done
    compose -p "$p" down -v
  done
  printf '%b\n' "$results"
  return "$failed"
}

cmd_node () { # $1=node versions → how each would run
  local spec resolved found xst failed=0
  echo "# node version manager: $NODE_MANAGER"
  for spec in $1; do
    if resolved="$(resolve_node "$spec")" &&
       found="$(with_node "$resolved" node -p 'process.version.slice(1) + " → " + process.execPath' 2>/dev/null)"
    then
      echo "$spec → $found"
      xst="$(suite_xst "$resolved")"
      if [ -n "$xst" ]; then echo "  suite spawns xst from PATH → $xst"; fi
    else echo "$spec → not available"; failed=1
    fi
  done
  return "$failed"
}

# --- argument parsing --------------------------------------------------------
CMD="${1:-}"; shift || true
ID="" VERSION="release" NOREST="" EXIST_VERSIONS="6.4.1 5.4.1 4.10.0"
NODE_SPECS="" NODE_SPEC="" NODE_MANAGER=""
while [ $# -gt 0 ]; do
  case "$1" in
    -v) VERSION="$2"; EXIST_VERSIONS="$2"; shift 2 ;;
    -n) NODE_SPECS="$2"; shift 2 ;;
    --norest) NOREST="--norest"; shift ;;
    --all) ID="--all"; shift ;;
    *) ID="$1"; shift ;;
  esac
done
[ -z "$ID" ] && ID="$(detect_id)"

case "$CMD" in
  env|test|norest)
    NODE_MANAGER="$(node_manager)"
    NODE_SPEC="$(single_node)" ;;
  matrix|node)
    NODE_MANAGER="$(node_manager)"
    [ -n "$NODE_SPECS" ] || NODE_SPECS="$(ci_node_versions)" ;;
esac

case "$CMD" in
  up)     cmd_up "$ID" "$VERSION" "$NOREST" ;;
  env)    cmd_env "$ID" "$VERSION" "$NODE_SPEC" ;;
  test)   cmd_test "$ID" "$VERSION" "$NODE_SPEC" ;;
  norest) cmd_norest "$ID" "$VERSION" "$NODE_SPEC" ;;
  down)   if [ "$ID" = "--all" ]; then cmd_down --all; else cmd_down "$ID" "$VERSION"; fi ;;
  matrix) cmd_matrix "$EXIST_VERSIONS" "$NODE_SPECS" ;;
  node)   cmd_node "$NODE_SPECS" ;;
  *) sed -n '2,25p' "$0"; exit 1 ;;
esac
