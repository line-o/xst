import { statSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Bottleneck from 'bottleneck'
import fg from 'fast-glob'
import chalk from 'chalk'
import { getXmlRpcClient, getMimeType } from '@existdb/node-exist'

import { logFailure, logSuccess } from '../utility/message.js'
import { formatErrorMessage, isNetworkError } from '../utility/errors.js'
import { getServerUrl, getUserInfo } from '../utility/connection.js'
import { stringList } from '../utility/options.js'

/**
 * @typedef { import("../utility/account.js").AccountInfo } AccountInfo
 */

/**
 * @typedef {0|1|2|9} ExitCode
 */

/**
 * @typedef {Object} CollectionCreateResult
 * @prop {Boolean} exists the collection exists
 * @prop {Boolean} created the collection was created
 */

/**
 * Upload a single resource into an existdb instance
 * @param {String} path
 * @param {String} root
 * @param {String} baseCollection
 * @returns {Promise<Boolean>} upload success
 */
async function uploadResource (db, verbose, path, root, baseCollection, targetName) {
  try {
    const localFilePath = resolve(root, path)
    const remoteFilename = targetName || path
    const remoteFilePath = baseCollection + '/' + remoteFilename
    const fileContents = readFileSync(localFilePath)
    const fileHandle = await db.documents.upload(fileContents)
    const options = {}
    if (!getMimeType(path)) {
      console.log('fallback mimetype for', path)
      options.mimetype = 'application/octet-stream'
    }
    await db.documents.parseLocal(fileHandle, remoteFilePath, options)
    if (verbose) {
      logSuccess(`${chalk.white(path)} uploaded`)
    }
    return true
  } catch (e) {
    if (verbose) { handleError(e, path) }
    return false
  }
}

/**
 * Create a collection in an existdb instance
 * @param {String} collection
 * @param {String} baseCollection
 * @returns {Promise<CollectionCreateResult>} upload success
 */
async function createCollection (db, verbose, collection, baseCollection) {
  const absCollection = baseCollection +
    (collection.startsWith('/') ? '' : '/') +
    collection

  try {
    if (await db.collections.existsAndCanOpen(absCollection)) {
      if (verbose) {
        logSuccess(`${chalk.white(absCollection)} exists`)
      }
      return { exists: true, created: false }
    }
    await db.collections.create(absCollection)
    if (verbose) {
      logSuccess(`${chalk.white(absCollection)} created`)
    }
    return { exists: true, created: true }
  } catch (e) {
    if (verbose) { handleError(e, absCollection) }
    return { exists: false, created: false }
  }
}

/**
 * Handle errors uploading a resource or creating a collection
 * @param {Error} error
 * @param {String} path
 */
function handleError (error, path) {
  logFailure(`${chalk.white(path)} ${formatErrorMessage(error)}`)
  if (isNetworkError(error)) {
    throw error
  }
}

/**
 * Upload a single file or an entire directory tree to a db into a target collection
 * @param {String} source filesystem path
 * @param {String} target target collection
 * @param {{pattern: [String], threads: Number, mintime: Number}} options
 * @returns {Promise<ExitCode>} exit code
 */
async function uploadFileOrFolder (db, source, target, options) {
  // read parameters
  const root = resolve(source)

  const start = Date.now()
  const rootStat = statSync(source)

  if (options.verbose) {
    console.log(`Uploading ${chalk.white(resolve(source))}`)
    console.log(`To ${chalk.white(target)}`)
    console.log(`On ${chalk.white(getServerUrl(db))}`)
    console.log(`As ${chalk.white(db.connection.user)}`)
    if (options.include.length) {
      console.log(`Include ${chalk.green(options.include)}`)
    }
    if (options.exclude.length) {
      console.log(`Exclude ${chalk.yellow(options.exclude)}`)
    }
    console.log('')
  }

  if (rootStat.isFile()) {
    const parts = source.split('/')
    const name = parts.pop()
    const dir = parts.join('/')
    if (options.verbose) {
      console.log('Uploading a single file')
    }
    if (options.dryRun) {
      console.log(name)
      return 0
    }
    // ensure target collection exists
    const targetExistsAndCanOpen = await db.collections.existsAndCanOpen(target)
    if (!targetExistsAndCanOpen) {
      console.error(`Target ${target} must be an existing collection.`)
      return 1
    }
    const uploadSuccess = await uploadResource(db, options.verbose, name, dir, target)
    if (uploadSuccess) {
      const time = Date.now() - start
      console.log(`Uploaded ${chalk.white(resolve(source))} to ${chalk.white(target)} in ${chalk.yellow(time + 'ms')}`)
      return 0
    }
    console.error(`Upload of ${resolve(source)} failed.`)
    return 1
  }

  const globbingOptions = { ignore: options.exclude, unique: true, cwd: source, dot: options.dotFiles }
  const collectionGlob = Object.assign({ onlyDirectories: true }, globbingOptions)
  const resourceGlob = Object.assign({ onlyFile: true }, globbingOptions)

  const collections = await fg(options.include, collectionGlob)
  const resources = await fg(options.include, resourceGlob)

  if (resources.length === 0 && collections.length === 0) {
    console.error(chalk.yellow('Nothing matched'))
    return 9
  }

  if (options.verbose) {
    console.log('Uploading directory tree')
  }

  const confCols = new Map()
  let xConf = []
  if (options.applyXconf) {
    // are there collection.xconf files in the resources?
    // copy them over to the appropriate place
    xConf = resources.filter(r => /\.xconf$/.test(r))
    const parts = xConf.map(r => (target + '/' + r).split('/').slice(1, -1))

    for (const pathParts of parts) {
      let tmpPath = ''
      for (const p of pathParts) {
        tmpPath += '/' + p
        if (confCols.has(tmpPath)) { continue }
        confCols.set(tmpPath, true)
      }
    }
  }

  if (options.dryRun) {
    if (options.applyXconf && xConf.length) {
      console.log('Index configurations:')
      console.log(xConf.join('\n'))
      console.log('')
    }
    if (collections.length) {
      console.log('Collections:')
      console.log(collections.join('\n'))
      console.log('')
    }
    console.log('Resources:')
    console.log(resources.join('\n'))
    console.log('')
    return 0
  }

  // ensure target collection exists
  collections.unshift('')

  const limiter = new Bottleneck({
    // also use maxConcurrent and/or minTime for safety
    maxConcurrent: options.threads,
    minTime: options.mintime // pick a value that makes sense for your use case
  })
  const createCollectionThrottled = limiter.wrap(createCollection.bind(null, db, options.verbose))
  const uploadResourceThrottled = limiter.wrap(uploadResource.bind(null, db, options.verbose))

  // create all collections upfront
  const collectionsUploadResults = await Promise.all(
    collections.map(
      c => createCollectionThrottled(c, target)))

  // requires user to be a member of DBA
  // apply collection configurations
  if (options.applyXconf) {
    for (const cpath of confCols.keys()) {
      createCollectionThrottled(cpath, '/db/system/config')
    }
    await Promise.all(
      xConf.map(
        conf => uploadResourceThrottled(conf, root, '/db/system/config' + target)))
  }

  const resourceUploadResults = await Promise.all(
    resources.map(
      resourcePath => uploadResourceThrottled(resourcePath, root, target)))

  const createdCollections = collectionsUploadResults.filter(r => r.created).length
  const uploadedResources = resourceUploadResults.filter(r => r).length
  const time = Date.now() - start
  console.log(`Created ${chalk.white(createdCollections + ' collections')} and uploaded ${chalk.white(uploadedResources + ' resources')} in ${chalk.yellow(time + 'ms')}`)

  if (collectionsUploadResults.filter(r => !r.exists).length ||
    resourceUploadResults.filter(r => !r).length) {
    console.error(chalk.redBright('Upload finished with errors!'))
    return 2
  }

  return 0
}

export const command = ['upload <source> <target>', 'up']
export const describe = 'Upload files and directories'

export function builder (yargs) {
  yargs
    .positional('target', {
      type: 'string',
      normalize: false
    })
    .positional('source', {
      type: 'string',
      normalize: true
    })
    .option('i', {
      alias: 'include',
      describe: 'Include only files matching one or more of include patterns (comma separated)',
      default: '**',
      ...stringList
    })
    .option('e', {
      alias: 'exclude',
      describe: 'Exclude any file matching one or more of exclude patterns (comma separated)',
      default: [],
      ...stringList
    })
    .option('v', {
      alias: 'verbose',
      describe: 'Log every file and resource that was created',
      type: 'boolean',
      default: false
    })
    .option('d', {
      alias: 'dry-run',
      describe: 'Show what would be uploaded',
      type: 'boolean'
    })
    .option('t', {
      alias: 'threads',
      describe: 'The maximum number of concurrent threads that will be used to upload data',
      type: 'number',
      default: 4
    })
    .option('m', {
      alias: 'mintime',
      describe: 'The minimum time each upload will take',
      type: 'number',
      default: 0
    })
    .option('a', {
      alias: 'apply-xconf',
      describe: 'Upload and apply index configurations that are in the fileset first before all other data is uploaded. The user must be a member of the dba group.',
      default: false,
      type: 'boolean'
    })
    .option('D', {
      alias: 'dot-files',
      describe: 'Upload dot-files as well. This is off by default to prevent uploading of local IDE settings and the entire git-repository by accident.',
      default: false,
      type: 'boolean'
    })
    .nargs({ i: 1, e: 1 })
}

export async function handler (argv) {
  if (argv.help) {
    return 0
  }

  const { threads, mintime, source, target } = argv

  if (typeof mintime !== 'number' || mintime < 0) {
    throw Error('Invalid value for option "mintime"; must be an integer equal or greater than zero.')
  }
  if (typeof threads !== 'number' || threads <= 0) {
    throw Error('Invalid value for option "threads"; must be an integer equal or greater than zero.')
  }

  if (!existsSync(source)) {
    throw Error(source + ' not found!')
  }

  const db = getXmlRpcClient(argv.connectionOptions)

  const accountInfo = await getUserInfo(db)
  const isAdmin = accountInfo.groups.includes('dba')
  if (argv.applyXconf && !isAdmin) {
    throw Error('To apply collection configurations you must be member of the dba group.')
  }

  try {
    const code = await uploadFileOrFolder(db, source, target, argv)
    process.exit(code)
  } catch (e) {
    handleError(e, target)
    // process.exit(1)
  }
}
