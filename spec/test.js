import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * @typedef {Promise<{stderr?: string, stdout?: string, code: number}>} CommandResult
 */

// ---------------------------------------------------------------------------
// Test target resolution
//
// The suite always tests the CLI of THIS checkout by spawning
// `node <checkout>/cli.js` — never a globally installed or npm-linked xst.
// This makes `npm test` safe in git worktrees: each worktree tests its own
// code. Set XST_TEST_BIN to test a packaged binary instead (e.g. ./xst-linux).
// ---------------------------------------------------------------------------
const cliPath = fileURLToPath(new URL('../cli.js', import.meta.url))
const testBin = process.env.XST_TEST_BIN

function resolveXst (cmd, args = []) {
  if (cmd !== 'xst') { return [cmd, args] }
  if (testBin) { return [testBin, args] }
  return [process.execPath, [cliPath, ...args]]
}

// ---------------------------------------------------------------------------
// Test server resolution
//
// Defaults match CI: an eXist-db instance with its HTTPS/HTTP ports published
// on localhost:8443/8080. To run the suite against an isolated instance (e.g.
// per-worktree containers on other ports) set
//
//   XST_TEST_SERVER=https://localhost:11291 \
//   XST_TEST_HTTP_SERVER=http://localhost:10291 npm test
//
// When XST_TEST_SERVER is set it is injected as EXISTDB_SERVER into every
// spawned process; suites that specifically test connection *defaults*
// (spec/tests/configuration.js) skip themselves in that case.
// ---------------------------------------------------------------------------
export const isIsolated = Boolean(process.env.XST_TEST_SERVER)
export const testServer = process.env.XST_TEST_SERVER || 'https://localhost:8443'
export const testHttpServer = process.env.XST_TEST_HTTP_SERVER || 'http://localhost:8080'
const serverEnv = isIsolated ? { EXISTDB_SERVER: testServer } : {}

// Some suites (spec/tests/exec.js) run command handlers in-process via the
// yargs parser instead of spawning the CLI; those read process.env directly.
// Inject the override into this process too, so in-process tests hit the
// same isolated instance as spawned ones.
if (isIsolated) {
  process.env.EXISTDB_SERVER = testServer
}

/**
 * Run an shell command
 *
 * @param   {string}   cmd     - The command
 * @param   {string[]} args    - The arguments
 * @param   {Record<string, unknown>} [options] - Any options to the command, like environment variables
 * @returns {CommandResult} The result of running the command
 */
export async function run (cmd, args, options = cleanEnv) {
  const [command, commandArgs] = resolveXst(cmd, args)
  return new Promise((resolve, reject) => {
    let stderr
    let stdout
    const proc = spawn(command, commandArgs, options)
    proc.stdout.on('data', (data) => {
      stdout ? (stdout += data.toString()) : (stdout = data.toString())
    })

    proc.stderr.on('data', (data) => {
      stderr ? (stderr += data.toString()) : (stderr = data.toString())
    })
    proc.on('error', (error) => {
      reject(error)
    })
    proc.on('close', (code) => {
      resolve({ stderr, stdout, code })
    })
  })
}

/**
 * run two shell commands piped together
 * [options.env] cmd1 <args1> | cmd2 <args2>

 * @param {string}   cmd1    the first command
 * @param {string[]} args1   arguments for the first command
 * @param {string}   cmd2    the command run after the pipe
 * @param {string[]} args2   arguments for the second command
 * @param   {Record<string, unknown>} [options] - Any options to the command, like environment variables
 * @returns {CommandResult} The result of the pipe
 */
export async function runPipe (cmd1, args1, cmd2, args2, options = cleanEnv) {
  const [command1, commandArgs1] = resolveXst(cmd1, args1)
  const [command2, commandArgs2] = resolveXst(cmd2, args2)
  return new Promise((resolve, reject) => {
    let stderr
    let stdout
    const proc1 = spawn(command1, commandArgs1, options)
    const proc2 = spawn(command2, commandArgs2, options)
    proc1.stdout.pipe(proc2.stdin)

    proc2.stdout.on('data', (data) => {
      stdout ? (stdout += data.toString()) : (stdout = data.toString())
    })

    proc2.stderr.on('data', (data) => {
      stderr ? (stderr += data.toString()) : (stderr = data.toString())
    })
    proc2.on('close', (_) => resolve({ stderr, stdout }))
    proc1.on('error', (error) => reject(error))
    proc2.on('error', (error) => reject(error))
  })
}

// guard test execution against environment variables in development setups
const { EXISTDB_PASS, EXISTDB_USER, EXISTDB_SERVER, ...filteredEnv } = process.env
export const cleanEnv = {
  env: { ...filteredEnv, ...serverEnv }
}
export const asGuest = {
  env: { ...filteredEnv, ...serverEnv, EXISTDB_USER: 'guest', EXISTDB_PASS: 'guest' }
}
export const asAdmin = {
  env: { ...filteredEnv, ...serverEnv, EXISTDB_USER: 'admin', EXISTDB_PASS: '' }
}
export function forceColorLevel (level) {
  return { env: { ...filteredEnv, ...serverEnv, FORCE_COLOR: level } }
}
