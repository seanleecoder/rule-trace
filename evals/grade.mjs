#!/usr/bin/env node
// Deterministic grader for a migrate eval: run AFTER an agent has migrated a
// fixture copy. The skill's own validator is the oracle, so "did migrate
// produce a correct traceable rule set?" is largely objective.
//
// Score = 1 only if the validator passes AND a catalog + the convention doc
// exist AND at least one rule was produced. Subjective coverage ("every source
// rule represented, none invented") is left to an LLM-judge assertion in the
// harness — this script handles everything checkable by machine.
//
// Usage: node evals/grade.mjs --root <migrated-fixture-dir> [--json]

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { loadConfig, scanRuleHeadings, loadCatalog } from '../skills/rule-trace/scripts/lib/rules.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const VALIDATOR = path.resolve(here, '..', 'skills/rule-trace/scripts/validate-rules.mjs')

function parseArgs(argv) {
  const args = { root: process.cwd(), json: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') args.root = path.resolve(argv[++i])
    else if (argv[i] === '--json') args.json = true
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
const config = loadConfig(args.root)

// Validator (the oracle), via --json.
let validator = { errors: ['validator did not run'], warnings: [] }
const res = spawnSync(process.execPath, [VALIDATOR, '--root', args.root, '--json'], { encoding: 'utf8' })
try {
  validator = JSON.parse(res.stdout)
} catch {
  /* leave default */
}

const ruleCount = (() => {
  try {
    return scanRuleHeadings(args.root, config).byId.size
  } catch {
    return 0
  }
})()
const catalogRows = (() => {
  try {
    return loadCatalog(args.root, config).length
  } catch {
    return 0
  }
})()
const catalogExists = fs.existsSync(path.join(args.root, config.catalogPath))
const conventionPath = path.join(args.root, '.agents/rule-trace.md')
const conventionExists = fs.existsSync(conventionPath)
const traceTemplateFields = [
  'Rule trace',
  'Candidate rules loaded',
  'Rules applied',
  'Sources',
  'Reasoning note',
  'Deviations',
]
const conventionHasTraceTemplate =
  conventionExists &&
  traceTemplateFields.every(field =>
    fs.readFileSync(conventionPath, 'utf8').includes(field),
  )

const validatorPass = (validator.errors || []).length === 0
const score = validatorPass && catalogExists && conventionHasTraceTemplate && ruleCount > 0 ? 1 : 0

const result = {
  score,
  validatorPass,
  ruleCount,
  catalogRows,
  catalogExists,
  conventionExists,
  conventionHasTraceTemplate,
  validatorErrors: validator.errors || [],
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`score: ${score}`)
  console.log(`  validator: ${validatorPass ? 'pass' : 'FAIL'} (${(validator.errors || []).length} errors)`)
  console.log(
    `  rules: ${ruleCount}, catalog rows: ${catalogRows}, catalog: ${catalogExists}, convention doc: ${conventionExists}, trace template: ${conventionHasTraceTemplate}`,
  )
  for (const e of (validator.errors || []).slice(0, 8)) console.log(`    ✗ ${e}`)
}
process.exit(0)
