/**
 * Shared handling of database collection and resource paths.
 *
 * Semantics:
 * - database paths must be absolute (leading slash)
 * - "/" is an alias for "/db", the root collection
 * - trailing slashes are ignored
 */

/**
 * Ensure a database path is absolute.
 * Throws with a helpful hint otherwise.
 * @param {String} path database path
 * @returns {String} the path, unchanged
 */
export function assertAbsoluteDbPath (path) {
  if (typeof path !== 'string' || path === '') {
    throw Error('Invalid path: database paths must be non-empty strings.')
  }
  if (!path.startsWith('/')) {
    const hint = path === 'db' || path.startsWith('db/')
      ? '/' + path
      : '/db/' + path
    throw Error(
      `Invalid path "${path}": database paths must be absolute. Did you mean "${hint}"?`)
  }
  return path
}

/**
 * Canonicalize an absolute database path.
 * Strips trailing slashes, resolves "/" to "/db".
 * @param {String} path absolute database path
 * @returns {String} normalized path
 */
export function normalizeDbPath (path) {
  let normalized = path
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.substring(0, normalized.length - 1)
  }
  if (normalized === '/') {
    return '/db'
  }
  return normalized
}
