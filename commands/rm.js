import chalk from 'chalk'
import { getXmlRpcClient } from '@existdb/node-exist'
import { readXquery } from '../utility/xq.js'
import { stringList } from '../utility/options.js'
import { toRegExpPattern } from '../utility/glob.js'
import { assertAbsoluteDbPath, normalizeDbPath } from '../utility/db-path.js'

/**
 * @typedef { import("@existdb/node-exist").NodeExist } NodeExist
 */

/**
 * @typedef {Object} RemoveOptions
 * @prop {Boolean} recursive descend down the collection tree
 * @prop {Boolean} force remove non-empty collections
 * @prop {Boolean} dryRun only list what would be removed
 * @prop {Boolean} usePatterns paths are search roots, matching children are removed
 * @prop {String[]} includePatterns regular expressions matched against child names
 * @prop {String[]} excludePatterns regular expressions that win over includePatterns
 * @prop {Boolean} [debug] output raw query results
 */

/**
 * the xquery file to execute on the DB
 */
const query = readXquery('rm.xq')

const protectedPaths = [
  '/',
  '/db',
  '/db/apps',
  '/db/system',
  '/db/system/config',
  '/db/system/repo',
  '/db/system/security',
  '/db/system/security/exist',
  '/db/system/security/exist/accounts',
  '/db/system/security/exist/groups'
]

function guardProtectedPaths (paths) {
  let foundProtectedPaths = false
  paths.forEach(path => {
    if (protectedPaths.includes(path)) {
      console.error(`Cannot remove protected path: ${path}`)
      foundProtectedPaths = true
    }
  })
  return foundProtectedPaths
}

/**
 * remove collections and resources in exist db
 * @param {NodeExist} db database client
 * @param {String[]} paths paths to collections and resources in db
 * @param {RemoveOptions} options command line options
 * @returns {void}
 */
async function rm (db, paths, options) {
  const { recursive, force, dryRun, usePatterns, includePatterns, excludePatterns } = options
  const result = await db.queries.readAll(query, {
    variables: {
      paths,
      'include-patterns': includePatterns,
      'exclude-patterns': excludePatterns,
      'dry-run': dryRun,
      'protected-paths': protectedPaths,
      recursive,
      force
    }
  })
  const json = JSON.parse(result.pages.toString())
  if (json.error) {
    if (options.debug) {
      console.error(json.error)
    }
    throw Error(json.error.description)
  }
  if (options.debug) {
    console.log(json)
  }

  if (usePatterns && json.list.length === 0) {
    console.error(chalk.yellow('Nothing matched'))
    process.exit(9)
  }

  json.list.forEach(item => {
    const { success, path, skipped, reason } = item
    if (skipped) {
      console.log('- ' + path + ' - ' + reason)
      return
    }
    if (success) {
      console.log((json.dryRun ? 'would remove: ' : '✔︎ ') + path)
      return
    }
    console.error('✘ ' + path + ' - ' + item.error.description)
  })
}

export const command = ['remove [options] <paths..>', 'rm', 'delete', 'del']
export const describe = 'Remove collections or resources'

const options = {
  i: {
    alias: 'include',
    describe:
      'Remove only children of the given collections whose name matches one or more of the patterns (comma separated). Without patterns, paths are removed as given.',
    ...stringList
  },
  e: {
    alias: 'exclude',
    describe:
      'Keep children whose name matches one or more of the patterns (comma separated). Excludes win over includes.',
    ...stringList
  },
  d: {
    alias: 'dry-run',
    describe: 'Only list what would be removed',
    type: 'boolean',
    default: false
  },
  r: {
    alias: 'recursive',
    describe: 'Descend down the collection tree',
    type: 'boolean',
    default: false
  },
  f: {
    alias: 'force',
    describe: 'Force deletion of non-empty collections',
    type: 'boolean',
    default: false
  }
}

export const builder = yargs => yargs.options(options).nargs({ i: 1, e: 1 })

/**
 * handle rm command
 * @param {RemoveOptions} argv options
 * @returns {Number} exit code
 */
export async function handler (argv) {
  if (argv.help) {
    return 0
  }
  const { paths, connectionOptions, recursive, force, dryRun } = argv
  const include = argv.include ?? []
  const exclude = argv.exclude ?? []

  const doubleWildcard = include.concat(exclude).find(pattern => pattern.includes('**'))
  if (doubleWildcard) {
    console.error(`Invalid pattern "${doubleWildcard}"; "**" is not supported yet`)
    process.exit(1)
  }

  const usePatterns = Boolean(include.length || exclude.length)
  const normalized = paths.map(path => normalizeDbPath(assertAbsoluteDbPath(path)))

  // in pattern mode the given paths are the collections to search;
  // each computed deletion is guarded against protected paths in the query
  if (!usePatterns && guardProtectedPaths(normalized)) {
    return 1
  }

  // an exclude-only pattern set removes everything that is not excluded
  const includeGlobs = include.length ? include : ['*']

  const db = getXmlRpcClient(connectionOptions)

  return rm(db, normalized, {
    debug: argv.debug,
    recursive,
    force,
    dryRun,
    usePatterns,
    includePatterns: usePatterns ? includeGlobs.map(toRegExpPattern) : [],
    excludePatterns: usePatterns ? exclude.map(toRegExpPattern) : []
  })
}
