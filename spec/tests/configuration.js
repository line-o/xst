import { test } from 'tape'
import { run, asAdmin, cleanEnv, isIsolated } from '../test.js'

// This suite tests connection *defaults* and fixture config files, all of
// which pin the default ports (8443/8080). When the suite is pointed at an
// isolated instance via XST_TEST_SERVER these tests cannot pass and are
// skipped — they still run in CI and in default local runs.
const opts = { skip: isIsolated }

test('no config file or env variables defaults to guest user', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '-f', 'modules/whoami.xq'])
  if (stderr) {
    return t.fail(stderr)
  }
  t.ok(stdout, stdout)
  const json = JSON.parse(stdout)
  t.equal(json.real.user, 'guest')
  t.notOk(json.effective)
  t.end()
})

test('read config file', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/.xstrc', '-f', 'modules/whoami.xq'])
  if (stderr) {
    return t.fail(stderr)
  }
  t.ok(stdout, stdout)
  const json = JSON.parse(stdout)
  t.equal(json.real.user, 'admin')
  t.notOk(json.effective)
  t.end()
})

test('reads environment variables', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '-f', 'modules/whoami.xq'], asAdmin)
  if (stderr) {
    return t.fail(stderr)
  }
  t.ok(stdout, stdout)
  const json = JSON.parse(stdout)
  t.equal(json.real.user, 'admin')
  t.notOk(json.effective)
  t.end()
})

test('reads configuration from .env', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/.env', '-f', 'modules/whoami.xq'])
  if (stderr) {
    return t.fail(stderr)
  }
  t.ok(stdout, stdout)
  const json = JSON.parse(stdout)
  t.equal(json.real.user, 'admin')
  t.notOk(json.effective)
  t.end()
})

test('reads configuration from .env.staging', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/.env.staging', '-f', 'modules/whoami.xq'])
  if (stderr) {
    return t.fail(stderr)
  }
  t.ok(stdout, stdout)
  const json = JSON.parse(stdout)
  t.equal(json.real.user, 'admin')
  t.notOk(json.effective)
  t.end()
})

test('reads connection from .existdb.json', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/.existdb.json', '-f', 'modules/whoami.xq'])
  if (stderr) {
    return t.fail(stderr)
  }
  t.ok(stdout, stdout)
  const json = JSON.parse(stdout)
  t.equal(json.real.user, 'admin')
  t.notOk(json.effective)
  t.end()
})

test('connection options set in configuration overrides environment variables', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/.env', '-f', 'modules/whoami.xq'], asAdmin)
  if (stderr) {
    return t.fail(stderr)
  }
  t.ok(stdout, stdout)
  const json = JSON.parse(stdout)
  t.equal(json.real.user, 'admin')
  t.notOk(json.effective)
  t.end()
})

test('fail if config file was not found', opts, async function (t) {
  const { stderr, stdout } = await run('xst', ['exec', '--config', 'non-existent.file', '-f', 'modules/whoami.xq'], asAdmin)
  if (stdout) return t.fail(stdout)
  t.ok(stderr, stderr)
  t.end()
})

test('configuration cascade', opts, function (st) {
  st.test('connection.xstrc fails to connect (certificate expired)', async function (t) {
    const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/connection.xstrc', '-f', 'modules/whoami.xq', '--verbose'])
    const lines = stderr.split('\n')
    t.equal(lines[0], 'Connecting to https://localhost:8443 as guest')
    t.ok(lines[1])
    t.notOk(stdout)
    t.end()
  })

  st.test('override server via environment variable', async function (t) {
    const { stderr, stdout } = await run('xst', ['exec', '-f', 'modules/whoami.xq', '--verbose'], {
      env: { ...cleanEnv.env, EXISTDB_SERVER: 'http://localhost:8080/' }
    })
    t.equal(stderr, 'Connecting to http://localhost:8080 as guest\n')
    const { real } = JSON.parse(stdout)
    t.equal(real.user, 'guest')
    t.end()
  })

  st.test('server set in config takes precedence over environment variable', async function (t) {
    const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/connection.xstrc', '-f', 'modules/whoami.xq', '--verbose'], {
      env: { ...cleanEnv.env, EXISTDB_SERVER: 'http://localhost:8080/' }
    })
    const lines = stderr.split('\n')
    t.equal(lines[0], 'Connecting to https://localhost:8443 as guest')
    t.ok(lines[1])
    t.notOk(stdout)
    t.end()
  })

  st.test('override user and password via environment variable', async function (t) {
    const { stderr, stdout } = await run('xst', ['exec', '--config', 'spec/fixtures/connection.xstrc', '-f', 'modules/whoami.xq', '--verbose'], {
      env: { ...cleanEnv.env, ...asAdmin.env }
    })
    const lines = stderr.split('\n')
    t.equal(lines[0], 'Connecting to https://localhost:8443 as admin')
    t.ok(lines[1])
    t.notOk(stdout)
    t.end()
  })
})
