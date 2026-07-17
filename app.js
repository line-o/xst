#!/usr/bin/env node

import yargs from 'yargs'
import chalk from 'chalk'
import { commands } from './commands/index.js'
import { handleError } from './utility/errors.js'
import { hideBin } from 'yargs/helpers'
import { readConnection } from './utility/connection.js'
import { configure } from './utility/configure.js'

// colored terminal output
const bb = chalk.blackBright
const ma = chalk.magenta
const rb = chalk.redBright
const yl = chalk.yellow

/**
 * if package was linked to global strip relative path from output
 * @param {String} $0 raw value of argv.$0
 * @returns {String} script name with relative path stripped if linked
 */
function getScriptName ($0) {
  if ($0.startsWith('.')) {
    return $0.substring($0.lastIndexOf('/') + 1)
  }
  return $0
}

function showCompletionHelp (scriptName) {
  console.log(`
${bb('Install command completions for ZSH and BASH')}
  ${scriptName} completion`)
}

function showExamples (scriptName) {
  console.log(`
${bb('Examples:')}
  ${scriptName} run 'count(//p)'
  ${scriptName} list --tree --depth 1 /db/apps
  ${scriptName} package install from-registry demo-apps
`)
}

function showLogo () {
  console.log('\n' +
    ma`  ╲ ╱  ╓───  ──┰──` + '\n' +
    rb`   ╳   ╰───╮   │  ` + '\n' +
    yl`  ╱ ╲  ▂▁▁▁│   ┇  ` + '\n'
  )
  console.log(yl`A modern command line interface for exist-db`)
}

const parser = yargs(hideBin(process.argv))
  .config('config', 'Read configuration file', configure)
  .middleware(readConnection)
  .usageConfiguration({ 'hide-types': true })
  .completion('completion', false)
  .strictCommands(true)
  .strictOptions(false)
  .help()
  .command('$0 [<command>]', 'Interact with an eXist-db', () => {}, async (argv) => {
    if (argv.command) {
      console.error(`Command "${argv.command}" not recognized.
Try xst --help`)
    }

    showLogo()
    const scriptName = getScriptName(argv.$0)
    showCompletionHelp(scriptName)
    // append examples
    showExamples(scriptName)
  })
  .command(commands)
  // .recommendCommands()
  .fail(false)

parser.wrap(parser.terminalWidth())

try {
  await parser.parse()
} catch (error) {
  handleError(error)
  parser.getHelp()
  process.exit(1)
}
