import { test } from 'tape'
import { run, asAdmin, testServer } from '../test.js'

test("calling 'xst info'", async (t) => {
  const { stderr, stdout } = await run('xst', ['info'])
  if (stderr) { return t.fail(stderr) }

  const lines = stdout.split('\n')
  t.plan(4)
  t.equal(lines.length, 4, 'outputs four lines')
  t.ok(lines[0].startsWith('Build: '), 'has build info')
  t.ok(lines[1].startsWith('Java: '), 'has Java info')
  t.ok(lines[2].startsWith('OS: '), 'has OS info')
})

test("calling 'xst info --verbose'", async (t) => {
  const { stderr, stdout } = await run('xst', ['info', '--verbose'])
  t.plan(5)
  t.equal(stderr, `Connecting to ${testServer} as guest\n`, 'connection and user output on stderr')

  const lines = stdout.split('\n')
  t.equal(lines.length, 4, 'outputs four lines')
  t.ok(lines[0].startsWith('Build: '), 'has build info')
  t.ok(lines[1].startsWith('Java: '), 'has Java info')
  t.ok(lines[2].startsWith('OS: '), 'has OS info')
})

test("calling 'xst info --raw' returns valid JSON", async (t) => {
  try {
    const { stderr, stdout } = await run('xst', ['info', '--raw'], asAdmin)
    if (stderr) { return t.fail(stderr) }
    const { db, java, os } = JSON.parse(stdout)
    t.plan(11)
    t.ok(db, 'outputs build information')
    t.ok(db.name, 'outputs DB name')
    t.ok(db.version, 'outputs DB version')
    t.ok(db.git, 'outputs git hash')

    t.ok(java, 'outputs jvm information')
    t.ok(java.vendor, 'outputs java vendor')
    t.ok(java.version, 'outputs java version')

    t.ok(os, 'outputs operating system information')
    t.ok(os.name, 'outputs OS name')
    t.ok(os.version, 'outputs OS version')
    t.ok(os.arch, 'outputs CPU architecture')
  } catch (e) {
    t.fail(e, 'invalid JSON returned')
  }
})
