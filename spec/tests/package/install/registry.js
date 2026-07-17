import { readFile } from 'node:fs/promises'
import test from 'tape'
import { run, asAdmin, testHttpServer } from '../../../test.js'

const publicRepo = `${testHttpServer}/exist/apps/public-repo`

const testAppName = 'http://exist-db.org/apps/test-app'
const testLibName = 'http://exist-db.org/apps/test-lib'

async function removeTestApp (t) {
  const { stderr } = await run(
    'xst',
    ['run', `repo:undeploy("${testAppName}"),repo:remove("${testAppName}")`],
    asAdmin
  )
  if (stderr) {
    console.error(stderr)
  }
}

async function removeTestlib (t) {
  const { stderr } = await run(
    'xst',
    ['run', `repo:undeploy("${testLibName}"),repo:remove("${testLibName}")`],
    asAdmin
  )
  if (stderr) {
    console.error(stderr)
  }
}

async function cleanup (t) {
  await removeTestApp(t)
  await removeTestlib(t)
}

async function isLocalRepoAvailable () {
  try {
    const { status } = await fetch(publicRepo)
    return status === 200
  } catch (_) {
    // connection refused — no instance (or no public-repo) on this port
    return false
  }
}

/**
 * @param {test.Test} t
 *
 */
async function installPackageToLocalRepo (t) {
  for (const app of ['test-app.xar', 'test-lib.xar']) {
    const formData = new FormData()
    const file = await readFile(`spec/fixtures/${app}`)
    const blob = new Blob([file])
    formData.append('files[]', blob, app)
    formData.append('', '\\')

    const { status } = await fetch(
      `${publicRepo}/publish`,
      {
        method: 'post',
        headers: {
          Authorization: `Basic ${Buffer.from('repo:repo').toString('base64')}`
        },
        body: formData
      }
    )

    t.ok(status === 200, `The install of ${app} should have worked`)
  }
}

test('shows help', async function (t) {
  t.test('for registry command', async function (st) {
    const { stderr, stdout } = await run('xst', [
      'package',
      'install',
      'registry',
      'help'
    ])

    if (stderr) {
      st.fail(stderr)
      return
    }
    st.ok(stdout, 'got output')
    const firstLine = stdout.split('\n')[0]
    st.equal(
      firstLine,
      'xst package install from-registry <package> [<version>]',
      firstLine
    )
  })

  t.test('for from-registry command', async function (st) {
    const { stderr, stdout } = await run('xst', [
      'package',
      'install',
      'from-registry',
      'help'
    ])

    if (stderr) {
      st.fail(stderr)
      return
    }
    st.ok(stdout, 'got output')
    const firstLine = stdout.split('\n')[0]
    st.equal(
      firstLine,
      'xst package install from-registry <package> [<version>]',
      firstLine
    )
  })
})
test('Work with a local public registry', async function (t) {
  if (!(await isLocalRepoAvailable())) {
    t.skip()
    return
  }

  await installPackageToLocalRepo(t)

  t.test('rejects installs when user is not admin', async function (st) {
    const { stderr, stdout } = await run('xst', [
      'package',
      'install',
      'registry',
      '--registry',
      publicRepo,
      testAppName
    ])
    st.equal(
      stderr,
      'Package installation failed. User "guest" is not a DB administrator.\n',
      'Installations should have failed since guest is not dba'
    )

    st.notOk(stdout)
    st.end()
  })

  t.test(
    'installs new packages from a local public registry',
    async function (st) {
      const { stderr, stdout } = await run(
        'xst',
        [
          'package',
          'install',
          'registry',
          '--registry',
          publicRepo,
          testAppName
        ],
        asAdmin
      )
      st.notOk(stderr, 'There should have been no errors')

      const lines = stdout.split('\n')
      st.equal(
        lines[0],
        `✔︎ ${testAppName} > installed version 1.0.1 at /db/apps/test-app`,
        lines[0]
      )
      st.notOk(lines[1])
      st.end()
    }
  )

  t.test(
    'does not attempt to re-install the same package version from a local public registry, resolved by abbreviation',
    async function (st) {
      const { stderr, stdout } = await run(
        'xst',
        [
          'package',
          'install',
          'registry',
          '--registry',
          publicRepo,
          'test-app'
        ],
        asAdmin
      )

      console.log(stderr, stdout)
      const lines = stdout.split('\n')
      st.equal(
        lines[0],
        '- test-app > 1.0.1 is already installed',
        lines[0]
      )
      st.equal(stderr, 'If you wish to force installation use --force.\n', stderr)
      st.notOk(lines[1])
      st.end()
    }
  )

  t.test('installs new packages from the public registry (forced)', async function (st) {
    const { stderr, stdout } = await run(
      'xst',
      ['package', 'install', 'registry', 'http://exist-db.org/apps/eXide', '-f'],
      asAdmin
    )
    st.notOk(stderr, 'There should have been no errors')

    const lines = stdout.split('\n')
    // eXide is installed from the live public registry, so its version
    // changes over time
    st.match(
      lines[0],
      /^✔︎ http:\/\/exist-db\.org\/apps\/eXide > installed version \d+\.\d+\.\d+ at \/db\/apps\/eXide$/,
      lines[0]
    )
    st.notOk(lines[1])
    st.end()
  })

  t.test(
    'rejects installation when the package is already installed under the same version. depends on previous test',
    async function (st) {
      const { stderr, stdout } = await run(
        'xst',
        [
          'package',
          'install',
          'registry',
          '--registry',
          publicRepo,
          testAppName,
          '1.0.1'
        ],
        asAdmin
      )
      st.ok(stderr, 'The install should have failed, error is filled')

      st.equal(stdout, `- ${testAppName} > 1.0.1 is already installed\n`)
      st.equal(
        stderr,
        'If you wish to force installation use --force.\n',
        stderr
      )
      st.end()
    }
  )

  t.test('Allows reinstalls with force flag passed', async function (st) {
    const { stderr, stdout } = await run(
      'xst',
      [
        'package',
        'install',
        'registry',
        '--registry',
        publicRepo,
        testAppName,
        '1.0.1',
        '--force'
      ],
      asAdmin
    )
    st.notOk(stderr, 'The install should have succeeded')

    // TODO: why is this the URI?
    const lines = stdout.split('\n')
    st.equal(
      lines[0],
      '✔︎ http://exist-db.org/apps/test-app > installed version 1.0.1 at /db/apps/test-app',
      lines[0]
    )
    st.notOk(lines[1])

    st.end()
  })

  t.test(
    'rejects installation when the package is not available under the requested version',
    async function (st) {
      const { stderr, stdout } = await run(
        'xst',
        [
          'package',
          'install',
          'registry',
          '--registry',
          publicRepo,
          testAppName,
          '10.98.2'
        ],
        asAdmin
      )
      st.plan(3)
      st.ok(stderr, 'The install should have failed, error is filled')
      st.notOk(stdout, stdout)

      // @todo: maybe a better error here? Explain user what actually went wrong?
      st.equal(
        stderr,
        '✘ http://exist-db.org/apps/test-app > Package could not be found in the registry!\n'
      )
      st.end()
    }
  )

  t.test(
    'rejects installation when the registry is unreachable',
    async function (st) {
      const { stderr } = await run(
        'xst',
        [
          'package',
          'install',
          'registry',
          '--registry',
          `${testHttpServer}/doesnotexist/`,
          testAppName
        ],
        asAdmin
      )
      st.plan(2)
      st.ok(stderr, 'The install should have failed, error is filled')

      // @todo: maybe a better error here? Explain user what actually went wrong?
      st.equal(
        stderr,
        `✘ http://exist-db.org/apps/test-app > Server responded with a Servlet error. Probably a wrong path to the public-repo or public-repo not installed. Please check the URL ${testHttpServer}/doesnotexist/\n`,
        stderr
      )
      st.end()
    }
  )

  t.teardown(cleanup)
  t.end()
})
