import { getXmlRpcClient } from '@existdb/node-exist'
import { readFileSync } from 'node:fs'
import { readXquery } from '../utility/xq.js'

/**
 * the timing harness executed on the DB when the stats option is set
 */
const statsQuery = readXquery('exec-stats.xq')

/**
 * parse bindings
 * '-' will read bindings from standard input
 * @param {'-'|JSON} raw JSON string or '-'
 * @returns {object} parsed variable bindings
 */
function parseBindings (raw) {
  try {
    const readFromStdIn = raw === '-'
    const stringified = readFromStdIn ? readFileSync(process.stdin.fd) : raw
    if (stringified) {
      return JSON.parse(stringified)
    }
    return {}
  } catch (e) {
    if (e.code === 'EAGAIN') {
      throw Error('Could not read bind from standard input!')
    }
    throw Error('Error parsing argument bind! Reason: ' + e.message)
  }
}

/**
 * get query from file or passed string
 *
 * @param {string} file path to query file
 * @param {string} query query string
 * @returns {string|Buffer}
 */
function getQuery (file, query) {
  const hasQueryFile = file && file !== ''
  const hasQueryString = query && query !== ''

  if (!hasQueryFile && !hasQueryString) {
    throw Error('No query given, nothing to do!')
  }

  if (hasQueryFile && hasQueryString) {
    throw Error('Cannot use both query string and query file')
  }

  // read query from standard input
  if (query === true) {
    return readFileSync(process.stdin.fd, 'utf-8')
  }

  if (hasQueryString) {
    return query
  }

  // read query file content
  let path = file

  // from standard input
  if (file === '-') {
    path = readFileSync(process.stdin.fd, 'utf-8').trim()
  }

  return readFileSync(path, 'utf-8')
}

/**
 * query db, output to standard out
 *
 * @param {NodeExist.BoundModules} db bound NodeExist modules
 * @param {string|Buffer} query the query to execute
 * @param {object} variables the bound variables
 * @returns {Promise<Number>} exit code
 */
async function execute (db, query, variables) {
  const result = await db.queries.readAll(query, { variables })
  console.log(result.pages.toString())
  return 0
}

/**
 * query db wrapped in a timing harness,
 * output result to standard out and timings to standard error
 *
 * The harness returns the measured times as its first result item;
 * all following items are the results of the wrapped query and reach
 * standard out through the exact same code path as without stats.
 *
 * @param {NodeExist.BoundModules} db bound NodeExist modules
 * @param {string|Buffer} query the query to execute
 * @param {object} [variables] the bound variables
 * @returns {Promise<Number>} exit code
 */
async function executeWithStats (db, query, variables = {}) {
  if (Object.hasOwn(variables, 'query')) {
    throw Error('Cannot bind variable "query" when the stats option is set')
  }
  const result = await db.queries.readAll(statsQuery, {
    variables: { ...variables, query: query.toString() }
  })
  const [stats, ...pages] = result.pages
  const { compilation, execution } = JSON.parse(stats.toString())
  console.log(pages.toString())
  console.error(`compilation: ${compilation}ms`)
  console.error(`execution:   ${execution}ms`)
  return 0
}

export const command = ['execute [<query>] [options]', 'run', 'exec']
export const describe = 'Execute a query string or file'

export async function builder (yargs) {
  yargs
    .option('f', {
      alias: 'file',
      type: 'string',
      describe: 'Read query File (pass - to read from standard input)'
    })
    .option('b', {
      alias: 'bind',
      type: 'string',
      describe: 'Bind variables (either as JSON string or - to read from standard input)',
      defaultDescription: '{}',
      coerce: parseBindings,
      default: () => {}
    })
    .option('s', {
      alias: 'stats',
      type: 'boolean',
      default: false,
      describe: 'Print compilation and execution time of the query to standard error'
    })
    .option('h', { alias: 'help', type: 'boolean' })
    .nargs({ f: 1, b: 1 })
    .conflicts('f', 'query')
    .normalize('f')
}

export async function handler (argv) {
  if (argv.help) {
    return 0
  }
  const { file, bind, query, stats } = argv
  const _query = getQuery(file, query)
  const db = getXmlRpcClient(argv.connectionOptions)

  if (stats) {
    return await executeWithStats(db, _query, bind)
  }
  return await execute(db, _query, bind)
}
