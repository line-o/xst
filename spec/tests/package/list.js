import { test } from 'tape'
import { run, asAdmin, testServer } from '../../test.js'

const testAppName = 'http://exist-db.org/apps/test-app'
const testLibName = 'http://exist-db.org/apps/test-lib'

async function removeTestApp (t) {
  const { stderr } = await run('xst', ['run', `repo:undeploy("${testAppName}"),repo:remove("${testAppName}")`], asAdmin)
  if (stderr) {
    console.error(stderr)
    t.fail(stderr)
  }
}

async function removeTestlib (t) {
  const { stderr } = await run('xst', ['run', `repo:undeploy("${testLibName}"),repo:remove("${testLibName}")`], asAdmin)
  if (stderr) {
    console.error(stderr)
    t.fail(stderr)
  }
}

async function cleanup (t) {
  await removeTestlib(t)
  await removeTestApp(t)
}

test('shows help', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--help'])

  if (stderr) { return t.fail(stderr) }
  t.ok(stdout, 'got output')
  const firstLine = stdout.split('\n')[0]
  t.equal(firstLine, 'xst package list [options]', firstLine)
})

test('shows full name', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--full-name'])

  if (stderr) { return t.fail(stderr) }
  const lines = stdout.split('\n')
  t.equal(lines[0], 'http://exist-db.org/apps/dashboard')
})

test('shows version', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--versions'])

  if (stderr) { return t.fail(stderr) }
  const lines = stdout.split('\n')
  t.ok(lines[0].match(/^[a-zA-Z0-9-]+ +\d+\.\d+(\.\d+(-[^ ]+)?)? *$/)[0], lines[0])
})

test('shows dependencies', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--dependencies'])

  if (stderr) { return t.fail(stderr) }
  t.ok(stdout, 'got output')
})

test('filters by type (libraries)', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--lib'])

  if (stderr) { return t.fail(stderr) }
  const lines = stdout.split('\n')
  t.equal(lines[0], 'functx')
})

test('filters by type (application)', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--app'])

  if (stderr) { return t.fail(stderr) }
  const lines = stdout.split('\n')
  t.equal(lines[0], 'dashboard')
})

test('sorts by type', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--typesort'])

  if (stderr) { return t.fail(stderr) }
  const lines = stdout.split('\n')
  t.equal(lines[0], 'dashboard')
})

test.skip('sorts by type and installation date', async function (t) {
  const { stderr, stdout } = await run('xst', ['package', 'list', '--typesort', '--timesort'])

  if (stderr) { return t.fail(stderr) }
  const lines = stdout.split('\n')
  t.equal(lines[0], `Install test-app.xar on ${testServer}`)
})

test('with new package', async function (t) {
  let firstInstallationDate
  t.test('install extra package with dependency', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'install', 'local', 'spec/fixtures/test-lib.xar', 'spec/fixtures/test-app.xar'], asAdmin)
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }
    st.ok(stdout)
  })

  t.test('list', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'list', '--date', 'iso'], asAdmin)
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }

    const lines = stdout.split('\n')
    const found = lines.filter(line => line.startsWith('test-app'))
    st.ok(found.length, found[0])
    firstInstallationDate = new Date(found[0].match(/\d+-.+$/)[0])
    st.ok(firstInstallationDate, 'first installation date')
    st.end()
  })

  t.test('sorts by installation date', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'list', '--timesort'])

    if (stderr) { return t.fail(stderr) }
    const lines = stdout.split('\n')
    st.equal(lines.shift(), 'test-app', 'test-app is first')
  })

  t.test('shows extended output of test-app', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'list', '--extended', '--timesort'])

    if (stderr) { return t.fail(stderr) }
    const lines = stdout.split('\n')
    st.ok(lines[0].startsWith('test-app'), lines[0])
    st.equal(lines[1], 'Title: Test App')
    st.equal(lines[2], 'Name: http://exist-db.org/apps/test-app')
    st.equal(lines[3], 'Author: Application Developer')
    st.equal(lines[4], 'Description: A test application')
    st.equal(lines[5], 'Website: http://exist-db.org/test-app')
    st.ok(lines[6].startsWith('Version: '), lines[6])
    st.ok(lines[7].startsWith('Installed: '), lines[7])
    st.equal(lines[8], 'Processor: existdb >=4.0.0')
    st.equal(lines[9], 'Target: test-app')
    st.equal(lines[10], 'Type: application')
    st.equal(lines[11], 'License: WTF')
    st.equal(lines[12], 'Components: none')
  })

  t.test('shows extended output of test-lib', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'list', '--lib', '--extended', '--timesort'])

    if (stderr) { return t.fail(stderr) }
    const lines = stdout.split('\n')
    st.ok(lines[0].startsWith('test-lib'), lines[0])
    st.equal(lines[1], 'Title: Test Lib')
    st.equal(lines[2], 'Name: http://exist-db.org/apps/test-lib')
    st.equal(lines[3], 'Author: Application Developer')
    st.equal(lines[4], 'Description: A test library')
    st.equal(lines[5], 'Website: http://exist-db.org/test-lib')
    st.ok(lines[6].startsWith('Version: '), lines[6])
    st.ok(lines[7].startsWith('Installed: '), lines[7])
    st.equal(lines[8], 'Processor: existdb >=4.0.0')
    st.equal(lines[9], 'Type: library')
    st.equal(lines[10], 'License: WTF')
    st.equal(lines[11], 'Components:')
    st.equal(lines[12], '  xquery: http://exist-db.org/apps/test-lib')
  })

  t.test('sorts by installation date (reversed)', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'list', '--timesort', '--reverse'])

    if (stderr) { return t.fail(stderr) }
    const lines = stdout.split('\n')
    st.equal(lines[lines.length - 2], 'test-app', 'test-app is last')
  })

  t.test('update extra package', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'install', 'local', 'spec/fixtures/test-app.xar', '-f'], asAdmin)
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }

    st.equal(stdout, '✔︎ spec/fixtures/test-app.xar > installed test-app@1.0.1\n')
    st.end()
  })

  t.test('list has updated', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'list', '--date', 'iso'], asAdmin)
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }

    const lines = stdout.split('\n')
    const found = lines.filter(line => line.startsWith('test-app'))
    st.ok(found.length, found[0])
    const newInstallationDate = new Date(found[0].match(/\d+-.+$/)[0])
    st.ok(newInstallationDate.getTime() > firstInstallationDate.getTime(), 'installation date changed')
    st.end()
  })

  t.test('raw output includes commit info', async function (st) {
    const { stderr, stdout } = await run('xst', ['package', 'list', '--raw'], asAdmin)
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }
    const json = JSON.parse(stdout)
    const filtered = json.packages.filter(p => p.abbrev === 'test-app')
    st.equal(filtered.length, 1)
    const packageInfo = filtered.pop()
    st.ok(packageInfo.commit)
    st.equal(packageInfo.commit.id, 'e039b2e12f9882375701c7cfd58f5ee32fd7bbd4')
    st.equal(packageInfo.commit.time, '1674564361')
    st.end()
  })

  t.teardown(cleanup)
})

test('error', async function (t) {
  const { stderr, stdout } = await run('xst', ['pkg', 'ls', '-a', '-l'], asAdmin)
  if (stdout) {
    t.fail(stdout)
    t.end()
    return
  }
  t.equal(stderr, 'Arguments a and l are mutually exclusive\n')
  t.end()
})
