# Test harness

Docker-based helper for running the xst test suite against a real eXist-db
instance — without a global install and without port collisions. It starts a
throwaway container, wires the suite to it via `XST_TEST_SERVER`, and tears it
down again.

Use it so your local runs match CI instead of depending on whatever instance
happens to be on `localhost:8443`.

## Prerequisites

Docker with Compose v2 (`docker compose`).

## Everyday use

Run it from the checkout you want to test — `npm test` and the dependency
check run in the current directory:

```sh
harness/xst-harness.sh up      # start existdb/existdb:release
harness/xst-harness.sh test    # npm test against that instance
harness/xst-harness.sh down    # stop and remove it
```

The script finds its `compose.yaml` next to itself and the checkout via git, so
a single copy can also serve several worktrees (e.g. `../harness/xst-harness.sh test`
from a worktree next to it).

Run against another eXist version (host ports are picked automatically):

```sh
harness/xst-harness.sh up   -v 6.4.1
harness/xst-harness.sh test -v 6.4.1
```

Hack interactively against the running instance:

```sh
eval "$(harness/xst-harness.sh env)"   # exports XST_TEST_SERVER / XST_TEST_HTTP_SERVER
node cli.js ls /db
```

## No-REST suite

`npm run test:norest` needs an instance with the REST API disabled. The harness
can start one (web.xml is replaced with the checkout's
`spec/fixtures/web-no-rest.xml`, mirroring the `Test - No REST` workflow in
`.github/workflows/test-no-rest.yml`):

```sh
harness/xst-harness.sh up --norest
harness/xst-harness.sh norest
```

## Matrix runs

```sh
harness/xst-harness.sh matrix                     # 6.4.1 5.4.1 4.10.0 × the Node versions CI tests
harness/xst-harness.sh matrix -v "6.4.1" -n "22 26"
```

Per-run logs land in `/tmp/xst-matrix-<exist>-<node>.log`, named after the Node
version that actually ran. `matrix` exits 1 if any cell fails or its Node
version is not available.

## Node versions

`test`, `norest`, `env` and `matrix` take `-n` with a version or a prefix:

```sh
harness/xst-harness.sh test -n 22           # newest installed 22.x
harness/xst-harness.sh test -n 22.19.0      # exactly this version
harness/xst-harness.sh node -n "20 22 26"   # what each resolves to, no Docker needed
eval "$(harness/xst-harness.sh env -n 22)"  # also pins this shell (asdf only)
```

The version manager is detected in this order: **asdf** (with the `nodejs`
plugin), fnm, mise, nvm. `XST_HARNESS_NODE_MANAGER=asdf|fnm|mise|nvm|none`
picks one explicitly.

With asdf, a prefix resolves to the newest *complete* install — one that has a
`bin/node`; empty leftovers such as `22` or `22.` are skipped. The version is
switched with `ASDF_NODEJS_VERSION`, so `npm` and every `node` the suite spawns
run on it too. A version that is not installed is an error, never a silent
fallback to the current Node.

Checkouts whose `spec/test.js` predates the isolated suite (no `XST_TEST_BIN`)
spawn `xst` from `PATH`. With asdf that is a shim resolved per Node version, so
every Node can point at a different xst — a published release, another
checkout's `npm link`, a stale link, or nothing. `test`, `norest` and `matrix`
refuse to run such a suite unless that xst is the checkout's own `cli.js`, and
`node` shows what it resolves to. Fix it with `npm link` in the checkout under
that Node, or a symlink `xst → <checkout>/cli.js` first on `PATH`.

Without `-n`, `test` and `norest` use the Node the checkout selects (with asdf:
`.tool-versions`, else the global version). `matrix` and `node` default to the
`node-version` list in the checkout's `.github/workflows/test.yml`, so each
branch is tested on the Node versions its CI uses.

`test` and `norest` also refuse to start when the instance for the given ID and
`-v` version is not running; the message names the `up` command to run. `main`
is exempt, since the default ports may be served by an eXist the harness did not
start.

Every run starts with a header naming the Node that ran, e.g.

```
# node 22.19.0 (asdf, requested 22) · eXist 6.4.1 · https://localhost:10291
```

## Multiple instances / git worktrees

Each instance is keyed by an `ID`, detected from the git worktree you run in:
a linked worktree in a directory named `291` → `291`, the main working tree →
`main`. Every ID gets its own deterministic ports, so several can run side by side:

```sh
harness/xst-harness.sh up 7        # http 10007, https 11007
harness/xst-harness.sh up 8        # http 10008, https 11008
harness/xst-harness.sh down --all  # stop every harness instance
```

Port scheme: numeric ID `<n>` → http `10000+n`, https `11000+n`. Name worktree
directories after their issue number to get stable ports. The ID `main` uses
8080/8443 so the full suite (including `spec/tests/configuration.js`, which pins
those ports) runs unrestricted.

## Known limitations

- `spec/tests/configuration.js` skips itself under `XST_TEST_SERVER` (it tests
  connection defaults and fixtures that pin ports 8443/8080). It still runs
  under the default `main` ID and in CI.
- The package registry suite needs `public-repo` installed in the instance
  (CI installs it on eXist ≥ 6). Without it that suite skips itself. To mirror CI:

  ```sh
  eval "$(harness/xst-harness.sh env)"
  EXISTDB_SERVER=$XST_TEST_HTTP_SERVER EXISTDB_USER=admin EXISTDB_PASS= \
    node cli.js package install github-release public-repo v4.0.0 --verbose
  ```

- If TLS verification errors appear over https, prepend
  `NODE_TLS_REJECT_UNAUTHORIZED=0` (the container uses a self-signed cert).
- The `release` tag can point at a pre-release that fails the package-fixture
  install. If you hit that, pin a stable version with `-v 6.4.1`.
