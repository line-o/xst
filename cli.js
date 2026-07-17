#!/usr/bin/env node

// This launcher must parse and run on unsupported Node.js versions to be
// able to fail with a friendly error message (see #291). Its static import
// graph must contain no third-party code except 'semver' (CJS, runs on
// ancient Node.js). The actual CLI is loaded via dynamic import below.
import { readFileSync } from 'node:fs'
import { isSupported } from './utility/node-version.js'

const { engines } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url)))

if (!isSupported(process.versions.node, engines.node)) {
  console.error(
    `Unsupported Node.js version: ${process.version}\n` +
    `xst requires Node.js ${engines.node}.\n` +
    'Please install a supported version to run xst, e.g. from https://nodejs.org/')
  process.exit(1)
}

try {
  await import('./app.js')
} catch (error) {
  // Belt and braces: a SyntaxError raised while loading the import chain
  // points at an incompatible runtime as well (e.g. exotic setups where
  // the reported version passes the check above).
  if (error instanceof SyntaxError) {
    console.error(
      `${error.message}\n` +
      `xst requires Node.js ${engines.node} (you are running ${process.version}).`)
    process.exit(1)
  }
  throw error
}
