import { test } from 'tape'
import { run, asAdmin } from '../test.js'
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const testCollectionName = 'get-test'
const testCollection = '/db/' + testCollectionName

async function removeLocalDownload () {
  const { stderrRmLocal } = await run('rm', ['-rf', testCollectionName])
  if (stderrRmLocal) {
    return console.error(stderrRmLocal)
  }
}

async function removeRemoteCollection (t) {
  const { stderrRmRemote } = await run('xst', ['rm', '-rf', testCollection])
  if (stderrRmRemote) {
    return console.error(stderrRmRemote)
  }
}

async function tearDown (t) {
  await removeLocalDownload()
  await removeRemoteCollection()
}

const expectedDirectoryListing = [
  'a.txt',
  'a1.txt',
  'a11.json',
  'a20.txt',
  'a22.xml',
  'b',
  'empty-subcollection',
  'index.html',
  'subcollection',
  'test.xq',
  'xincludes.xml'
]

async function prepare (t) {
  t.plan(1)
  const query = [
    `xmldb:create-collection("/db", "${testCollectionName}")`,
    `xmldb:create-collection("${testCollection}", "empty-subcollection")`,
    `xmldb:create-collection("${testCollection}", "subcollection")`,
    `sm:chmod(xs:anyURI("${testCollection}/subcollection"), "rwxrwx---")`,
    storeResourceQuery(testCollection + '/subcollection', 'b', '"test"'),
    storeResourceQuery(testCollection, 'b', '"test"'),
    storeResourceQuery(testCollection, 'a.txt', '"test"'),
    storeResourceQuery(testCollection, 'a1.txt', '"test"'),
    storeResourceQuery(testCollection, 'a11.json', '\'{"a":1}\''),
    storeResourceQuery(testCollection, 'a20.txt', '"test"'),
    storeResourceQuery(testCollection, 'a22.xml', '<test />'),
    storeResourceQuery(testCollection, 'index.html', '<html><body>1</body></html>'),
    storeResourceQuery(testCollection, 'test.xq', '"1"'),
    storeResourceQuery(
      testCollection,
      'xincludes.xml',
      `<xml xmlns:xi="http://www.w3.org/2001/XInclude">
  <xi:include href="./a22.xml"><xi:fallback><p>I am an x include</p></xi:fallback></xi:include>
</xml>`
    )
  ].join(',')
  const { stderr, stdout } = await run('xst', ['run', query], asAdmin)
  if (stderr) {
    return t.fail(stderr)
  }
  t.true(stdout)
}

function storeResourceQuery (collection, fileName, content) {
  return `xmldb:store("${collection}", "${fileName}", ${content})`
}

test("calling 'xst get --help'", async (t) => {
  const { stderr, stdout } = await run('xst', ['get', '--help'])
  if (stderr) {
    return t.fail(stderr)
  }

  t.ok(stdout, stdout)
  t.end()
})

// reliable tests using fixed set
test('with test collection', async (t) => {
  t.test(prepare)

  t.test(`can get ${testCollection} as admin`, async (st) => {
    const { stderr, stdout } = await run('xst', ['get', testCollection, '.'], asAdmin)
    if (stderr) {
      return st.fail(stderr)
    }
    st.plan(3)

    st.notOk(stdout, 'no output')
    st.deepEqual(readdirSync(testCollectionName), expectedDirectoryListing, 'all files were downloaded')
    st.deepEqual(readdirSync(testCollectionName + '/subcollection'), ['b'], 'subcollection contents were downloaded')

    await removeLocalDownload()
  })

  t.test(`can get ${testCollection} as admin without expanding xincludes`, async (st) => {
    const { stderr, stdout } = await run('xst', ['get', testCollection, '.', '--expand-xincludes=no'], asAdmin)
    if (stderr) {
      return st.fail(stderr)
    }
    st.plan(4)

    st.notOk(stdout, 'no output')
    st.deepEqual(readdirSync(testCollectionName), expectedDirectoryListing, 'all files were downloaded')
    st.deepEqual(readdirSync(testCollectionName + '/subcollection'), ['b'], 'subcollection contents were downloaded')

    const contents = await readFile(path.join(testCollectionName, 'xincludes.xml'), 'utf-8')
    st.strictEqual(
      contents,
      '<xml xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="./a22.xml"><xi:fallback><p>I am an x include</p></xi:fallback></xi:include></xml>'
    )

    await removeLocalDownload()
  })

  t.test(`can get ${testCollection} as admin with expanding xincludes`, async (st) => {
    const { stderr, stdout } = await run('xst', ['get', testCollection, '.', '--expand-xincludes', 'yes'], asAdmin)
    if (stderr) {
      return st.fail(stderr)
    }
    st.plan(4)

    st.notOk(stdout, 'no output')
    st.deepEqual(readdirSync(testCollectionName), expectedDirectoryListing, 'all files were downloaded')
    st.deepEqual(readdirSync(testCollectionName + '/subcollection'), ['b'], 'subcollection contents were downloaded')

    const contents = await readFile(path.join(testCollectionName, 'xincludes.xml'), 'utf-8')
    st.strictEqual(contents, '<xml xmlns:xi="http://www.w3.org/2001/XInclude"><test/></xml>')

    await removeLocalDownload()
  })

  t.test(`can get ${testCollection} as admin with just one thread`, async (st) => {
    const { stderr, stdout } = await run('xst', ['get', testCollection, '.', '--threads', '1'], asAdmin)
    if (stderr) {
      return st.fail(stderr)
    }
    st.plan(3)

    st.notOk(stdout, 'no output')
    st.deepEqual(readdirSync(testCollectionName), expectedDirectoryListing, 'all files were downloaded')
    st.deepEqual(readdirSync(testCollectionName + '/subcollection'), ['b'], 'subcollection contents were downloaded')

    await removeLocalDownload()
  })

  t.test(`cannot get ${testCollection} as guest`, async (st) => {
    const { stderr, stdout } = await run('xst', ['get', testCollection, '.'])
    if (stdout) {
      await removeLocalDownload()
      return st.ok(stderr)
    }

    st.notOk(stdout, 'was downloaded')

    await removeLocalDownload()

    st.end()
  })

  t.test(`'xst get --verbose ${testCollection}' as admin`, async (st) => {
    const { stderr, stdout } = await run('xst', ['get', '--verbose', testCollection, '.'], asAdmin)
    st.plan(9)
    const verboseLines = stderr.split('\n')
    st.equal(verboseLines[0], 'Connecting to https://localhost:8443 as admin', verboseLines[0])
    st.ok(verboseLines[1].startsWith('Downloading /db/get-test to'), verboseLines[1])
    st.equal(verboseLines[2], 'Downloading up to 4 resources at a time', verboseLines[2])
    st.equal(verboseLines[3], '', verboseLines[3])
    st.equal(verboseLines.length, 4, 'all expected lines in verbose output')

    const lines = stdout.split('\n')

    // files are not downloaded in reproducible order
    st.equal(
      lines.filter((l) => /^✔︎ created directory [/.\w-]+\/get-test/.exec(l)).length,
      3,
      'notify 3 directories created'
    )
    st.equal(
      lines.filter((l) => /^✔︎ downloaded resource [/.\w-]+\/get-test/.exec(l)).length,
      10,
      'notify 10 resources downloaded'
    )

    st.deepEqual(readdirSync(testCollectionName), expectedDirectoryListing, 'all files were downloaded')
    st.deepEqual(readdirSync(testCollectionName + '/subcollection'), ['b'], 'subcollection contents were downloaded')

    await removeLocalDownload()
  })

  const additionalTestDirectory = 'test'

  t.test(`'xst get ${testCollection}/empty-subcollection ${additionalTestDirectory}' as admin`, async (st) => {
    await run('mkdir', [additionalTestDirectory])
    const { stderr, stdout } = await run(
      'xst',
      ['get', testCollection + '/empty-subcollection', additionalTestDirectory],
      asAdmin
    )
    if (stderr) {
      st.fail(stderr)
      return st.end()
    }
    st.plan(2)
    st.notOk(stdout, 'no output')

    st.deepEqual(
      readdirSync(additionalTestDirectory),
      ['empty-subcollection'],
      `empty subcollection was created in ${additionalTestDirectory} folder`
    )
    await run('rm', ['-rf', additionalTestDirectory])
  })

  const globTestDirectory = 'glob-test'
  t.test('Downloading only txt files matching glob but exclude a1.txt', async (st) => {
    await run('mkdir', [globTestDirectory])
    const { stderr, stdout } = await run(
      'xst',
      ['get', testCollection, globTestDirectory, '--include', '*.txt', '--exclude', 'a1.txt'],
      asAdmin
    )
    if (stderr) {
      st.fail(stderr)
      return st.end()
    }
    st.plan(2)

    st.notOk(stdout, 'no output')
    st.deepEqual(
      readdirSync(`${globTestDirectory}/${testCollectionName}`),
      ['a.txt', 'a20.txt', 'empty-subcollection', 'subcollection'],
      'only .txt files (except a1.txt) were downloaded'
    )
    await run('rm', ['-rf', globTestDirectory])
    st.end()
  })

  t.teardown(tearDown)
})
