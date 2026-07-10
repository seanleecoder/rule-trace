#!/usr/bin/env node
// Materialize generated importers from canonical rule-trace files.

import path from 'node:path'
import process from 'node:process'
import { generatedImporterStatus, loadConfig, writeGeneratedImporter } from './lib/rules.mjs'

function parseArgs(argv) {
  const args = { root: process.cwd(), check: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = path.resolve(argv[++i])
    else if (argv[i] === '--check') args.check = true
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const config = loadConfig(args.root)
const importers = (config.importers || []).filter(i => i.type === 'generated')
const stale = []

for (const importer of importers) {
  if (args.check) {
    const status = generatedImporterStatus(args.root, config, importer)
    if (status.state === 'fresh') console.log(`  unchanged ${importer.path}`)
    else {
      stale.push(importer.path)
      console.log(`  stale ${importer.path}`)
    }
  } else {
    const action = writeGeneratedImporter(args.root, config, importer)
    console.log(`  ${action} ${importer.path}`)
  }
}

if (!importers.length) console.log('  no generated importers configured')
if (stale.length) {
  console.error(`  ✗ generated importers are stale; run rule-trace sync: ${stale.join(', ')}`)
  process.exit(1)
}
process.exit(0)
