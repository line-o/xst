import { test } from 'tape'
import { run, asAdmin } from '../test.js'

const testCollection = '/db/rm-test'
const globCollection = '/db/rm-glob-test'

async function ensureCollectionIsRemoved (t) {
  const { stderr, stdout } = await run('xst', ['ls', testCollection])
  if (stdout) { return t.fail(stdout) }
  t.equal(stderr, `✘ ${testCollection} - ${testCollection} does not exist`)
}

async function prepare (t) {
  const query = [
    'xmldb:create-collection("/db", "rm-test")',
    `xmldb:create-collection("${testCollection}", "empty-subcollection")`,
    storeResourceQuery(testCollection, 'b', '"test"'),
    storeResourceQuery(testCollection, 'a.txt', '"test"'),
    storeResourceQuery(testCollection, 'a1.txt', '"test"'),
    storeResourceQuery(testCollection, 'a11.json', '\'{"a":1}\''),
    storeResourceQuery(testCollection, 'a20.txt', '"test"'),
    storeResourceQuery(testCollection, 'a22.xml', '<test />'),
    storeResourceQuery(testCollection, 'index.html', '<html><body>1</body></html>'),
    storeResourceQuery(testCollection, 'test.xq', '"1"')
  ].join(',')
  const { stderr } = await run('xst', ['run', query], asAdmin)
  if (stderr) { return t.fail(stderr) }
  t.end()
}

/**
 * fixture tree for pattern matching tests
 *
 * /db/rm-glob-test
 * ├── a.xml
 * ├── b.xml
 * ├── c.txt
 * ├── temp-1.txt
 * ├── data
 * │   ├── d.xml
 * │   ├── temp-2.txt
 * │   └── temp-sub (empty collection)
 * └── temp-keep
 *     └── keep.txt
 */
async function prepareGlobFixtures (t) {
  const query = [
    'xmldb:create-collection("/db", "rm-glob-test")',
    `xmldb:create-collection("${globCollection}", "data")`,
    `xmldb:create-collection("${globCollection}/data", "temp-sub")`,
    `xmldb:create-collection("${globCollection}", "temp-keep")`,
    storeResourceQuery(globCollection, 'a.xml', '<a />'),
    storeResourceQuery(globCollection, 'b.xml', '<b />'),
    storeResourceQuery(globCollection, 'c.txt', '"c"'),
    storeResourceQuery(globCollection, 'temp-1.txt', '"t1"'),
    storeResourceQuery(globCollection + '/data', 'd.xml', '<d />'),
    storeResourceQuery(globCollection + '/data', 'temp-2.txt', '"t2"'),
    storeResourceQuery(globCollection + '/temp-keep', 'keep.txt', '"keep"')
  ].join(',')
  const { stderr } = await run('xst', ['run', query], asAdmin)
  if (stderr) { t.fail(stderr) }
}

function storeResourceQuery (collection, fileName, content) {
  return `xmldb:store("${collection}", "${fileName}", ${content})`
}

test("calling 'xst rm --help'", async (t) => {
  const { stderr, stdout } = await run('xst', ['rm', '--help'])
  if (stderr) { return t.fail(stderr) }

  t.ok(stdout, stdout)
  t.ok(stdout.includes('--include'), 'shows include option')
  t.ok(stdout.includes('--exclude'), 'shows exclude option')
  t.ok(stdout.includes('--dry-run'), 'shows dry-run option')
  t.end()
})

test('relative paths are rejected with a hint', async (t) => {
  const { stderr, stdout, code } = await run('xst', ['rm', 'rm-test'], asAdmin)

  if (stdout) { return t.fail(stdout) }
  t.equal(code, 1, 'exit code 1')
  t.ok(stderr.includes('Invalid path "rm-test": database paths must be absolute. Did you mean "/db/rm-test"?'), stderr)
  t.end()
})

test('admin cannot remove protected paths', async (t) => {
  const protectedPaths = [
    '/',
    '/db/',
    '/db/apps',
    '/db/apps/',
    '/db/system',
    '/db/system/',
    '/db/system/config',
    '/db/system/repo',
    '/db/system/security',
    '/db/system/security/',
    '/db/system/security/exist',
    '/db/system/security/exist/accounts',
    '/db/system/security/exist/groups'
  ]

  protectedPaths.forEach(p => {
    t.test(`cannot remove protected path ${p}`, async (st) => {
      const { stderr, stdout } = await run('xst', ['rm', '-rf', p], asAdmin)

      if (stdout) { return st.fail(stdout) }
      // "/" is an alias for "/db", trailing slashes are stripped
      let path = p === '/' ? '/db' : p
      path = path !== '/' && path.endsWith('/') ? path.substring(0, path.length - 1) : path

      st.equal(stderr, `Cannot remove protected path: ${path}\n`, stderr)
      st.end()
    })
  })
})

// reliable tests using fixed set
test('with test collection', async (t) => {
  await prepare(t)

  t.test(`cannot remove ${testCollection} as guest`, async (st) => {
    const { stderr, stdout } = await run('xst', ['rm', '-rf', testCollection])

    if (stdout) { return st.fail(stdout) }
    st.equal(stderr, `✘ /db/rm-test - Account 'guest' is not allowed to remove collection '${testCollection}'. Cannot remove collection: Account 'guest' is not allowed to remove collection '${testCollection}'\n`, stderr)
    st.end()
  })

  t.test(`cannot remove ${testCollection} as admin without -r`, async (st) => {
    const { stderr, stdout } = await run('xst', ['rm', testCollection], asAdmin)

    if (stdout) { return st.fail(stdout) }
    st.equal(stderr, `✘ ${testCollection} - ${testCollection} is a collection, but the recursive option is not set\n`, stderr)
    st.end()
  })

  t.test(`can remove ${testCollection}/empty-subcollection as admin without -f`, async (st) => {
    const { stderr, stdout } = await run('xst', ['rm', '-r', testCollection + '/empty-subcollection'], asAdmin)

    if (stderr) { return st.fail(stderr) }
    st.equal(stdout, `✔︎ ${testCollection}/empty-subcollection\n`, 'empty subcollection was removed')
    st.end()
  })

  t.test('cannot remove non-empty collection as admin without -f', async (st) => {
    const { stderr, stdout } = await run('xst', ['rm', '-r', testCollection], asAdmin)

    if (stdout) { return st.fail(stdout) }
    st.equal(stderr, `✘ ${testCollection} - ${testCollection} is a non-empty collection, but the force option is not set\n`, stderr)
    st.end()
  })

  t.test('can remove several resources', async (st) => {
    const { stderr, stdout } = await run('xst', ['rm', testCollection + '/a.txt', testCollection + '/a1.txt'], asAdmin)

    if (stderr) { return st.fail(stderr) }
    const lines = stdout.split('\n')
    st.equal(lines.length, 3, 'expected number of results')
    st.equal(lines[0], `✔︎ ${testCollection}/a.txt`, 'first file was removed')
    st.equal(lines[1], `✔︎ ${testCollection}/a1.txt`, 'second file was removed')
    st.end()
  })

  t.test('admin can remove entire collection with -rf', async (st) => {
    const { stderr, stdout } = await run('xst', ['rm', '-rf', testCollection], asAdmin)

    if (stderr) { return st.fail(stderr) }
    const lines = stdout.split('\n')
    st.equal(lines.length, 2, 'expected number of results')
    st.equal(lines[0], `✔︎ ${testCollection}`, 'test collection was removed')
    st.end()
  })

  t.teardown(ensureCollectionIsRemoved)
})

test('with glob patterns', async (t) => {
  t.test('--include "*.xml" removes only matching resources at the top level', async (st) => {
    await prepareGlobFixtures(st)
    const { stderr, stdout, code } = await run('xst', ['rm', globCollection, '--include', '*.xml'], asAdmin)

    if (stderr) { return st.fail(stderr) }
    st.equal(code, 0, 'exit code 0')
    st.equal(stdout,
      `✔︎ ${globCollection}/a.xml\n` +
      `✔︎ ${globCollection}/b.xml\n`,
      'removed only top-level xml resources')

    const { stdout: lsRoot } = await run('xst', ['ls', globCollection], asAdmin)
    st.notOk(lsRoot.includes('a.xml'), 'a.xml is gone')
    st.notOk(lsRoot.includes('b.xml'), 'b.xml is gone')
    st.ok(lsRoot.includes('c.txt'), 'c.txt was kept')
    st.ok(lsRoot.includes('data'), 'data collection was kept')
    const { stdout: lsData } = await run('xst', ['ls', globCollection + '/data'], asAdmin)
    st.ok(lsData.includes('d.xml'), 'd.xml below the top level was not touched')
    st.end()
  })

  t.test('--recursive --include "temp-*" removes matches at depth, deepest first', async (st) => {
    await prepareGlobFixtures(st)
    const { stderr, stdout, code } = await run('xst', ['rm', '--recursive', '--include', 'temp-*', globCollection], asAdmin)

    if (stderr) { return st.fail(stderr) }
    st.equal(code, 0, 'exit code 0')
    st.equal(stdout,
      `✔︎ ${globCollection}/data/temp-2.txt\n` +
      `✔︎ ${globCollection}/data/temp-sub\n` +
      `✔︎ ${globCollection}/temp-1.txt\n` +
      `- ${globCollection}/temp-keep - is a non-empty collection, but the force option is not set\n`,
      'deepest matches first, non-empty collection skipped')

    const { stdout: lsKeep } = await run('xst', ['ls', globCollection + '/temp-keep'], asAdmin)
    st.ok(lsKeep.includes('keep.txt'), 'contents of the skipped collection were not touched')
    st.end()
  })

  t.test('--exclude wins over --include', async (st) => {
    await prepareGlobFixtures(st)
    const { stderr, stdout, code } = await run('xst', ['rm', globCollection, '--include', '*.txt', '--exclude', 'temp-*'], asAdmin)

    if (stderr) { return st.fail(stderr) }
    st.equal(code, 0, 'exit code 0')
    st.equal(stdout, `✔︎ ${globCollection}/c.txt\n`, 'only the non-excluded resource was removed')

    const { stdout: lsRoot } = await run('xst', ['ls', globCollection], asAdmin)
    st.ok(lsRoot.includes('temp-1.txt'), 'excluded resource was kept')
    st.end()
  })

  t.test('--exclude on its own implies --include "*"', async (st) => {
    await prepareGlobFixtures(st)
    const { stderr, stdout, code } = await run('xst', ['rm', '--dry-run', globCollection, '--exclude', '*.xml'], asAdmin)

    if (stderr) { return st.fail(stderr) }
    st.equal(code, 0, 'exit code 0')
    st.equal(stdout,
      `would remove: ${globCollection}/c.txt\n` +
      `- ${globCollection}/data - is a collection, but the recursive option is not set\n` +
      `would remove: ${globCollection}/temp-1.txt\n` +
      `- ${globCollection}/temp-keep - is a collection, but the recursive option is not set\n`,
      'everything but the excluded resources would be removed')
    st.end()
  })

  t.test('--dry-run lists would-be deletions without removing anything', async (st) => {
    await prepareGlobFixtures(st)
    const { stderr, stdout, code } = await run('xst', ['rm', '--dry-run', '--recursive', '--include', 'temp-*', globCollection], asAdmin)

    if (stderr) { return st.fail(stderr) }
    st.equal(code, 0, 'exit code 0')
    st.equal(stdout,
      `would remove: ${globCollection}/data/temp-2.txt\n` +
      `would remove: ${globCollection}/data/temp-sub\n` +
      `would remove: ${globCollection}/temp-1.txt\n` +
      `- ${globCollection}/temp-keep - is a non-empty collection, but the force option is not set\n`,
      'identical traversal to a real run')

    const { stdout: lsRoot } = await run('xst', ['ls', globCollection], asAdmin)
    st.ok(lsRoot.includes('temp-1.txt'), 'nothing was removed at the top level')
    const { stdout: lsData } = await run('xst', ['ls', globCollection + '/data'], asAdmin)
    st.ok(lsData.includes('temp-2.txt'), 'nothing was removed at depth')
    st.ok(lsData.includes('temp-sub'), 'no collection was removed')
    st.end()
  })

  t.test('pattern matching a protected path is skipped with an error line', async (st) => {
    const { stderr, stdout, code } = await run('xst', ['rm', '/db', '--include', 'apps'], asAdmin)

    if (stdout) { return st.fail(stdout) }
    st.equal(code, 0, 'exit code 0')
    st.equal(stderr, '✘ /db/apps - /db/apps is a protected path\n', stderr)

    const { stderr: lsErr } = await run('xst', ['ls', '/db/apps'], asAdmin)
    st.notOk(lsErr, '/db/apps is still available')
    st.end()
  })

  t.test('pattern with "**" is rejected', async (st) => {
    const { stderr, stdout, code } = await run('xst', ['rm', globCollection, '--include', '**/*.xml'], asAdmin)

    if (stdout) { return st.fail(stdout) }
    st.equal(code, 1, 'exit code 1')
    st.equal(stderr, 'Invalid pattern "**/*.xml"; "**" is not supported yet\n', stderr)
    st.end()
  })

  t.test('nothing matched exits with code 9', async (st) => {
    await prepareGlobFixtures(st)
    const { stderr, stdout, code } = await run('xst', ['rm', globCollection, '--include', 'no-such-thing-*'], asAdmin)

    if (stdout) { return st.fail(stdout) }
    st.equal(code, 9, 'exit code 9')
    st.equal(stderr, 'Nothing matched\n', stderr)
    st.end()
  })

  t.teardown(async () => {
    await run('xst', ['rm', '-rf', globCollection], asAdmin)
  })
})
