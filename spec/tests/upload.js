import { test } from 'tape'
import { run, asAdmin, testServer } from '../test.js'

const testCollection = '/db/upload-test'

async function removeRemoteCollection (t) {
  const { stderr } = await run('xst', ['rm', '-rf', testCollection], asAdmin)
  if (stderr) { return console.error(stderr) }
}

test('uploading files and folders', function (t) {
  t.test(`single file into non-existing collection ${testCollection}' as admin`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', 'spec/fixtures/test.xq', testCollection], asAdmin)
    st.equal(code, 1, 'exit code 1')
    st.notOk(stdout, stdout)
    st.equal(stderr, `Target ${testCollection} must be an existing collection.\n`, stderr)
    st.end()
  })

  t.test(`calling 'xst up modules spec/fixtures ${testCollection}' as admin`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', 'spec/fixtures', testCollection], asAdmin)
    st.equal(code, 0, 'exit code 0')
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }
    st.ok(stdout, stdout)
    st.end()
  })

  t.test(`single, new file to ${testCollection}' as guest`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', 'spec/test.js', testCollection])
    st.equal(code, 1, 'exit code 1')
    st.ok(/Upload of .+?spec\/test\.js failed\./.test(stderr), stderr)
    st.notOk(stdout, stdout)
    st.end()
  })

  t.test(`verbose: single, new file to ${testCollection}' as guest`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', '-v', 'spec/test.js', testCollection])
    st.equal(code, 1, 'exit code 1')
    const lines = stderr.split('\n')
    st.equal(lines[0], `Connecting to ${testServer} as guest`, lines[0])
    st.equal(lines[1], '✘ test.js Error: Write permission is not granted on the Collection.', lines[1])
    st.ok(/Upload of .+?spec\/test\.js failed\./.test(lines[2]), lines[2])
    st.ok(stdout, 'additional info is displayed')
    st.end()
  })

  t.test(`calling 'xst up modules/test.xq ${testCollection}' as admin`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', 'spec/fixtures/test.xq', testCollection], asAdmin)
    st.equal(code, 0, 'exit code 0')
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }
    st.ok(stdout, stdout)
    st.end()
  })

  t.test(`single, existing file to ${testCollection}' as guest`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', 'spec/fixtures/test.xq', testCollection])
    st.equal(code, 1, 'exit code 1')
    st.ok(/Upload of .+?spec\/fixtures\/test\.xq failed\./.test(stderr))
    st.notOk(stdout, stdout)
    st.end()
  })

  t.test(`verbose: single, existing file to ${testCollection}' as guest`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', '-v', 'spec/fixtures/test.xq', testCollection])
    st.equal(code, 1, 'exit code 1')
    const lines = stderr.split('\n')
    st.equal(lines[0], `Connecting to ${testServer} as guest`, lines[0])
    st.equal(lines[1], '✘ test.xq Error: A resource with the same name already exists in the target collection \'/db/upload-test\', and you do not have write access on that resource.')
    st.ok(/Upload of .+?spec\/fixtures\/test\.xq failed\./.test(lines[2]))
    st.ok(stdout, 'additional info is displayed')
    st.end()
  })

  t.test('upload dotfile', async (st) => {
    const { stderr, stdout } = await run('xst', ['up', '-D', 'spec/fixtures/.env', testCollection], asAdmin)
    if (stderr) {
      st.fail(stderr)
      st.end()
      return
    }
    st.ok(stdout, stdout)
    st.end()
  })

  t.test('error on upload with more than two positional arguments', async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', 'spec/fixtures/test-app.xar', 'spec/fixtures/test-lib.xar', testCollection], asAdmin)
    st.equal(code, 1, 'exit code 1')
    st.notOk(stdout, stdout)
    st.equal(stderr, 'Unknown command: /db/upload-test\n')
    st.end()
  })

  t.test(`calling 'xst up modules ${testCollection}' as guest`, async (st) => {
    const { stderr, stdout, code } = await run('xst', ['up', 'modules', testCollection])
    st.equal(code, 2, 'exit code 2')
    st.ok(stdout.startsWith('Created 0 collections and uploaded 0 resources in'), stdout)

    const lines = stderr.split('\n')
    const lineCount = lines.length
    for (let i = lineCount - 3; i >= 0; i--) {
      st.ok(/✘ [^ ]+ Error: Write permission is not granted on the Collection./.test(lines[i]), lines[i])
    }

    st.equal(lines[lineCount - 2], 'Upload finished with errors!', lines[lineCount - 2])
    st.end()
  })

  t.teardown(removeRemoteCollection)
})
