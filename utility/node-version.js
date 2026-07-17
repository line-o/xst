import { satisfies } from 'semver'

/**
 * Check if a Node.js version satisfies a semver range.
 * Used by the launcher (cli.js) to guard against unsupported
 * Node.js versions before any third-party code is imported.
 * Only 'semver' may be imported here — it is CJS and parses on
 * ancient Node.js versions.
 * @param {String} version Node.js version (e.g. process.versions.node)
 * @param {String} range semver range (e.g. engines.node from package.json)
 * @returns {Boolean} true if the version satisfies the range
 */
export function isSupported (version, range) {
  return satisfies(version, range)
}
