import { test } from 'tape'
import yargs from 'yargs'
import * as exec from '../../commands/exec.js'
import { readConnection } from '../../utility/connection.js'
import { runPipe } from '../test.js'

// Mirror cli.js: resolve connection options from the environment so in-process
// handlers connect to the same instance as spawned ones (the isolated server
// under XST_TEST_SERVER, or the CI default otherwise). Without this the handler
// falls back to node-exist's hardcoded default and, under isolation, floods an
// uncaught ECONNREFUSED that crashes the suite.
// A yargs instance must not be reused across parses: on a reused instance a
// boolean option next to the positional (e.g. `execute --stats 1+1`) silently
// drops the positional, so each parse gets a fresh parser.
const parser = () => yargs().scriptName('xst').command(exec).middleware(readConnection).help().fail(false)

const execCmd = async (cmd, args) => {
  return await yargs()
    .scriptName('xst')
    .command(cmd)
    .fail(false)
    .parse(args)
}

test('shows help', async function (t) {
  // Run the command module with --help as argument
  const output = await new Promise((resolve, reject) => {
    parser().parse(['execute', '--help'], (err, argv, output) => {
      if (err) { return reject(err) }
      resolve(output)
    })
  })
  const firstLine = output.split('\n')[0]

  t.equal(firstLine, 'xst execute [<query>] [options]', firstLine)
})

test('executes command', async function (t) {
  const argv = await new Promise((resolve, reject) => {
    parser().parse(['execute', '1+1'], (err, argv, output) => {
      if (err) { return reject(err) }
      resolve(argv)
    })
  })

  t.equal(argv.query, '1+1')
})

test('executes command with alias \'exec\'', async function (t) {
  const argv = await new Promise((resolve, reject) => {
    parser().parse(['exec', '1+1'], (err, argv, output) => {
      if (err) { return reject(err) }
      resolve(argv)
    })
  })

  t.equal(argv.query, '1+1')
})

test('executes command with alias \'run\'', async function (t) {
  const argv = await new Promise((resolve, reject) => {
    parser().parse(['run', '1+1'], (err, argv, output) => {
      if (err) { return reject(err) }
      resolve(argv)
    })
  })

  t.equal(argv.query, '1+1')
})

test('executes bound command', async function (t) {
  const argv = await new Promise((resolve, reject) => {
    parser().parse(['exec', '-b', '{"a":1}', '$a+$a'], (err, argv, output) => {
      if (err) { return reject(err) }
      resolve(argv)
    })
  })
  t.plan(2)
  t.equal(argv.query, '$a+$a')
  t.equal(argv.bind.a, 1)
})

test('bind parse error', async function (t) {
  try {
    const res = await execCmd(exec, ['exec', '-b', '{a:1}', '$a+$a'])
    t.notOk(res)
  } catch (e) {
    t.ok(e, e)
  }
})

test('read bind from stdin', async function (t) {
  const { stdout, stderr } = await runPipe('echo', ['{"a":1}'], 'xst', ['exec', '-b', '-', '$a+$a'])
  if (stderr) { return t.fail(stderr) }
  t.equals('2\n', stdout)
})

test('cannot read bind from stdin', async function (t) {
  try {
    const res = await execCmd(exec, ['exec', '-b', '-', '$a+$a'])
    t.fail(res)
  } catch (e) {
    t.ok(e, e)
  }
})

test('cannot read query file from stdin', async function (t) {
  try {
    const res = await execCmd(exec, ['exec', '-f', '-'])
    t.fail(res)
  } catch (e) {
    t.ok(e, e)
  }
})

test('read query file', async function (t) {
  try {
    const argv = await new Promise((resolve, reject) => {
      parser().parse(['exec', '-f', './spec/fixtures/test.xq'], (err, argv, output) => {
        if (err) { return reject(err) }
        resolve(argv)
      })
    })
    t.equals(argv.f, 'spec/fixtures/test.xq', 'should be normalized')
  } catch (e) {
    t.notOk(e, e)
  }
})

test('read query file with query', async function (t) {
  try {
    const argv = await parser().parse(['exec', '-f', 'spec/fixtures/test.xq', '1+1'])
    t.fail(argv, 'Should not return a result')
  } catch (e) {
    t.ok(e, e)
  }
})

test('read file from stdin', async function (t) {
  const { stdout, stderr } = await runPipe('echo', ['./spec/fixtures/test.xq'], 'xst', ['exec', '-f', '-'])
  if (stderr) { return t.fail(stderr) }
  t.equals('2\n', stdout)
})

test('read query from stdin', async function (t) {
  const { stdout, stderr } = await runPipe('echo', ['1+1'], 'xst', ['exec', '-'])
  if (stderr) { return t.fail(stderr) }
  t.equals('2\n', stdout)
})
