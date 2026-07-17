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

From the repository root:

```sh
harness/xst-harness.sh up      # start existdb/existdb:release
harness/xst-harness.sh test    # npm test against that instance
harness/xst-harness.sh down    # stop and remove it
```

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
can start one (web.xml is replaced with `spec/fixtures/web-no-rest.xml`, mirroring
the [Test - No REST](../.github/workflows/test-no-rest.yml) workflow):

```sh
harness/xst-harness.sh up --norest
harness/xst-harness.sh norest
```

## Matrix runs

```sh
harness/xst-harness.sh matrix                     # 6.4.1 5.4.1 4.10.0 × node 20 22 24
harness/xst-harness.sh matrix -v "6.4.1" -n "24"
```

Node switching uses fnm, mise, or nvm — whichever is found; otherwise the current
node with a warning. Per-run logs land in `/tmp/xst-matrix-<exist>-<node>.log`.

## Multiple instances / git worktrees

Each instance is keyed by an `ID`. Passing an explicit ID (or running from a
`.worktrees/<n>` directory, where the ID is detected automatically) gives that
instance its own deterministic ports, so several can run side by side:

```sh
harness/xst-harness.sh up 7        # http 10007, https 11007
harness/xst-harness.sh up 8        # http 10008, https 11008
harness/xst-harness.sh down --all  # stop every harness instance
```

Port scheme: numeric ID `<n>` → http `10000+n`, https `11000+n`. The default ID
`main` uses 8080/8443 so the full suite (including `spec/tests/configuration.js`,
which pins those ports) runs unrestricted.

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
